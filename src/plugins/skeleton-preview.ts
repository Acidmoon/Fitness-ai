import { createHash } from 'node:crypto';
import { Service, type Context } from 'cordis';
import { FitnessError } from '../contracts.ts';
import type { AuthPrincipal, FitnessAuth } from '../auth-contracts.ts';
import { DatabaseQueryError, type DatabaseRow, type DatabaseSession } from '../database-contracts.ts';
import { jsonResponse, type HttpRequest, type HttpResponse } from '../http-contracts.ts';
import type { MotionAnalysis, PoseSequence } from '../vision-contracts.ts';
import {
  compactPoseTrack,
  parsePoseTrack,
  POSE_TRACK_MAX_BYTES,
  type FitnessSkeletonPreview,
  type PoseTrack,
  type PoseTrackReceipt,
  type RenderedSkeletonGif,
} from '../skeleton-contracts.ts';
import { encodeSkeletonGif, skeletonEtagForHash } from '../skeleton-gif.ts';

/**
 * Skeleton preview plugin (`fitnessSkeletonPreview`).
 *
 * Persists only compact, encrypted {@link PoseTrack} payloads in PostgreSQL
 * (`fitness_users.workout_pose_tracks`, scoped by tenant RLS and workout
 * ownership) and renders animated GIF89a previews on demand with a bounded
 * plugin-owned in-memory LRU cache. Raw videos and GIF files are never written
 * to persistent storage, and plaintext keypoints are never logged.
 */

export interface SkeletonPreviewConfig {
  /** Maximum total byte budget for the in-memory rendered GIF LRU cache (0 disables caching). */
  readonly maxCacheBytes?: number;
}

const UUID = /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const DEFAULT_MAX_CACHE_BYTES = 8 * 1024 * 1024;
const MAX_RAW_BODY_BYTES = 128 * 1024;
const CACHE_CONTROL_PRIVATE = 'private, max-age=86400';

interface Owner {
  readonly tenantId: string;
  readonly userId: string;
}

type TrackRow = DatabaseRow & {
  content_sha256: string;
  sealed_track: string;
};

type UpsertRow = DatabaseRow & {
  updated_at: Date | string;
};

function parseUuid(value: unknown, label = 'id'): string {
  if (typeof value !== 'string' || !UUID.test(value)) {
    throw new FitnessError('INVALID_ARGUMENTS', `${label} 必须是 UUID`);
  }
  return value.toLowerCase();
}

function ownerOf(principal: AuthPrincipal): Owner {
  if (!principal || typeof principal !== 'object' || Array.isArray(principal)) {
    throw new FitnessError('AUTH_UNAUTHENTICATED', '鉴权主体无效');
  }
  const data = principal as unknown as Record<string, unknown>;
  for (const key of Object.keys(data)) {
    if (!['schemaVersion', 'tenantId', 'userId', 'sessionId'].includes(key)) {
      throw new FitnessError('AUTH_UNAUTHENTICATED', '鉴权主体无效');
    }
  }
  if (data.schemaVersion !== '1.0') throw new FitnessError('AUTH_UNAUTHENTICATED', '鉴权主体无效');
  parseUuid(data.sessionId, 'sessionId');
  return Object.freeze({
    tenantId: parseUuid(data.tenantId, 'tenantId'),
    userId: parseUuid(data.userId, 'userId'),
  });
}

function iso(value: Date | string): string {
  return new Date(value).toISOString();
}

function resolveCacheLimit(configured?: number): number {
  if (configured !== undefined) {
    if (!Number.isInteger(configured) || configured < 0 || configured > 256 * 1024 * 1024) {
      throw new FitnessError('INVALID_ARGUMENTS', 'maxCacheBytes 必须是 0–268435456 的整数');
    }
    return configured;
  }
  const envRaw = process.env.FITNESS_SKELETON_CACHE_BYTES;
  if (envRaw === undefined || !envRaw.trim()) return DEFAULT_MAX_CACHE_BYTES;
  const parsed = Number(envRaw);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 256 * 1024 * 1024) {
    throw new FitnessError('INVALID_ARGUMENTS', 'FITNESS_SKELETON_CACHE_BYTES 必须是 0–268435456 的整数');
  }
  return parsed;
}

function extractBearer(request: HttpRequest): string {
  const header = request.headers['authorization'];
  const match = typeof header === 'string' ? /^Bearer ([A-Za-z0-9_-]{1,512})$/i.exec(header) : null;
  if (!match) throw new FitnessError('AUTH_UNAUTHENTICATED', '缺少有效的 Bearer 令牌');
  return match[1]!;
}

function matchesIfNoneMatch(header: string | undefined, etag: string): boolean {
  if (!header) return false;
  const trimmed = header.trim();
  if (trimmed === '*') return true;
  for (const part of trimmed.split(',')) {
    const candidate = part.trim().replace(/^W\//i, '');
    if (candidate === etag) return true;
  }
  return false;
}

export class SkeletonPreviewPlugin extends Service implements FitnessSkeletonPreview {
  static provide = 'fitnessSkeletonPreview';
  static inject = ['fitnessDatabase', 'fitnessUserDataProtection'];

  private readonly maxCacheBytes: number;
  private readonly gifCache = new Map<string, RenderedSkeletonGif>();
  private cacheBytes = 0;
  private closed = false;
  private readonly pending = new Set<Promise<unknown>>();

  constructor(ctx: Context, config: SkeletonPreviewConfig = {}) {
    super(ctx, 'fitnessSkeletonPreview');
    this.maxCacheBytes = resolveCacheLimit(config.maxCacheBytes);
    ctx.effect(() => async () => {
      this.closed = true;
      this.clearCache();
      await Promise.allSettled([...this.pending]);
    });
    // Register HTTP routes only when both the HTTP entry point and auth service are mounted.
    ctx.inject(['fitnessHttp', 'fitnessAuth'], sub => {
      const auth = sub.fitnessAuth;
      sub.effect(() => sub.fitnessHttp.register({
        method: 'PUT',
        path: '/api/workouts/{id}/pose-track',
        handler: request => this.handlePutTrack(auth, request),
      }));
      sub.effect(() => sub.fitnessHttp.register({
        method: 'GET',
        path: '/api/workouts/{id}/skeleton.gif',
        handler: request => this.handleGetGif(auth, request),
      }));
      sub.effect(() => sub.fitnessHttp.register({
        method: 'GET',
        path: '/api/workouts/{id}/pose-track',
        handler: request => this.handleGetTrack(auth, request),
      }));
    });
  }

  compact(poses: PoseSequence, motion: MotionAnalysis): PoseTrack {
    return compactPoseTrack(poses, motion);
  }

  encodeGif(track: PoseTrack): RenderedSkeletonGif {
    return encodeSkeletonGif(parsePoseTrack(track));
  }

  private run<T>(tenantId: string, action: (session: DatabaseSession) => Promise<T>): Promise<T> {
    if (this.closed) return Promise.reject(new FitnessError('CANCELLED', '骨架预览插件已卸载'));
    const operation = this.ctx.fitnessDatabase.transaction(async session => {
      await session.query("SELECT set_config('fitness.tenant_id', $1, true)", [tenantId]);
      const tenant = await session.query('SELECT id FROM fitness_users.tenants WHERE id=$1', [tenantId]);
      if (!tenant.rowCount) throw new FitnessError('TENANT_NOT_FOUND', '租户不存在或不可访问');
      return action(session);
    });
    this.pending.add(operation);
    return operation.finally(() => { this.pending.delete(operation); });
  }

  private aadContext(owner: Owner, workoutId: string): readonly string[] {
    return ['pose-track', owner.tenantId, owner.userId, workoutId];
  }

  private openTrack(owner: Owner, workoutId: string, sealed: string): PoseTrack {
    let plaintext: string;
    try {
      plaintext = this.ctx.fitnessUserDataProtection.open(this.aadContext(owner, workoutId), sealed);
    } catch {
      throw new FitnessError('DATA_PROTECTION_FAILED', '骨架轨迹解密失败');
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(plaintext);
    } catch {
      throw new FitnessError('DATA_PROTECTION_FAILED', '骨架轨迹解密失败');
    }
    try {
      return parsePoseTrack(parsed);
    } catch {
      throw new FitnessError('DATA_PROTECTION_FAILED', '骨架轨迹格式校验失败');
    }
  }

  private cachePrefix(owner: Owner, workoutId: string): string {
    return `${owner.tenantId}:${owner.userId}:${workoutId}:`;
  }

  private cacheKey(owner: Owner, workoutId: string, contentSha256: string): string {
    return `${this.cachePrefix(owner, workoutId)}${contentSha256}`;
  }

  private getCached(key: string): RenderedSkeletonGif | undefined {
    const hit = this.gifCache.get(key);
    if (!hit) return undefined;
    // Refresh LRU order.
    this.gifCache.delete(key);
    this.gifCache.set(key, hit);
    return hit;
  }

  private putCached(key: string, gif: RenderedSkeletonGif): void {
    if (this.maxCacheBytes === 0 || gif.bytes.byteLength > this.maxCacheBytes) return;
    const existing = this.gifCache.get(key);
    if (existing) {
      this.cacheBytes -= existing.bytes.byteLength;
      this.gifCache.delete(key);
    }
    while (this.cacheBytes + gif.bytes.byteLength > this.maxCacheBytes && this.gifCache.size > 0) {
      const oldestKey = this.gifCache.keys().next().value as string;
      const oldest = this.gifCache.get(oldestKey)!;
      this.gifCache.delete(oldestKey);
      this.cacheBytes -= oldest.bytes.byteLength;
    }
    this.gifCache.set(key, gif);
    this.cacheBytes += gif.bytes.byteLength;
  }

  private invalidateOwnerWorkout(owner: Owner, workoutId: string): void {
    const prefix = this.cachePrefix(owner, workoutId);
    for (const [key, value] of this.gifCache.entries()) {
      if (key.startsWith(prefix)) {
        this.gifCache.delete(key);
        this.cacheBytes -= value.bytes.byteLength;
      }
    }
  }

  private clearCache(): void {
    this.gifCache.clear();
    this.cacheBytes = 0;
  }

  async save(principal: AuthPrincipal, workoutId: string, value: unknown): Promise<PoseTrackReceipt> {
    const owner = ownerOf(principal);
    const id = parseUuid(workoutId, 'workoutId');
    const track = parsePoseTrack(value);
    const canonical = JSON.stringify(track);
    const bytes = Buffer.byteLength(canonical, 'utf8');
    if (bytes > POSE_TRACK_MAX_BYTES) {
      throw new FitnessError('POSE_TRACK_TOO_LARGE', `骨架轨迹超过 ${POSE_TRACK_MAX_BYTES} 字节上限`);
    }
    const contentSha256 = createHash('sha256')
      .update(`${owner.tenantId}:${owner.userId}:${id}:${canonical}`)
      .digest('hex');
    const sealed = this.ctx.fitnessUserDataProtection.seal(this.aadContext(owner, id), canonical);

    try {
      const row = await this.run(owner.tenantId, async session => {
        // Enforce workout ownership inside the same tenant-scoped RLS transaction.
        const owned = await session.query(
          'SELECT id FROM fitness_users.workout_records WHERE tenant_id=$1 AND user_id=$2 AND id=$3',
          [owner.tenantId, owner.userId, id],
        );
        if (!owned.rowCount) throw new FitnessError('WORKOUT_NOT_FOUND', '运动历史不存在');

        const result = await session.query<UpsertRow>(
          `INSERT INTO fitness_users.workout_pose_tracks
            (tenant_id, workout_id, user_id, schema_version, frame_count, fps, payload_bytes, content_sha256, sealed_track, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, clock_timestamp())
           ON CONFLICT (tenant_id, workout_id) DO UPDATE SET
             schema_version = EXCLUDED.schema_version,
             frame_count = EXCLUDED.frame_count,
             fps = EXCLUDED.fps,
             payload_bytes = EXCLUDED.payload_bytes,
             content_sha256 = EXCLUDED.content_sha256,
             sealed_track = EXCLUDED.sealed_track,
             updated_at = clock_timestamp()
           WHERE fitness_users.workout_pose_tracks.user_id = EXCLUDED.user_id
           RETURNING updated_at`,
          [owner.tenantId, id, owner.userId, track.schemaVersion, track.frames.length, track.fps, bytes, contentSha256, sealed],
        );
        const saved = result.rows[0];
        if (!saved) throw new FitnessError('WORKOUT_NOT_FOUND', '运动历史不存在');
        return saved;
      });
      this.invalidateOwnerWorkout(owner, id);
      return Object.freeze({
        schemaVersion: '1.0' as const,
        workoutId: id,
        frames: track.frames.length,
        fps: track.fps,
        bytes,
        updatedAt: iso(row.updated_at),
      });
    } catch (error) {
      if (error instanceof DatabaseQueryError && error.sqlState !== undefined && /^(22|23)/.test(error.sqlState)) {
        throw new FitnessError('POSE_TRACK_INVALID', '骨架轨迹违反数据库约束');
      }
      throw error;
    }
  }

  private async fetchRow(owner: Owner, workoutId: string): Promise<TrackRow> {
    const result = await this.run(owner.tenantId, session => session.query<TrackRow>(
      `SELECT content_sha256, sealed_track FROM fitness_users.workout_pose_tracks
       WHERE tenant_id=$1 AND user_id=$2 AND workout_id=$3`,
      [owner.tenantId, owner.userId, workoutId],
    ));
    const row = result.rows[0];
    if (!row) throw new FitnessError('POSE_TRACK_NOT_FOUND', '该运动记录没有骨架预览轨迹');
    return row;
  }

  async get(principal: AuthPrincipal, workoutId: string): Promise<PoseTrack> {
    const owner = ownerOf(principal);
    const id = parseUuid(workoutId, 'workoutId');
    const row = await this.fetchRow(owner, id);
    return this.openTrack(owner, id, row.sealed_track);
  }

  async renderGif(principal: AuthPrincipal, workoutId: string): Promise<RenderedSkeletonGif> {
    const owner = ownerOf(principal);
    const id = parseUuid(workoutId, 'workoutId');
    const row = await this.fetchRow(owner, id);
    return this.renderRow(owner, id, row);
  }

  private renderRow(owner: Owner, workoutId: string, row: TrackRow): RenderedSkeletonGif {
    const key = this.cacheKey(owner, workoutId, row.content_sha256);
    const cached = this.getCached(key);
    if (cached) return cached;
    const track = this.openTrack(owner, workoutId, row.sealed_track);
    const encoded = encodeSkeletonGif(track);
    const etag = skeletonEtagForHash(row.content_sha256);
    const result: RenderedSkeletonGif = Object.freeze({
      bytes: encoded.bytes,
      width: encoded.width,
      height: encoded.height,
      frameCount: encoded.frameCount,
      etag,
    });
    this.putCached(key, result);
    return result;
  }

  private async authenticate(auth: FitnessAuth, request: HttpRequest): Promise<AuthPrincipal> {
    const token = extractBearer(request);
    return await auth.authenticate(token);
  }

  private async handlePutTrack(auth: FitnessAuth, request: HttpRequest): Promise<HttpResponse> {
    const principal = await this.authenticate(auth, request);
    const workoutId = parseUuid(request.params['id'] ?? '', 'id');
    if (Buffer.byteLength(request.body, 'utf8') > MAX_RAW_BODY_BYTES) {
      throw new FitnessError('POSE_TRACK_TOO_LARGE', `骨架轨迹请求体超过上限`);
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(request.body);
    } catch {
      throw new FitnessError('INVALID_ARGUMENTS', '请求体必须是合法 JSON');
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new FitnessError('POSE_TRACK_INVALID', 'poseTrack 必须是 JSON 对象');
    }
    const raw = parsed as Record<string, unknown>;
    for (const forbidden of ['tenantId', 'userId', 'actorId', 'verified', 'principal'] as const) {
      if (forbidden in raw) {
        throw new FitnessError('INVALID_ARGUMENTS', `请求体不得包含身份字段：${forbidden}`);
      }
    }
    const receipt = await this.save(principal, workoutId, raw);
    return jsonResponse(200, receipt);
  }

  private async handleGetGif(auth: FitnessAuth, request: HttpRequest): Promise<HttpResponse> {
    const principal = await this.authenticate(auth, request);
    const owner = ownerOf(principal);
    const workoutId = parseUuid(request.params['id'] ?? '', 'id');
    const row = await this.fetchRow(owner, workoutId);
    const etag = skeletonEtagForHash(row.content_sha256);
    if (matchesIfNoneMatch(request.headers['if-none-match'], etag)) {
      return {
        status: 304,
        headers: {
          etag,
          'cache-control': CACHE_CONTROL_PRIVATE,
        },
        body: '',
      };
    }
    const gif = this.renderRow(owner, workoutId, row);
    return {
      status: 200,
      headers: {
        'content-type': 'image/gif',
        'cache-control': CACHE_CONTROL_PRIVATE,
        etag: gif.etag,
      },
      body: gif.bytes,
    };
  }

  private async handleGetTrack(auth: FitnessAuth, request: HttpRequest): Promise<HttpResponse> {
    const principal = await this.authenticate(auth, request);
    const owner = ownerOf(principal);
    const workoutId = parseUuid(request.params['id'] ?? '', 'id');
    const row = await this.fetchRow(owner, workoutId);
    const etag = `"track-${row.content_sha256.slice(0, 16)}-v1"`;
    if (matchesIfNoneMatch(request.headers['if-none-match'], etag)) {
      return {
        status: 304,
        headers: {
          etag,
          'cache-control': CACHE_CONTROL_PRIVATE,
        },
        body: '',
      };
    }
    const track = this.openTrack(owner, workoutId, row.sealed_track);
    return {
      status: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': CACHE_CONTROL_PRIVATE,
        etag,
      },
      body: JSON.stringify(track),
    };
  }
}
