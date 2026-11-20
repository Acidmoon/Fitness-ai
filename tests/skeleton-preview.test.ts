import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { Service, type Context } from 'cordis';
import { FitnessError } from '../src/contracts.ts';
import type { AuthPrincipal, AuthSession, FitnessAuth } from '../src/auth-contracts.ts';
import type { DatabaseResult, DatabaseRow, DatabaseSession, FitnessDatabase } from '../src/database-contracts.ts';
import { createRuntime, mountPlugins } from '../src/runtime.ts';
import { AssessmentPlugin } from '../src/plugins/assessment.ts';
import { ExerciseLibraryPlugin } from '../src/plugins/exercise-library.ts';
import { HttpApiPlugin } from '../src/plugins/http-api.ts';
import { JointMotionPlugin } from '../src/plugins/joint-motion.ts';
import { JsonArtifactsPlugin } from '../src/plugins/json-artifacts.ts';
import { LocalFilePlugin } from '../src/plugins/local-file.ts';
import { RuleAdvicePlugin } from '../src/plugins/rule-advice.ts';
import { RuleScoringPlugin } from '../src/plugins/rule-scoring.ts';
import { SkeletonPreviewPlugin } from '../src/plugins/skeleton-preview.ts';
import { UserDataProtectionPlugin } from '../src/plugins/user-data-protection.ts';
import { VideoAssessmentPlugin } from '../src/plugins/video-assessment.ts';
import { WorkoutInputPlugin } from '../src/plugins/workout-input.ts';
import {
  compactPoseTrack,
  parsePoseTrack,
  POSE_TRACK_CONF_SCALE,
  POSE_TRACK_COORD_SCALE,
  POSE_TRACK_MAX_BYTES,
  POSE_TRACK_MAX_FPS,
  POSE_TRACK_MAX_FRAMES,
  type PoseTrack,
} from '../src/skeleton-contracts.ts';
import { encodeSkeletonGif } from '../src/skeleton-gif.ts';
import { userDatabasePlugins } from '../src/user-app.ts';
import { userMigrations } from '../src/user-migrations.ts';
import type { FitnessPose, PoseOptions, PoseSequence, VideoFile } from '../src/vision-contracts.ts';
import { makeFrames, makePoses, plankSeries } from './vision-fixtures.ts';

const hasCode = (code: string) => (error: unknown) => error instanceof FitnessError && error.code === code;

/**
 * Independent GIF89a + LZW binary decoder used by tests to prove every
 * generated GIF conforms to the GIF89a spec and decodes cleanly frame by frame.
 */
interface DecodedGif {
  readonly header: string;
  readonly width: number;
  readonly height: number;
  readonly paletteSize: number;
  readonly hasLoopExtension: boolean;
  readonly loopCount: number | null;
  readonly frames: readonly {
    readonly left: number;
    readonly top: number;
    readonly width: number;
    readonly height: number;
    readonly delayCs: number;
    readonly canvas: Uint8Array;
  }[];
}

function decodeLzw(data: Uint8Array, minCodeSize: number, expectedPixels: number): Uint8Array {
  const clearCode = 1 << minCodeSize;
  const eoiCode = clearCode + 1;
  let codeSize = minCodeSize + 1;
  let nextCode = eoiCode + 1;

  const prefix = new Int32Array(4096);
  const suffix = new Uint8Array(4096);
  const stack = new Uint8Array(4096);
  for (let i = 0; i < clearCode; i++) {
    prefix[i] = -1;
    suffix[i] = i;
  }

  let bytePos = 0;
  let bitBuffer = 0;
  let bitCount = 0;

  const readCode = (): number => {
    while (bitCount < codeSize) {
      if (bytePos >= data.length) throw new Error('Unexpected EOF inside LZW stream');
      bitBuffer |= data[bytePos++]! << bitCount;
      bitCount += 8;
    }
    const code = bitBuffer & ((1 << codeSize) - 1);
    bitBuffer >>>= codeSize;
    bitCount -= codeSize;
    return code;
  };

  const output = new Uint8Array(expectedPixels);
  let outPos = 0;
  let prevCode = -1;
  let firstChar = 0;

  while (true) {
    const code = readCode();
    if (code === clearCode) {
      codeSize = minCodeSize + 1;
      nextCode = eoiCode + 1;
      prevCode = -1;
      continue;
    }
    if (code === eoiCode) break;

    let inCode = code;
    let sp = 0;
    if (code >= nextCode) {
      if (code !== nextCode || prevCode === -1) {
        throw new Error(`Invalid LZW code ${code} (nextCode=${nextCode})`);
      }
      stack[sp++] = firstChar;
      inCode = prevCode;
    }
    while (inCode >= clearCode) {
      stack[sp++] = suffix[inCode]!;
      inCode = prefix[inCode]!;
    }
    firstChar = suffix[inCode]!;
    stack[sp++] = firstChar;

    while (sp > 0) {
      if (outPos >= expectedPixels) throw new Error('LZW output overflowed expected pixel count');
      output[outPos++] = stack[--sp]!;
    }

    if (prevCode !== -1 && nextCode < 4096) {
      prefix[nextCode] = prevCode;
      suffix[nextCode] = firstChar;
      nextCode++;
      if (nextCode === (1 << codeSize) && codeSize < 12) {
        codeSize++;
      }
    }
    prevCode = code;
  }

  assert.equal(outPos, expectedPixels, `Decoded ${outPos} pixels, expected ${expectedPixels}`);
  return output;
}

function decodeGif89a(bytes: Uint8Array): DecodedGif {
  assert.ok(bytes.length >= 14, 'GIF too short');
  const header = Buffer.from(bytes.subarray(0, 6)).toString('ascii');
  assert.equal(header, 'GIF89a');
  let pos = 6;
  const readU16 = () => {
    const value = bytes[pos]! | (bytes[pos + 1]! << 8);
    pos += 2;
    return value;
  };
  const width = readU16();
  const height = readU16();
  const packed = bytes[pos++]!;
  pos += 2; // bg color + aspect ratio
  const hasGct = (packed & 0x80) !== 0;
  const paletteSize = hasGct ? 1 << ((packed & 0x07) + 1) : 0;
  if (hasGct) pos += paletteSize * 3;

  let hasLoopExtension = false;
  let loopCount: number | null = null;
  let currentDelayCs = 0;
  const composite = new Uint8Array(width * height);
  const frames: {
    left: number; top: number; width: number; height: number; delayCs: number; canvas: Uint8Array;
  }[] = [];

  const readSubBlocks = (): Uint8Array => {
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const len = bytes[pos++]!;
      if (len === 0) break;
      const slice = bytes.subarray(pos, pos + len);
      chunks.push(slice);
      total += len;
      pos += len;
    }
    const merged = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }
    return merged;
  };

  let sawTrailer = false;
  while (pos < bytes.length) {
    const intro = bytes[pos++]!;
    if (intro === 0x3b) {
      sawTrailer = true;
      break;
    }
    if (intro === 0x21) {
      const label = bytes[pos++]!;
      if (label === 0xf9) {
        const blockSize = bytes[pos++]!;
        assert.equal(blockSize, 4);
        pos += 1; // packed
        currentDelayCs = readU16();
        pos += 1; // transparent idx
        assert.equal(bytes[pos++]!, 0);
      } else if (label === 0xff) {
        const appLen = bytes[pos++]!;
        const appId = Buffer.from(bytes.subarray(pos, pos + appLen)).toString('ascii');
        pos += appLen;
        const appData = readSubBlocks();
        if (appId === 'NETSCAPE2.0' && appData.length >= 3 && appData[0] === 0x01) {
          hasLoopExtension = true;
          loopCount = appData[1]! | (appData[2]! << 8);
        }
      } else {
        readSubBlocks();
      }
      continue;
    }
    if (intro === 0x2c) {
      const left = readU16();
      const top = readU16();
      const rw = readU16();
      const rh = readU16();
      const imgPacked = bytes[pos++]!;
      assert.equal(imgPacked & 0x80, 0, 'Expected no local color table');
      assert.equal(imgPacked & 0x40, 0, 'Expected non-interlaced frame');
      const minCodeSize = bytes[pos++]!;
      const lzwData = readSubBlocks();
      const patch = decodeLzw(lzwData, minCodeSize, rw * rh);
      for (let y = 0; y < rh; y++) {
        for (let x = 0; x < rw; x++) {
          composite[(top + y) * width + (left + x)] = patch[y * rw + x]!;
        }
      }
      frames.push({ left, top, width: rw, height: rh, delayCs: currentDelayCs, canvas: composite.slice() });
      continue;
    }
    throw new Error(`Unexpected GIF block introducer 0x${intro.toString(16)} at offset ${pos - 1}`);
  }

  assert.equal(sawTrailer, true, 'GIF missing 0x3B trailer');
  assert.equal(pos, bytes.length, 'Trailing bytes after GIF trailer');
  return { header, width, height, paletteSize, hasLoopExtension, loopCount, frames };
}

/**
 * In-memory tenant-scoped fake FitnessDatabase simulating PostgreSQL RLS
 * (`set_config('fitness.tenant_id', ...)`), `workout_records` ownership,
 * `workout_pose_tracks` upsert/lookup, and `ON DELETE CASCADE`.
 */
interface FakeTrackRow {
  tenantId: string;
  workoutId: string;
  userId: string;
  contentSha256: string;
  sealedTrack: string;
  updatedAt: Date;
}

class FakePoseTrackDb extends Service implements FitnessDatabase {
  static provide = 'fitnessDatabase';
  readonly tenants = new Set<string>();
  readonly workouts = new Map<string, { tenantId: string; id: string; userId: string }>();
  readonly tracks = new Map<string, FakeTrackRow>();

  constructor(ctx: Context) {
    super(ctx, 'fitnessDatabase');
  }

  seedTenant(tenantId: string): void {
    this.tenants.add(tenantId.toLowerCase());
  }

  seedWorkout(tenantId: string, userId: string, workoutId: string): void {
    const t = tenantId.toLowerCase();
    const w = workoutId.toLowerCase();
    this.workouts.set(`${t}:${w}`, { tenantId: t, id: w, userId: userId.toLowerCase() });
  }

  deleteWorkout(tenantId: string, workoutId: string): void {
    const key = `${tenantId.toLowerCase()}:${workoutId.toLowerCase()}`;
    this.workouts.delete(key);
    this.tracks.delete(key); // simulate ON DELETE CASCADE
  }

  async health() {
    return { schemaVersion: '1.0' as const, status: 'ready' as const, serverVersion: 160000 };
  }

  async transaction<T>(action: (session: DatabaseSession) => Promise<T>): Promise<T> {
    let scopedTenant: string | null = null;
    const session: DatabaseSession = {
      query: async <Row extends DatabaseRow = DatabaseRow>(sql: string, params: readonly unknown[] = []): Promise<DatabaseResult<Row>> => {
        if (sql.includes("set_config('fitness.tenant_id'")) {
          scopedTenant = String(params[0]).toLowerCase();
          return { rows: [], rowCount: 1 };
        }
        if (sql.startsWith('SELECT id FROM fitness_users.tenants')) {
          const id = String(params[0]).toLowerCase();
          const ok = scopedTenant === id && this.tenants.has(id);
          return { rows: (ok ? [{ id }] : []) as unknown as Row[], rowCount: ok ? 1 : 0 };
        }
        if (sql.includes('FROM fitness_users.workout_records')) {
          const [tenantId, userId, workoutId] = params.map(v => String(v).toLowerCase()) as [string, string, string];
          if (scopedTenant !== tenantId) return { rows: [], rowCount: 0 };
          const row = this.workouts.get(`${tenantId}:${workoutId}`);
          if (!row || row.userId !== userId) return { rows: [], rowCount: 0 };
          return { rows: [{ id: row.id }] as unknown as Row[], rowCount: 1 };
        }
        if (sql.startsWith('INSERT INTO fitness_users.workout_pose_tracks')) {
          const tenantId = String(params[0]).toLowerCase();
          const workoutId = String(params[1]).toLowerCase();
          const userId = String(params[2]).toLowerCase();
          const contentSha256 = String(params[7]);
          const sealedTrack = String(params[8]);
          if (scopedTenant !== tenantId) return { rows: [], rowCount: 0 };
          const key = `${tenantId}:${workoutId}`;
          const existing = this.tracks.get(key);
          if (existing && existing.userId !== userId) return { rows: [], rowCount: 0 };
          const updatedAt = new Date();
          this.tracks.set(key, { tenantId, workoutId, userId, contentSha256, sealedTrack, updatedAt });
          return { rows: [{ updated_at: updatedAt }] as unknown as Row[], rowCount: 1 };
        }
        if (sql.includes('FROM fitness_users.workout_pose_tracks')) {
          const [tenantId, userId, workoutId] = params.map(v => String(v).toLowerCase()) as [string, string, string];
          if (scopedTenant !== tenantId) return { rows: [], rowCount: 0 };
          const row = this.tracks.get(`${tenantId}:${workoutId}`);
          if (!row || row.userId !== userId) return { rows: [], rowCount: 0 };
          return {
            rows: [{ content_sha256: row.contentSha256, sealed_track: row.sealedTrack }] as unknown as Row[],
            rowCount: 1,
          };
        }
        throw new Error(`Unexpected SQL in fake DB: ${sql}`);
      },
    };
    return await action(session);
  }
}

class FakeAuthPlugin extends Service implements FitnessAuth {
  static provide = 'fitnessAuth';
  private readonly tokens = new Map<string, AuthPrincipal>();

  constructor(ctx: Context) {
    super(ctx, 'fitnessAuth');
  }

  registerToken(token: string, principal: AuthPrincipal): void {
    this.tokens.set(token, principal);
  }

  async register(): Promise<AuthSession> { throw new Error('not implemented'); }
  async login(): Promise<AuthSession> { throw new Error('not implemented'); }
  async logout(): Promise<void> {}
  async changePassword(): Promise<void> {}
  async revokeAll(): Promise<number> { return 0; }
  async authenticate(token: string): Promise<AuthPrincipal> {
    const principal = this.tokens.get(token);
    if (!principal) throw new FitnessError('AUTH_UNAUTHENTICATED', '令牌无效');
    return principal;
  }
}

class FixturePosePlugin extends Service implements FitnessPose {
  static provide = 'fitnessPose';
  private readonly poses: PoseSequence;
  constructor(ctx: Context, config: { poses: PoseSequence }) {
    super(ctx, 'fitnessPose');
    this.poses = config.poses;
  }
  async estimate(_video: VideoFile, _options?: PoseOptions): Promise<PoseSequence> {
    return this.poses;
  }
}

function makeCryptoConfig() {
  return {
    keys: { key1: randomBytes(32).toString('base64url') },
    activeKeyId: 'key1',
    lookupKey: randomBytes(32).toString('base64url'),
  };
}

function analyzeFixture(poses: PoseSequence, exercise: 'squat' | 'plank' = 'squat') {
  const ctx = createRuntime();
  const plugin = new JointMotionPlugin(ctx);
  return plugin.analyze(poses, { exercise, targetRepetitions: exercise === 'plank' ? 5 : 1, sessionId: 'test-session' });
}

test('compactPoseTrack quantizes accurately, enforces fps/frame caps, and stays well inside the size budget', () => {
  // 1. Typical squat clip (~23 frames @ 10fps)
  const squatPoses = makePoses();
  const squatMotion = analyzeFixture(squatPoses, 'squat');
  const squatTrack = compactPoseTrack(squatPoses, squatMotion);
  const squatJsonBytes = Buffer.byteLength(JSON.stringify(squatTrack), 'utf8');

  assert.equal(squatTrack.schemaVersion, '1.0');
  assert.equal(squatTrack.coordinateSpace, 'normalized');
  assert.equal(squatTrack.coordScale, POSE_TRACK_COORD_SCALE);
  assert.equal(squatTrack.confScale, POSE_TRACK_CONF_SCALE);
  assert.ok(squatTrack.fps > 0 && squatTrack.fps <= POSE_TRACK_MAX_FPS);
  assert.ok(squatTrack.frames.length >= 1 && squatTrack.frames.length <= POSE_TRACK_MAX_FRAMES);
  assert.equal(squatTrack.modelSha256, squatPoses.model.sha256);
  assert.equal(squatTrack.motionPolicy.id, squatMotion.policy.id);
  assert.equal(squatTrack.segments.length, squatMotion.repetitions.length);
  assert.equal(squatTrack.segments[0]!.kind, 'rep');
  assert.ok(squatJsonBytes < 10 * 1024, `Short squat track should be < 10 KB, got ${squatJsonBytes}`);

  // Verify quantization round-trip error <= 1/scale on frame 0 keypoints
  const origFrame0 = squatPoses.frames[0]!;
  const quantFrame0 = squatTrack.frames[0]!;
  for (let k = 0; k < 17; k++) {
    const orig = origFrame0.keypoints[k]!;
    const expectedX = Math.max(0, Math.min(1, orig.x / squatPoses.video.width));
    const expectedY = Math.max(0, Math.min(1, orig.y / squatPoses.video.height));
    const gotX = quantFrame0.keypoints[k * 3]! / POSE_TRACK_COORD_SCALE;
    const gotY = quantFrame0.keypoints[k * 3 + 1]! / POSE_TRACK_COORD_SCALE;
    const gotC = quantFrame0.keypoints[k * 3 + 2]! / POSE_TRACK_CONF_SCALE;
    assert.ok(Math.abs(gotX - expectedX) <= 0.001 + 1e-9);
    assert.ok(Math.abs(gotY - expectedY) <= 0.001 + 1e-9);
    assert.ok(Math.abs(gotC - orig.confidence) <= 0.01 + 1e-9);
  }

  // Round-trip through strict validator
  assert.deepEqual(parsePoseTrack(JSON.parse(JSON.stringify(squatTrack))), squatTrack);

  // 2. Long 30-second high-FPS (20fps = 600 frames) clip must downsample to <= 150 frames & <= 10 fps & <= 40 KB
  const longPlankPoses = makeFrames(plankSeries(600), 50); // 600 frames @ 20fps = 30s
  const longPlankMotion = analyzeFixture(longPlankPoses, 'plank');
  const longTrack = compactPoseTrack(longPlankPoses, longPlankMotion);
  const longJsonBytes = Buffer.byteLength(JSON.stringify(longTrack), 'utf8');

  assert.ok(longTrack.frames.length <= POSE_TRACK_MAX_FRAMES, `Expected <= 150 frames, got ${longTrack.frames.length}`);
  assert.ok(longTrack.fps <= POSE_TRACK_MAX_FPS, `Expected <= 10 fps, got ${longTrack.fps}`);
  assert.ok(longTrack.segments.some(s => s.kind === 'hold'), 'Plank track should carry hold segment marker');
  assert.ok(longJsonBytes <= 40 * 1024, `Max-frame track should be <= 40 KB, got ${longJsonBytes}`);
  assert.ok(longJsonBytes <= POSE_TRACK_MAX_BYTES);
  assert.deepEqual(parsePoseTrack(JSON.parse(JSON.stringify(longTrack))), longTrack);
});

test('parsePoseTrack rejects malformed, out-of-range, non-monotonic, and oversized tracks', () => {
  const valid = compactPoseTrack(makePoses(), analyzeFixture(makePoses(), 'squat'));
  const reject = (patch: Record<string, unknown>, expectedCode = 'POSE_TRACK_INVALID') => {
    assert.throws(() => parsePoseTrack({ ...valid, ...patch }), hasCode(expectedCode));
  };

  reject({ schemaVersion: '2.0' });
  reject({ coordinateSpace: 'image-pixels' });
  reject({ coordScale: 2000 });
  reject({ confScale: 255 });
  reject({ fps: 0 });
  reject({ fps: 12 });
  reject({ width: 0 });
  reject({ modelSha256: 'not-hex' });
  reject({ extraField: true });
  reject({ frames: [] });
  reject({ frames: Array.from({ length: 151 }, (_, i) => ({ timestampMs: i * 100, keypoints: valid.frames[0]!.keypoints })) });
  reject({
    frames: [
      { timestampMs: 100, keypoints: valid.frames[0]!.keypoints },
      { timestampMs: 100, keypoints: valid.frames[0]!.keypoints },
    ],
  });
  reject({
    frames: [{ timestampMs: 0, keypoints: [1001, ...valid.frames[0]!.keypoints.slice(1)] }],
  });
  reject({
    frames: [{ timestampMs: 0, keypoints: [0, 0, 101, ...valid.frames[0]!.keypoints.slice(3)] }],
  });
  reject({
    segments: [{ kind: 'hold', startMs: 0, bottomMs: 500, endMs: 1000 }],
  });
});

test('pure-TS GIF89a encoder produces standards-compliant animated GIFs that decode frame-by-frame', () => {
  const squatPoses = makePoses();
  const squatTrack = compactPoseTrack(squatPoses, analyzeFixture(squatPoses, 'squat'));
  const gif = encodeSkeletonGif(squatTrack);

  assert.ok(gif.bytes instanceof Uint8Array);
  assert.ok(gif.width <= 360 && gif.height <= 360);
  assert.equal(gif.frameCount, squatTrack.frames.length);
  assert.match(gif.etag, /^"skel-[a-f0-9]{16}-v1"$/);

  const decoded = decodeGif89a(gif.bytes);
  assert.equal(decoded.header, 'GIF89a');
  assert.equal(decoded.width, gif.width);
  assert.equal(decoded.height, gif.height);
  assert.equal(decoded.paletteSize, 16);
  assert.equal(decoded.hasLoopExtension, true);
  assert.equal(decoded.loopCount, 0);
  assert.equal(decoded.frames.length, squatTrack.frames.length);

  // Confirm frame 0 has non-background skeleton pixels (emerald/sky/amber/white indices >= 4)
  const skeletonPixels = decoded.frames[0]!.canvas.filter(px => px >= 4).length;
  assert.ok(skeletonPixels > 100, `Expected visible skeleton pixels, found ${skeletonPixels}`);

  // Confirm portrait orientation (e.g. 720x1280 phone video) preserves portrait aspect ratio
  const portraitTrack: PoseTrack = { ...squatTrack, width: 720, height: 1280 };
  const portraitGif = encodeSkeletonGif(portraitTrack);
  assert.ok(portraitGif.height > portraitGif.width, `Expected portrait GIF, got ${portraitGif.width}x${portraitGif.height}`);
  assert.ok(portraitGif.height <= 360);
  const decodedPortrait = decodeGif89a(portraitGif.bytes);
  assert.equal(decodedPortrait.frames.length, portraitTrack.frames.length);

  // Confirm plank hold animation also encodes & decodes cleanly
  const plankPoses = makeFrames(plankSeries(80), 100);
  const plankTrack = compactPoseTrack(plankPoses, analyzeFixture(plankPoses, 'plank'));
  const plankGif = encodeSkeletonGif(plankTrack);
  const decodedPlank = decodeGif89a(plankGif.bytes);
  assert.equal(decodedPlank.frames.length, plankTrack.frames.length);
  assert.ok(plankGif.bytes.byteLength < 200 * 1024, `Expected compact GIF, got ${plankGif.bytes.byteLength} bytes`);
});

test('SkeletonPreviewPlugin encrypts tracks with AAD binding, enforces RLS/ownership, caches GIFs, and handles HTTP routes', async () => {
  const videoDir = await mkdtemp(join(tmpdir(), 'fitness-skel-http-'));
  const ctx = createRuntime();
  try {
    await writeFile(join(videoDir, 'squat.mp4'), 'abc');
    const tenantA = randomUUID();
    const tenantB = randomUUID();
    const userA = randomUUID();
    const userB = randomUUID();
    const workoutA = randomUUID();
    const workoutNoTrack = randomUUID();

    const principalA: AuthPrincipal = { schemaVersion: '1.0', tenantId: tenantA, userId: userA, sessionId: randomUUID() };
    const principalB: AuthPrincipal = { schemaVersion: '1.0', tenantId: tenantA, userId: userB, sessionId: randomUUID() };
    const principalTenantB: AuthPrincipal = { schemaVersion: '1.0', tenantId: tenantB, userId: userA, sessionId: randomUUID() };

    await ctx.plugin(FixturePosePlugin, { poses: makePoses() }).await();
    await mountPlugins(ctx, [
      VideoAssessmentPlugin, AssessmentPlugin, LocalFilePlugin, JointMotionPlugin, JsonArtifactsPlugin,
      WorkoutInputPlugin, RuleScoringPlugin, RuleAdvicePlugin, ExerciseLibraryPlugin,
    ]);
    await ctx.plugin(FakePoseTrackDb).await();
    await ctx.plugin(UserDataProtectionPlugin, makeCryptoConfig()).await();
    await ctx.plugin(FakeAuthPlugin).await();
    const skeletonFork = ctx.plugin(SkeletonPreviewPlugin, { maxCacheBytes: 512 * 1024 });
    await skeletonFork.await();

    let address: { host: string; port: number } | undefined;
    await ctx.plugin(HttpApiPlugin, {
      port: 0,
      videoRoot: videoDir,
      onListening: value => { address = value; },
    }).await();
    assert.ok(address);
    const base = `http://127.0.0.1:${address.port}`;

    const db = ctx.fitnessDatabase as unknown as FakePoseTrackDb;
    const auth = ctx.fitnessAuth as unknown as FakeAuthPlugin;
    db.seedTenant(tenantA);
    db.seedTenant(tenantB);
    db.seedWorkout(tenantA, userA, workoutA);
    db.seedWorkout(tenantA, userA, workoutNoTrack);
    auth.registerToken('token-user-a', principalA);
    auth.registerToken('token-user-b', principalB);
    auth.registerToken('token-tenant-b', principalTenantB);

    // 1. POST /api/assessments returns compact poseTrack alongside existing keys
    const assessRes = await fetch(`${base}/api/assessments`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path: 'squat.mp4', exercise: 'squat', targetRepetitions: 1 }),
    });
    assert.equal(assessRes.status, 200);
    const assessed = await assessRes.json() as { exercise: string; poseTrack: PoseTrack };
    assert.equal(assessed.exercise, 'squat');
    assert.ok(assessed.poseTrack);
    assert.equal(assessed.poseTrack.schemaVersion, '1.0');
    assert.equal(assessed.poseTrack.coordinateSpace, 'normalized');

    // 2. Unauthenticated requests get 401
    assert.equal((await fetch(`${base}/api/workouts/${workoutA}/pose-track`, {
      method: 'PUT', body: JSON.stringify(assessed.poseTrack),
    })).status, 401);
    assert.equal((await fetch(`${base}/api/workouts/${workoutA}/skeleton.gif`)).status, 401);

    // 3. Malformed UUID gets 400
    const badIdRes = await fetch(`${base}/api/workouts/not-a-uuid/skeleton.gif`, {
      headers: { authorization: 'Bearer token-user-a' },
    });
    assert.equal(badIdRes.status, 400);

    // 4. Client identity fields in PUT body are rejected with 400
    const spoofRes = await fetch(`${base}/api/workouts/${workoutA}/pose-track`, {
      method: 'PUT',
      headers: { authorization: 'Bearer token-user-a', 'content-type': 'application/json' },
      body: JSON.stringify({ ...assessed.poseTrack, tenantId: tenantB }),
    });
    assert.equal(spoofRes.status, 400);

    // 5. Foreign user (same tenant) or foreign tenant cannot attach a track -> 404 WORKOUT_NOT_FOUND
    const foreignPut = await fetch(`${base}/api/workouts/${workoutA}/pose-track`, {
      method: 'PUT',
      headers: { authorization: 'Bearer token-user-b', 'content-type': 'application/json' },
      body: JSON.stringify(assessed.poseTrack),
    });
    assert.equal(foreignPut.status, 404);
    assert.equal((await foreignPut.json() as { error: { code: string } }).error.code, 'WORKOUT_NOT_FOUND');

    const crossTenantPut = await fetch(`${base}/api/workouts/${workoutA}/pose-track`, {
      method: 'PUT',
      headers: { authorization: 'Bearer token-tenant-b', 'content-type': 'application/json' },
      body: JSON.stringify(assessed.poseTrack),
    });
    assert.equal(crossTenantPut.status, 404);

    // 6. Owner attaches poseTrack -> 200 OK; stored row is encrypted (no plaintext keypoints)
    const putRes = await fetch(`${base}/api/workouts/${workoutA}/pose-track`, {
      method: 'PUT',
      headers: { authorization: 'Bearer token-user-a', 'content-type': 'application/json' },
      body: JSON.stringify(assessed.poseTrack),
    });
    assert.equal(putRes.status, 200);
    const receipt = await putRes.json() as { workoutId: string; frames: number; bytes: number };
    assert.equal(receipt.workoutId, workoutA);
    assert.equal(receipt.frames, assessed.poseTrack.frames.length);
    assert.ok(receipt.bytes > 0 && receipt.bytes <= POSE_TRACK_MAX_BYTES);

    const stored = db.tracks.get(`${tenantA}:${workoutA}`);
    assert.ok(stored);
    assert.match(stored.sealedTrack, /^v1\./);
    assert.equal(stored.sealedTrack.includes('squat'), false, 'Ciphertext must not leak plaintext exercise');
    assert.equal(stored.sealedTrack.includes('keypoints'), false, 'Ciphertext must not leak plaintext keypoints');

    // 7. Older workout without a track -> 404 POSE_TRACK_NOT_FOUND
    const absentRes = await fetch(`${base}/api/workouts/${workoutNoTrack}/skeleton.gif`, {
      headers: { authorization: 'Bearer token-user-a' },
    });
    assert.equal(absentRes.status, 404);
    assert.equal((await absentRes.json() as { error: { code: string } }).error.code, 'POSE_TRACK_NOT_FOUND');

    // 8. Foreign user / foreign tenant requesting GIF -> 404 POSE_TRACK_NOT_FOUND (indistinguishable from absent)
    const foreignGif = await fetch(`${base}/api/workouts/${workoutA}/skeleton.gif`, {
      headers: { authorization: 'Bearer token-user-b' },
    });
    assert.equal(foreignGif.status, 404);
    assert.equal((await foreignGif.json() as { error: { code: string } }).error.code, 'POSE_TRACK_NOT_FOUND');

    // 9. Owner fetches GIF -> 200 image/gif, Cache-Control, ETag, valid decodable GIF89a
    const gifRes = await fetch(`${base}/api/workouts/${workoutA}/skeleton.gif`, {
      headers: { authorization: 'Bearer token-user-a' },
    });
    assert.equal(gifRes.status, 200);
    assert.equal(gifRes.headers.get('content-type'), 'image/gif');
    assert.equal(gifRes.headers.get('cache-control'), 'private, max-age=86400');
    const etag = gifRes.headers.get('etag');
    assert.ok(etag && /^"skel-[a-f0-9]{16}-v1"$/.test(etag));
    const gifBytes = new Uint8Array(await gifRes.arrayBuffer());
    const decoded = decodeGif89a(gifBytes);
    assert.equal(decoded.frames.length, assessed.poseTrack.frames.length);

    // 10. Conditional request with matching ETag -> 304 Not Modified with empty body
    const notModified = await fetch(`${base}/api/workouts/${workoutA}/skeleton.gif`, {
      headers: { authorization: 'Bearer token-user-a', 'if-none-match': etag },
    });
    assert.equal(notModified.status, 304);
    assert.equal(notModified.headers.get('etag'), etag);
    assert.equal((await notModified.arrayBuffer()).byteLength, 0);

    // 11. GET /api/workouts/{id}/pose-track returns exact round-tripped PoseTrack JSON
    const trackRes = await fetch(`${base}/api/workouts/${workoutA}/pose-track`, {
      headers: { authorization: 'Bearer token-user-a' },
    });
    assert.equal(trackRes.status, 200);
    assert.deepEqual(await trackRes.json(), assessed.poseTrack);

    // 11b. Upsert updates track, changes ETag, and invalidates previous cached GIF
    const updatedTrack: PoseTrack = {
      ...assessed.poseTrack,
      width: 720,
      height: 1280,
    };
    const upsertRes = await fetch(`${base}/api/workouts/${workoutA}/pose-track`, {
      method: 'PUT',
      headers: { authorization: 'Bearer token-user-a', 'content-type': 'application/json' },
      body: JSON.stringify(updatedTrack),
    });
    assert.equal(upsertRes.status, 200);
    const updatedGifRes = await fetch(`${base}/api/workouts/${workoutA}/skeleton.gif`, {
      headers: { authorization: 'Bearer token-user-a', 'if-none-match': etag },
    });
    assert.equal(updatedGifRes.status, 200);
    const updatedEtag = updatedGifRes.headers.get('etag');
    assert.ok(updatedEtag && updatedEtag !== etag, 'Upsert must produce a fresh ETag and invalidate cache');
    const updatedDecoded = decodeGif89a(new Uint8Array(await updatedGifRes.arrayBuffer()));
    assert.ok(updatedDecoded.height > updatedDecoded.width, 'Updated portrait dimensions must reflect in rendered GIF');

    // 11c. Oversized PUT body (> 128 KiB) returns 413 POSE_TRACK_TOO_LARGE
    const hugeRes = await fetch(`${base}/api/workouts/${workoutA}/pose-track`, {
      method: 'PUT',
      headers: { authorization: 'Bearer token-user-a', 'content-type': 'application/json' },
      body: `{"pad":"${'x'.repeat(130 * 1024)}"}`,
    });
    assert.equal(hugeRes.status, 413);
    assert.equal((await hugeRes.json() as { error: { code: string } }).error.code, 'POSE_TRACK_TOO_LARGE');

    // 12. Tampering with AAD binding (moving sealed ciphertext to another workoutId) fails decryption
    db.tracks.set(`${tenantA}:${workoutNoTrack}`, {
      ...stored,
      workoutId: workoutNoTrack,
    });
    const tampered = await fetch(`${base}/api/workouts/${workoutNoTrack}/skeleton.gif`, {
      headers: { authorization: 'Bearer token-user-a' },
    });
    assert.equal(tampered.status, 500);
    assert.equal((await tampered.json() as { error: { code: string } }).error.code, 'DATA_PROTECTION_FAILED');

    // 13. Unloading SkeletonPreviewPlugin unregisters its routes cleanly
    await skeletonFork.dispose();
    const afterDispose = await fetch(`${base}/api/workouts/${workoutA}/skeleton.gif`, {
      headers: { authorization: 'Bearer token-user-a' },
    });
    assert.equal(afterDispose.status, 404);
    assert.equal((await afterDispose.json() as { error: { code: string } }).error.code, 'INVALID_ARGUMENTS');
  } finally {
    await ctx.fiber.dispose();
    await rm(videoDir, { recursive: true, force: true });
  }
});

test('migration 005 is registered with checksum, FORCE RLS, ON DELETE CASCADE, and wired in userDatabasePlugins', async () => {
  const migrations = await userMigrations();
  assert.deepEqual(
    migrations.map(m => [m.version, m.name]),
    [[1, 'users'], [2, 'auth'], [3, 'workout-history'], [4, 'wearable'], [5, 'pose-tracks']],
  );
  const m5 = migrations[4]!;
  assert.match(m5.checksum, /^[a-f0-9]{64}$/);
  assert.match(m5.sql, /CREATE TABLE fitness_users\.workout_pose_tracks/);
  assert.match(m5.sql, /REFERENCES fitness_users\.workout_records\(tenant_id, id\) ON DELETE CASCADE/);
  assert.match(m5.sql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(m5.sql, /FORCE ROW LEVEL SECURITY/);

  const providers = (userDatabasePlugins as unknown as readonly { provide?: string }[]).map(p => p.provide);
  assert.ok(providers.includes('fitnessSkeletonPreview'), 'userDatabasePlugins must include fitnessSkeletonPreview');
});
