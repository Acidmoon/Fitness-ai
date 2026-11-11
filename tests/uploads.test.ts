import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readdir, readFile, rm, stat, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { Service, type Context } from 'cordis';
import { FitnessError } from '../src/contracts.ts';
import type { AuthPrincipal } from '../src/auth-contracts.ts';
import { createRuntime, mountPlugins } from '../src/runtime.ts';
import { AssessmentPlugin } from '../src/plugins/assessment.ts';
import { ExerciseLibraryPlugin } from '../src/plugins/exercise-library.ts';
import { HttpApiPlugin } from '../src/plugins/http-api.ts';
import { JointMotionPlugin } from '../src/plugins/joint-motion.ts';
import { JsonArtifactsPlugin } from '../src/plugins/json-artifacts.ts';
import { LocalFilePlugin } from '../src/plugins/local-file.ts';
import { RuleAdvicePlugin } from '../src/plugins/rule-advice.ts';
import { RuleScoringPlugin } from '../src/plugins/rule-scoring.ts';
import { UploadsPlugin } from '../src/plugins/uploads.ts';
import { VideoAssessmentPlugin } from '../src/plugins/video-assessment.ts';
import { WorkoutInputPlugin } from '../src/plugins/workout-input.ts';
import type { FitnessPose, PoseOptions, PoseSequence, VideoFile } from '../src/vision-contracts.ts';
import type { UploadRequest } from '../src/upload-contracts.ts';
import { makePoses } from './vision-fixtures.ts';

/** 骨架识别由测试替身固定提供：上传面只关心字节能否变成合法文件。 */
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

const pipeline = [
  VideoAssessmentPlugin, AssessmentPlugin, LocalFilePlugin, JointMotionPlugin, JsonArtifactsPlugin,
  WorkoutInputPlugin, RuleScoringPlugin, RuleAdvicePlugin, ExerciseLibraryPlugin,
];

interface RunningServer {
  readonly ctx: Context;
  readonly base: string;
  close(): Promise<void>;
}

async function start(root: string, uploads: Record<string, unknown> = {}): Promise<RunningServer> {
  const ctx = createRuntime();
  await ctx.plugin(FixturePosePlugin, { poses: makePoses() }).await();
  await mountPlugins(ctx, pipeline);
  await ctx.plugin(UploadsPlugin, { root, ...uploads }).await();
  let address: { host: string; port: number } | undefined;
  // 视频根目录和上传暂存区必须指向同一处，否则上传的文件评估接口找不到。
  await ctx.plugin(HttpApiPlugin, { port: 0, videoRoot: root, onListening: value => { address = value; } }).await();
  if (!address) throw new Error('HTTP 插件未报告监听地址');
  return { ctx, base: `http://127.0.0.1:${address.port}`, close: async () => { await ctx.fiber.dispose(); } };
}

function owner(tenantId: string, userId: string): AuthPrincipal {
  return {
    schemaVersion: '1.0',
    tenantId,
    userId,
    sessionId: '11111111-1111-4111-8111-111111111111',
  } as AuthPrincipal;
}

/** 固定载荷，长度由内容派生，避免测试里出现对不上的手算数字。 */
const PAYLOAD = 'not-really-a-video';
const PAYLOAD_BYTES = new TextEncoder().encode(PAYLOAD).byteLength;

function request(overrides: Partial<UploadRequest> = {}): UploadRequest {
  const payload = new TextEncoder().encode(PAYLOAD);
  return {
    owner: null,
    extension: '.mp4',
    contentType: 'video/mp4',
    declaredBytes: payload.byteLength,
    chunks: (async function* () { yield payload; })(),
    ...overrides,
  } as UploadRequest;
}

test('an anonymous upload lands under _uploads and is assessable through the existing path contract', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fitness-upload-'));
  const previous = process.env.FITNESS_UPLOAD_REQUIRE_AUTH;
  process.env.FITNESS_UPLOAD_REQUIRE_AUTH = 'false';
  const server = await start(root);
  try {
    const body = new TextEncoder().encode('abc');
    const response = await fetch(`${server.base}/api/uploads`, {
      method: 'POST',
      headers: { 'content-type': 'video/mp4' },
      body,
    });
    assert.equal(response.status, 201);
    const receipt = await response.json() as any;

    assert.equal(receipt.schemaVersion, '1.0');
    assert.equal(receipt.anonymous, true);
    assert.equal(receipt.extension, '.mp4');
    assert.equal(receipt.bytes, 3);
    assert.equal(receipt.contentType, 'video/mp4');
    assert.match(receipt.id, /^[0-9a-f-]{36}$/);
    assert.equal(receipt.path, `_uploads/_anonymous/${receipt.id}.mp4`);
    // 指纹必须与实际落盘内容一致，否则「文件变过没有」这件事就无从证明。
    assert.equal(receipt.sha256, createHash('sha256').update(body).digest('hex'));
    assert.deepEqual(await readFile(join(root, '_uploads', '_anonymous', `${receipt.id}.mp4`)), Buffer.from(body));
    assert.ok(Date.parse(receipt.expiresAt) > Date.now());
    // 响应不得泄漏本机绝对路径。
    assert.ok(!JSON.stringify(receipt).includes(root));

    // 关键证据：上传返回的 path 无需任何转换即可用于既有评估接口。
    const assessment = await fetch(`${server.base}/api/assessments`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path: receipt.path, exercise: 'squat', targetRepetitions: 1 }),
    });
    assert.equal(assessment.status, 200);
    const result = await assessment.json() as any;
    assert.equal(result.video.bytes, 3);
    assert.equal(result.motion.repetitions.length, 1);

    // 暂存区是系统保留目录，不得出现在调试用清单里。
    const list = await fetch(`${server.base}/api/videos`);
    const items = (await list.json() as any).items as { path: string }[];
    assert.equal(items.length, 0, `暂存文件不应出现在 /api/videos：${JSON.stringify(items)}`);

    const removed = await fetch(`${server.base}/api/uploads/${receipt.id}`, { method: 'DELETE' });
    assert.equal(removed.status, 204);
    await assert.rejects(stat(join(root, '_uploads', '_anonymous', `${receipt.id}.mp4`)));
    const again = await fetch(`${server.base}/api/uploads/${receipt.id}`, { method: 'DELETE' });
    assert.equal(again.status, 404);
    assert.equal((await again.json() as any).error.code, 'UPLOAD_NOT_FOUND');
  } finally {
    await server.close();
    if (previous === undefined) delete process.env.FITNESS_UPLOAD_REQUIRE_AUTH;
    else process.env.FITNESS_UPLOAD_REQUIRE_AUTH = previous;
    await rm(root, { recursive: true, force: true });
  }
});

test('an unrecognised Content-Type is refused instead of guessed from a filename', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fitness-upload-'));
  const previous = process.env.FITNESS_UPLOAD_REQUIRE_AUTH;
  process.env.FITNESS_UPLOAD_REQUIRE_AUTH = 'false';
  const server = await start(root);
  try {
    const response = await fetch(`${server.base}/api/uploads`, {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: 'abc',
    });
    assert.equal(response.status, 400);
    const body = await response.json() as any;
    assert.equal(body.error.code, 'UPLOAD_INVALID');
    await assert.rejects(readdir(join(root, '_uploads', '_anonymous')));
  } finally {
    await server.close();
    if (previous === undefined) delete process.env.FITNESS_UPLOAD_REQUIRE_AUTH;
    else process.env.FITNESS_UPLOAD_REQUIRE_AUTH = previous;
    await rm(root, { recursive: true, force: true });
  }
});

test('the upload limit is enforced on real bytes, not on the declared length', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fitness-upload-'));
  const server = await start(root, { maxBytes: 8 });
  try {
    // 声明 1 字节，实际给 64 字节：只有按实写字节判断才会拒绝。
    const chunks = (async function* () { yield new Uint8Array(64); })();
    await assert.rejects(
      () => server.ctx.fitnessUploads.receive(request({ declaredBytes: 1, chunks })),
      (error: unknown) => error instanceof FitnessError && error.code === 'UPLOAD_TOO_LARGE',
    );
    // 半成品必须被删掉，不能留下一个能被评估接口读到的残缺文件。
    const leftovers = await readdir(join(root, '_uploads', '_anonymous')).catch(() => [] as string[]);
    assert.deepEqual(leftovers, []);
  } finally {
    await server.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('an upload belonging to another owner is invisible, not merely forbidden', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fitness-upload-'));
  const server = await start(root);
  try {
    const mine = owner('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222');
    const other = owner('33333333-3333-4333-8333-333333333333', '44444444-4444-4444-8444-444444444444');
    const receipt = await server.ctx.fitnessUploads.receive(request({ owner: mine }));
    assert.equal(receipt.anonymous, false);
    assert.equal(receipt.path, `_uploads/${mine.tenantId}/${mine.userId}/${receipt.id}.mp4`);

    // 别的租户删除同一个 id：与「不存在」不可区分。
    await assert.rejects(
      () => server.ctx.fitnessUploads.remove({ owner: other, id: receipt.id }),
      (error: unknown) => error instanceof FitnessError && error.code === 'UPLOAD_NOT_FOUND',
    );
    // 文件仍在：越权删除没有副作用。
    assert.equal((await stat(join(root, receipt.path))).size, PAYLOAD_BYTES);

    await server.ctx.fitnessUploads.remove({ owner: mine, id: receipt.id });
    await assert.rejects(stat(join(root, receipt.path)));
  } finally {
    await server.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('sweeping removes only files older than the retention window', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fitness-upload-'));
  const server = await start(root, { ttlMinutes: 5 });
  try {
    const stale = await server.ctx.fitnessUploads.receive(request());
    const fresh = await server.ctx.fitnessUploads.receive(request());
    const old = new Date(Date.now() - 10 * 60_000);
    await utimes(join(root, stale.path), old, old);

    const removed = await server.ctx.fitnessUploads.sweep();
    assert.equal(removed, 1);
    await assert.rejects(stat(join(root, stale.path)));
    assert.equal((await stat(join(root, fresh.path))).size, PAYLOAD_BYTES);
    // 空目录不会被误删：下次上传仍要能直接写进去。
    assert.ok((await stat(join(root, '_uploads', '_anonymous'))).isDirectory());
  } finally {
    await server.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('an upload without a configured video root is unavailable rather than defaulted', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fitness-upload-'));
  const ctx = createRuntime();
  await ctx.plugin(UploadsPlugin, { root: '' }).await();
  try {
    await assert.rejects(
      () => ctx.fitnessUploads.receive(request()),
      (error: unknown) => error instanceof FitnessError && error.code === 'UPLOAD_UNAVAILABLE',
    );
    assert.equal(ctx.fitnessUploads.root(), undefined);
  } finally {
    await ctx.fiber.dispose();
    await rm(root, { recursive: true, force: true });
  }
});

test('empty bodies and non-uuid owners are rejected before touching the disk', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fitness-upload-'));
  const server = await start(root);
  try {
    await assert.rejects(
      () => server.ctx.fitnessUploads.receive(request({ declaredBytes: 0, chunks: (async function* () {})() })),
      (error: unknown) => error instanceof FitnessError && error.code === 'UPLOAD_INVALID',
    );
    const bad = { ...owner('not-a-uuid', '44444444-4444-4444-8444-444444444444') } as AuthPrincipal;
    await assert.rejects(
      () => server.ctx.fitnessUploads.receive(request({ owner: bad })),
      (error: unknown) => error instanceof FitnessError && error.code === 'UPLOAD_INVALID',
    );
  } finally {
    await server.close();
    await rm(root, { recursive: true, force: true });
  }
});
