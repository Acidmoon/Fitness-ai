import { randomUUID } from 'node:crypto';
import { Service, type Context } from 'cordis';
import { FitnessError, type AdviceResult, type DimensionKey, type PolicyReference, type ScoreResult } from '../contracts.ts';
import { DatabaseQueryError, type DatabaseRow, type DatabaseSession } from '../database-contracts.ts';
import type { AuthPrincipal } from '../auth-contracts.ts';
import type {
  FitnessWorkoutHistory, WorkoutPage, WorkoutQuery, WorkoutRecord, WorkoutSource, WorkoutStatistics, WorkoutSummary,
} from '../history-contracts.ts';

/**
 * Workout history storage.
 *
 * The tenant and user of every call come from an {@link AuthPrincipal} resolved
 * by the authentication plugin; a request body never supplies them. Row level
 * security scopes every statement, so a missing row and a row of another tenant
 * are indistinguishable, and both surface as `WORKOUT_NOT_FOUND`.
 *
 * Only normalized aggregates are stored in plaintext columns. The scored
 * dimensions and the advice items are sealed as one encrypted envelope whose
 * associated data binds the tenant, the user and the record id.
 */

const UUID = /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/i;
const BASE64URL = /^[A-Za-z0-9_-]+$/;
const DIMENSION_KEYS: readonly string[] = ['completion', 'rangeOfMotion', 'stability', 'tempo'];
const MAX_CURSOR_LENGTH = 512;
const MAX_DETAIL_BYTES = 64 * 1024;

function invalid(message: string): never { throw new FitnessError('WORKOUT_INVALID', message); }
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid('输入必须是对象');
  return value as Record<string, unknown>;
}
function exact(data: Record<string, unknown>, allowed: readonly string[]): void {
  for (const key of Object.keys(data)) if (!allowed.includes(key)) invalid('输入包含未声明字段');
}
function text(value: unknown, name: string, max: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\x00-\x1f\x7f]/.test(value) ||
    /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(value)) invalid(`${name} 格式无效`);
  return value.trim();
}
function uuid(value: unknown, name = 'id'): string {
  if (typeof value !== 'string' || !UUID.test(value)) invalid(`${name} 必须是 UUID`);
  return value.toLowerCase();
}
function integer(value: unknown, name: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) invalid(`${name} 格式无效`);
  return value;
}
function number(value: unknown, name: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) invalid(`${name} 格式无效`);
  return value;
}
function timestamp(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.length > 40 || !TIMESTAMP.test(value) || Number.isNaN(Date.parse(value))) {
    invalid(`${name} 必须是 ISO 8601 时间`);
  }
  return new Date(value).toISOString();
}
function iso(value: Date | string): string { return new Date(value).toISOString(); }

/** `total_score` is `numeric(5,2)`; a third decimal would be rounded and then disagree with the sealed detail. */
function scoreTotal(value: unknown): number {
  const total = number(value, 'score.total', 0, 100);
  if (Math.abs(total * 100 - Math.round(total * 100)) > 1e-6) invalid('score.total 最多保留两位小数');
  return total;
}
function policy(value: unknown): PolicyReference {
  const data = object(value);
  exact(data, ['id', 'version', 'kind']);
  if (data.kind !== 'heuristic') invalid('policy.kind 仅支持 heuristic');
  if (typeof data.id !== 'string' || !/^[A-Za-z0-9._:-]{1,100}$/.test(data.id)) invalid('policy.id 格式无效');
  if (typeof data.version !== 'string' || !/^[A-Za-z0-9.+_-]{1,40}$/.test(data.version)) invalid('policy.version 格式无效');
  return Object.freeze({ id: data.id, version: data.version, kind: 'heuristic' as const });
}
function scoreResult(value: unknown): ScoreResult {
  const data = object(value);
  exact(data, ['policy', 'standard', 'total', 'dimensions', 'quality']);
  const reference = policy(data.policy);
  let standard: { readonly exerciseId: string; readonly sourceRevision: string } | undefined;
  if (data.standard !== undefined) {
    const raw = object(data.standard);
    exact(raw, ['exerciseId', 'sourceRevision']);
    standard = Object.freeze({
      exerciseId: text(raw.exerciseId, 'score.standard.exerciseId', 100),
      sourceRevision: text(raw.sourceRevision, 'score.standard.sourceRevision', 100),
    });
  }
  if (!Array.isArray(data.dimensions) || data.dimensions.length < 1 || data.dimensions.length > 32) invalid('score.dimensions 格式无效');
  const dimensions = data.dimensions.map(item => {
    const raw = object(item);
    exact(raw, ['key', 'label', 'value', 'weight', 'points']);
    if (typeof raw.key !== 'string' || !DIMENSION_KEYS.includes(raw.key)) invalid('score.dimensions[].key 格式无效');
    return Object.freeze({
      key: raw.key as DimensionKey,
      label: text(raw.label, 'score.dimensions[].label', 200),
      value: number(raw.value, 'score.dimensions[].value', 0, 100),
      weight: number(raw.weight, 'score.dimensions[].weight', 0, 1),
      points: number(raw.points, 'score.dimensions[].points', 0, 100),
    });
  });
  const qualityData = object(data.quality);
  exact(qualityData, ['observedRepetitions', 'evaluatedRepetitions', 'excludedRepetitions']);
  const quality = Object.freeze({
    observedRepetitions: integer(qualityData.observedRepetitions, 'score.quality.observedRepetitions', 0, 100_000),
    evaluatedRepetitions: integer(qualityData.evaluatedRepetitions, 'score.quality.evaluatedRepetitions', 0, 100_000),
    excludedRepetitions: integer(qualityData.excludedRepetitions, 'score.quality.excludedRepetitions', 0, 100_000),
  });
  return Object.freeze({
    policy: reference,
    ...(standard === undefined ? {} : { standard }),
    total: scoreTotal(data.total),
    dimensions: Object.freeze(dimensions),
    quality,
  });
}
function adviceResult(value: unknown): AdviceResult {
  const data = object(value);
  exact(data, ['policy', 'items']);
  const reference = policy(data.policy);
  if (!Array.isArray(data.items) || data.items.length > 64) invalid('advice.items 格式无效');
  const items = data.items.map(item => {
    const raw = object(item);
    exact(raw, ['code', 'message']);
    if (typeof raw.code !== 'string' || !/^[a-z][a-z0-9-]{0,63}$/.test(raw.code)) invalid('advice.items[].code 格式无效');
    return Object.freeze({ code: raw.code, message: text(raw.message, 'advice.items[].message', 1000) });
  });
  return Object.freeze({ policy: reference, items: Object.freeze(items) });
}

/** Score and advice as persisted inside the encrypted envelope. */
export function parseWorkoutDetail(value: unknown): { readonly score: ScoreResult; readonly advice: AdviceResult } {
  const data = object(value);
  exact(data, ['schemaVersion', 'score', 'advice']);
  if (data.schemaVersion !== '1.0') invalid('明细 schemaVersion 仅支持 1.0');
  return Object.freeze({ score: scoreResult(data.score), advice: adviceResult(data.advice) });
}

export interface NormalizedWorkoutInput {
  readonly sessionId: string;
  readonly exercise: string;
  readonly targetRepetitions: number;
  readonly observedRepetitions: number;
  readonly score: ScoreResult;
  readonly advice: AdviceResult;
  readonly source: WorkoutSource;
  readonly capturedAt: string | null;
}

export function parseWorkoutInput(value: unknown): NormalizedWorkoutInput {
  const data = object(value);
  exact(data, ['schemaVersion', 'sessionId', 'exercise', 'targetRepetitions', 'observedRepetitions', 'score', 'advice', 'source', 'capturedAt']);
  if (data.schemaVersion !== '1.0') invalid('schemaVersion 仅支持 1.0');
  const sessionId = text(data.sessionId, 'sessionId', 128);
  const exercise = text(data.exercise, 'exercise', 64);
  const targetRepetitions = integer(data.targetRepetitions, 'targetRepetitions', 1, 10_000);
  const observedRepetitions = integer(data.observedRepetitions, 'observedRepetitions', 0, 10_000);
  const score = scoreResult(data.score);
  const advice = adviceResult(data.advice);
  if (data.source !== 'video' && data.source !== 'json') invalid('source 仅支持 video 或 json');
  const capturedAt = data.capturedAt === undefined ? null : timestamp(data.capturedAt, 'capturedAt');
  return Object.freeze({ sessionId, exercise, targetRepetitions, observedRepetitions, score, advice, source: data.source, capturedAt });
}

export interface WorkoutCursor { readonly capturedAt: string; readonly id: string }
export interface NormalizedWorkoutQuery {
  readonly limit: number;
  readonly after: WorkoutCursor | null;
  readonly exercise: string | null;
  readonly from: string | null;
  readonly to: string | null;
}

/** Cursor of the last returned row: capture time plus record id, opaque to callers. */
export function encodeWorkoutCursor(capturedAt: string, id: string): string {
  return Buffer.from(`${timestamp(capturedAt, 'cursor.capturedAt')}|${uuid(id, 'cursor.id')}`, 'utf8').toString('base64url');
}
export function decodeWorkoutCursor(value: unknown): WorkoutCursor {
  if (typeof value !== 'string' || value.length > MAX_CURSOR_LENGTH || !BASE64URL.test(value) ||
    Buffer.from(value, 'base64url').toString('base64url') !== value) invalid('after 游标格式无效');
  const parts = Buffer.from(value, 'base64url').toString('utf8').split('|');
  if (parts.length !== 2) invalid('after 游标格式无效');
  return Object.freeze({ capturedAt: timestamp(parts[0], 'after 游标'), id: uuid(parts[1], 'after 游标') });
}
export function parseWorkoutQuery(value: unknown = {}): NormalizedWorkoutQuery {
  const data = object(value);
  exact(data, ['limit', 'after', 'exercise', 'from', 'to']);
  return Object.freeze({
    limit: data.limit === undefined ? 20 : integer(data.limit, 'limit', 1, 100),
    after: data.after === undefined || data.after === null ? null : decodeWorkoutCursor(data.after),
    exercise: data.exercise === undefined || data.exercise === null ? null : text(data.exercise, 'exercise', 64),
    from: data.from === undefined || data.from === null ? null : timestamp(data.from, 'from'),
    to: data.to === undefined || data.to === null ? null : timestamp(data.to, 'to'),
  });
}

interface Owner { readonly tenantId: string; readonly userId: string }
function ownerOf(value: AuthPrincipal): Owner {
  const data = object(value);
  exact(data, ['schemaVersion', 'tenantId', 'userId', 'sessionId']);
  if (data.schemaVersion !== '1.0') invalid('鉴权主体无效');
  uuid(data.sessionId, 'sessionId');
  return Object.freeze({ tenantId: uuid(data.tenantId, 'tenantId'), userId: uuid(data.userId, 'userId') });
}

type SummaryRow = DatabaseRow & {
  id: string; exercise: string; target_repetitions: number; observed_repetitions: number;
  total_score: string; source: WorkoutSource; captured_at: Date; created_at: Date;
};
type RecordRow = SummaryRow & { session_id: string; sealed_detail: string };
type StatisticsRow = DatabaseRow & { exercise: string; workouts: number; average: string | null };
type TotalsRow = DatabaseRow & { workouts: number; repetitions: string; last: Date | null };

const SELECT_RECORD = `SELECT id, session_id, exercise, target_repetitions, observed_repetitions, total_score,
  sealed_detail, source, captured_at, created_at FROM fitness_users.workout_records`;
const INSERT_RECORD = `INSERT INTO fitness_users.workout_records
  (tenant_id, id, user_id, session_id, exercise, target_repetitions, observed_repetitions, total_score, sealed_detail, source, captured_at)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, COALESCE($11::timestamptz, clock_timestamp()))
  RETURNING captured_at, created_at`;

export class WorkoutHistoryPlugin extends Service implements FitnessWorkoutHistory {
  static provide = 'fitnessWorkoutHistory';
  static inject = ['fitnessDatabase', 'fitnessUserDataProtection'];
  private closed = false;
  private readonly pending = new Set<Promise<unknown>>();

  constructor(ctx: Context) {
    super(ctx, 'fitnessWorkoutHistory');
    ctx.effect(() => async () => { this.closed = true; await Promise.allSettled([...this.pending]); });
  }

  private run<T>(tenantId: string, action: (session: DatabaseSession) => Promise<T>): Promise<T> {
    if (this.closed) return Promise.reject(new FitnessError('CANCELLED', '运动历史插件已卸载'));
    const operation = this.ctx.fitnessDatabase.transaction(async session => {
      await session.query("SELECT set_config('fitness.tenant_id', $1, true)", [tenantId]);
      const tenant = await session.query('SELECT id FROM fitness_users.tenants WHERE id=$1', [tenantId]);
      if (!tenant.rowCount) throw new FitnessError('TENANT_NOT_FOUND', '租户不存在或不可访问');
      return action(session);
    });
    this.pending.add(operation);
    return operation.finally(() => { this.pending.delete(operation); });
  }

  private detailContext(owner: Owner, recordId: string): readonly string[] {
    return ['workout', owner.tenantId, owner.userId, recordId];
  }
  private open(owner: Owner, recordId: string, sealed: string): { readonly score: ScoreResult; readonly advice: AdviceResult } {
    let plaintext: string;
    try { plaintext = this.ctx.fitnessUserDataProtection.open(this.detailContext(owner, recordId), sealed); }
    catch { throw new FitnessError('DATA_PROTECTION_FAILED', '运动历史明细解密失败'); }
    let value: unknown;
    try { value = JSON.parse(plaintext); }
    catch { throw new FitnessError('DATA_PROTECTION_FAILED', '运动历史明细解密失败'); }
    try { return parseWorkoutDetail(value); }
    catch { throw new FitnessError('DATA_PROTECTION_FAILED', '运动历史明细格式校验失败'); }
  }
  private summary(row: SummaryRow): WorkoutSummary {
    return Object.freeze({
      id: row.id, exercise: row.exercise, total: Number(row.total_score),
      observedRepetitions: row.observed_repetitions, targetRepetitions: row.target_repetitions,
      source: row.source, capturedAt: iso(row.captured_at), createdAt: iso(row.created_at),
    });
  }
  private toRecord(owner: Owner, row: RecordRow): WorkoutRecord {
    const detail = this.open(owner, row.id, row.sealed_detail);
    if (Number(row.total_score) !== detail.score.total) throw new FitnessError('WORKOUT_INVALID', '运动历史总分与明细不一致');
    return Object.freeze({
      ...this.summary(row), schemaVersion: '1.0' as const, sessionId: row.session_id,
      score: detail.score, advice: detail.advice,
    });
  }

  async record(principal: AuthPrincipal, value: unknown): Promise<WorkoutRecord> {
    const owner = ownerOf(principal);
    const input = parseWorkoutInput(value);
    const id = randomUUID();
    const detail = JSON.stringify({ schemaVersion: '1.0', score: input.score, advice: input.advice });
    if (Buffer.byteLength(detail, 'utf8') > MAX_DETAIL_BYTES) invalid('运动历史明细超过加密载荷上限');
    const sealed = this.ctx.fitnessUserDataProtection.seal(this.detailContext(owner, id), detail);
    try {
      const inserted = await this.run(owner.tenantId, async session => {
        const result = await session.query<RecordRow>(INSERT_RECORD, [
          owner.tenantId, id, owner.userId, input.sessionId, input.exercise, input.targetRepetitions,
          input.observedRepetitions, input.score.total, sealed, input.source, input.capturedAt,
        ]);
        const row = result.rows[0];
        if (!row) throw new FitnessError('WORKOUT_NOT_FOUND', '运动历史写入结果不存在');
        return row;
      });
      return Object.freeze({
        schemaVersion: '1.0' as const, id, sessionId: input.sessionId, exercise: input.exercise,
        total: input.score.total, observedRepetitions: input.observedRepetitions,
        targetRepetitions: input.targetRepetitions, source: input.source,
        capturedAt: iso(inserted.captured_at), createdAt: iso(inserted.created_at),
        score: input.score, advice: input.advice,
      });
    } catch (error) {
      if (error instanceof DatabaseQueryError && error.sqlState !== undefined && /^(22|23)/.test(error.sqlState)) {
        throw new FitnessError('WORKOUT_INVALID', '运动历史数据违反数据库约束');
      }
      throw error;
    }
  }

  async list(principal: AuthPrincipal, query: WorkoutQuery = {}): Promise<WorkoutPage> {
    const owner = ownerOf(principal);
    const parsed = parseWorkoutQuery(query);
    const after = parsed.after;
    const rows = await this.run(owner.tenantId, session => session.query<SummaryRow>(`
      SELECT id, exercise, target_repetitions, observed_repetitions, total_score, source, captured_at, created_at
      FROM fitness_users.workout_records
      WHERE tenant_id=$1 AND user_id=$2
        AND ($3::text IS NULL OR exercise=$3::text)
        AND ($4::timestamptz IS NULL OR captured_at >= $4::timestamptz)
        AND ($5::timestamptz IS NULL OR captured_at <= $5::timestamptz)
        AND ($6::timestamptz IS NULL OR (captured_at, id) < ($6::timestamptz, $7::uuid))
      ORDER BY captured_at DESC, id DESC
      LIMIT $8`, [
      owner.tenantId, owner.userId, parsed.exercise, parsed.from, parsed.to,
      after === null ? null : after.capturedAt, after === null ? null : after.id, parsed.limit + 1,
    ]));
    const items = Object.freeze(rows.rows.slice(0, parsed.limit).map(row => this.summary(row)));
    const last = items.at(-1);
    return Object.freeze({
      schemaVersion: '1.0' as const, items,
      nextCursor: rows.rows.length > parsed.limit && last ? encodeWorkoutCursor(last.capturedAt, last.id) : null,
    });
  }

  async get(principal: AuthPrincipal, id: string): Promise<WorkoutRecord> {
    const owner = ownerOf(principal);
    const recordId = uuid(id);
    const rows = await this.run(owner.tenantId, session => session.query<RecordRow>(
      `${SELECT_RECORD} WHERE tenant_id=$1 AND user_id=$2 AND id=$3`, [owner.tenantId, owner.userId, recordId]));
    const row = rows.rows[0];
    if (!row) throw new FitnessError('WORKOUT_NOT_FOUND', '运动历史不存在');
    return this.toRecord(owner, row);
  }

  async remove(principal: AuthPrincipal, id: string): Promise<void> {
    const owner = ownerOf(principal);
    const recordId = uuid(id);
    const result = await this.run(owner.tenantId, session => session.query(
      'DELETE FROM fitness_users.workout_records WHERE tenant_id=$1 AND user_id=$2 AND id=$3',
      [owner.tenantId, owner.userId, recordId]));
    if (!result.rowCount) throw new FitnessError('WORKOUT_NOT_FOUND', '运动历史不存在');
  }

  async statistics(principal: AuthPrincipal): Promise<WorkoutStatistics> {
    const owner = ownerOf(principal);
    const data = await this.run(owner.tenantId, async session => {
      const grouped = await session.query<StatisticsRow>(`SELECT exercise, count(*)::integer AS workouts,
        round(avg(total_score), 2) AS average
        FROM fitness_users.workout_records WHERE tenant_id=$1 AND user_id=$2
        GROUP BY exercise ORDER BY exercise`, [owner.tenantId, owner.userId]);
      const totals = await session.query<TotalsRow>(`SELECT count(*)::integer AS workouts,
        coalesce(sum(observed_repetitions), 0)::bigint AS repetitions, max(captured_at) AS last
        FROM fitness_users.workout_records WHERE tenant_id=$1 AND user_id=$2`, [owner.tenantId, owner.userId]);
      return { grouped: grouped.rows, total: totals.rows[0] };
    });
    return Object.freeze({
      schemaVersion: '1.0' as const,
      totalWorkouts: data.total?.workouts ?? 0,
      totalObservedRepetitions: Number(data.total?.repetitions ?? 0),
      lastCapturedAt: data.total?.last ? iso(data.total.last) : null,
      byExercise: Object.freeze(data.grouped.map(row => Object.freeze({
        exercise: row.exercise, workouts: row.workouts, averageScore: Number(row.average ?? 0),
      }))),
    });
  }
}
