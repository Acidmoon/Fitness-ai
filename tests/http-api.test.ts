import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { Service, type Context } from 'cordis';
import { FitnessError, type AdviceResult, type ScoreResult } from '../src/contracts.ts';
import type { AuthPrincipal, AuthSession, FitnessAuth } from '../src/auth-contracts.ts';
import type {
  FitnessWorkoutHistory, WorkoutPage, WorkoutQuery, WorkoutRecord, WorkoutRecordInput, WorkoutStatistics,
} from '../src/history-contracts.ts';
import type { ClaimedUserChange, FitnessUsers, UserAccount, UserPage, UserWriteResult } from '../src/user-contracts.ts';
import { createRuntime, mountPlugins } from '../src/runtime.ts';
import { AssessmentPlugin } from '../src/plugins/assessment.ts';
import { ExerciseLibraryPlugin } from '../src/plugins/exercise-library.ts';
import { HttpApiPlugin, type HttpApiConfig } from '../src/plugins/http-api.ts';
import { JointMotionPlugin } from '../src/plugins/joint-motion.ts';
import { JsonArtifactsPlugin } from '../src/plugins/json-artifacts.ts';
import { LocalFilePlugin } from '../src/plugins/local-file.ts';
import { RuleAdvicePlugin } from '../src/plugins/rule-advice.ts';
import { RuleScoringPlugin } from '../src/plugins/rule-scoring.ts';
import { VideoAssessmentPlugin } from '../src/plugins/video-assessment.ts';
import { WorkoutInputPlugin } from '../src/plugins/workout-input.ts';
import type { FitnessPose, PoseOptions, PoseSequence, VideoFile } from '../src/vision-contracts.ts';
import { jsonResponse } from '../src/http-contracts.ts';
import { makePoses } from './vision-fixtures.ts';

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

async function start(
  config: Omit<HttpApiConfig, 'port' | 'onListening'> = {},
  extra: readonly { plugin: any; config?: any }[] = [],
): Promise<RunningServer> {
  const ctx = createRuntime();
  await ctx.plugin(FixturePosePlugin, { poses: makePoses() }).await();
  await mountPlugins(ctx, pipeline);
  for (const item of extra) await ctx.plugin(item.plugin, item.config).await();
  let address: { host: string; port: number } | undefined;
  await ctx.plugin(HttpApiPlugin, {
    port: 0,
    onListening: value => { address = value; },
    ...config,
  }).await();
  if (!address) throw new Error('HTTP 插件未报告监听地址');
  return {
    ctx,
    base: `http://127.0.0.1:${address.port}`,
    close: async () => { await ctx.fiber.dispose(); },
  };
}

async function json(response: Response): Promise<any> {
  return await response.json();
}

test('health lists only services that are activated', async () => {
  const server = await start();
  try {
    const response = await fetch(`${server.base}/api/health`);
    assert.equal(response.status, 200);
    const body = await json(response);
    assert.equal(body.schemaVersion, '1.0');
    assert.equal(body.status, 'ok');
    assert.ok(Number.isInteger(body.uptimeMs) && body.uptimeMs >= 0);
    for (const name of ['fitnessVideo', 'fitnessExercises', 'fitnessFiles', 'fitnessHttp']) {
      assert.ok(body.services.includes(name), `health 应列出已激活服务 ${name}`);
    }
    assert.ok(!body.services.includes('fitnessUsers'), '未装载的插件不得出现在 health 中');
  } finally {
    await server.close();
  }
});

test('a registered route answers until its disposer runs', async () => {
  const server = await start();
  try {
    const dispose = server.ctx.fitnessHttp.register({
      method: 'GET',
      path: '/probe',
      handler: () => jsonResponse(200, { hit: true }),
    });
    const served = await fetch(`${server.base}/probe`);
    assert.equal(served.status, 200);
    assert.deepEqual(await json(served), { hit: true });
    dispose();
    const removed = await fetch(`${server.base}/probe`);
    assert.equal(removed.status, 404);
    assert.equal((await json(removed)).error.code, 'INVALID_ARGUMENTS');
  } finally {
    await server.close();
  }
});

test('duplicate and overlapping route shapes are rejected', async () => {
  const server = await start();
  try {
    server.ctx.fitnessHttp.register({ method: 'GET', path: '/probe/{id}', handler: () => jsonResponse(200, {}) });
    assert.throws(
      () => server.ctx.fitnessHttp.register({ method: 'GET', path: '/probe/{id}', handler: () => jsonResponse(200, {}) }),
      /路由已注册/,
    );
    // 只换参数名仍是同一路径模式：两者会匹配同一批请求。
    assert.throws(
      () => server.ctx.fitnessHttp.register({ method: 'GET', path: '/probe/{name}', handler: () => jsonResponse(200, {}) }),
      /路由已注册/,
    );
    assert.throws(
      () => server.ctx.fitnessHttp.register({ method: 'GET', path: '/api/health', handler: () => jsonResponse(200, {}) }),
      /路由已注册/,
    );
    // 同一路径不同方法不是重复注册。
    server.ctx.fitnessHttp.register({ method: 'POST', path: '/probe/{id}', handler: () => jsonResponse(200, {}) });
  } finally {
    await server.close();
  }
});

test('path parameters match and static segments win over parameters', async () => {
  const server = await start();
  try {
    const standard = await fetch(`${server.base}/api/exercises/squat/standard`);
    assert.equal(standard.status, 200);
    assert.equal((await json(standard)).exerciseId, 'Bodyweight_Squat');

    server.ctx.fitnessHttp.register({
      method: 'GET', path: '/probe/fixed', handler: () => jsonResponse(200, { hit: 'static' }),
    });
    server.ctx.fitnessHttp.register({
      method: 'GET', path: '/probe/{id}', handler: context => jsonResponse(200, { hit: 'param', id: context.params['id'] }),
    });
    assert.equal((await json(await fetch(`${server.base}/probe/fixed`))).hit, 'static');
    const parameter = await json(await fetch(`${server.base}/probe/other`));
    assert.equal(parameter.hit, 'param');
    assert.equal(parameter.id, 'other');
  } finally {
    await server.close();
  }
});

test('routing and body failures use the frozen error envelope', async () => {
  const server = await start({ videoRoot: process.cwd() });
  try {
    const missing = await fetch(`${server.base}/api/unknown`);
    assert.equal(missing.status, 404);
    assert.deepEqual(Object.keys(await json(missing)), ['error']);

    const wrongMethod = await fetch(`${server.base}/api/health`, { method: 'POST' });
    assert.equal(wrongMethod.status, 405);
    assert.equal(wrongMethod.headers.get('allow'), 'GET');
    const methodBody = await json(wrongMethod);
    assert.equal(methodBody.error.code, 'INVALID_ARGUMENTS');

    const badBody = await fetch(`${server.base}/api/assessments`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"exercise":"squat","targetRepetitions":1}',
    });
    assert.equal(badBody.status, 400);
    assert.equal((await json(badBody)).error.code, 'INVALID_ARGUMENTS');

    const badExercise = await fetch(`${server.base}/api/assessments`, {
      method: 'POST', body: JSON.stringify({ path: 'a.mp4', exercise: 'bench', targetRepetitions: 1 }),
    });
    assert.equal(badExercise.status, 400);
    assert.equal((await json(badExercise)).error.code, 'INVALID_ARGUMENTS');

    const notJson = await fetch(`${server.base}/api/assessments`, { method: 'POST', body: 'not-json' });
    assert.equal(notJson.status, 400);
    assert.equal((await json(notJson)).error.code, 'INVALID_ARGUMENTS');
  } finally {
    await server.close();
  }
});

test('an unexpected handler failure reports INTERNAL_ERROR without internals', async () => {
  const server = await start();
  try {
    server.ctx.fitnessHttp.register({
      method: 'GET',
      path: '/probe/crash',
      handler: () => { throw new Error('secret detail from src/private/thing.ts:42'); },
    });
    const response = await fetch(`${server.base}/probe/crash`);
    assert.equal(response.status, 500);
    const body = await json(response);
    assert.equal(body.error.code, 'INTERNAL_ERROR');
    assert.equal(body.error.message, '服务内部错误');
    // 未预期异常的细节只能进服务日志，不能经响应外泄。
    const text = JSON.stringify(body);
    assert.ok(!text.includes('secret detail'));
    assert.ok(!text.includes('thing.ts'));
    assert.equal('stack' in body.error, false);
  } finally {
    await server.close();
  }
});

test('an unconfigured video root fails with 503 instead of a default directory', async () => {
  const previous = process.env.FITNESS_VIDEO_ROOT;
  delete process.env.FITNESS_VIDEO_ROOT;
  const server = await start();
  try {
    const listing = await fetch(`${server.base}/api/videos`);
    assert.equal(listing.status, 503);
    const body = await json(listing);
    assert.equal(body.error.code, 'INPUT_IO');
    assert.match(body.error.message, /FITNESS_VIDEO_ROOT/);

    const assessment = await fetch(`${server.base}/api/assessments`, {
      method: 'POST', body: JSON.stringify({ path: 'a.mp4', exercise: 'squat', targetRepetitions: 1 }),
    });
    assert.equal(assessment.status, 503);
    assert.equal((await json(assessment)).error.code, 'INPUT_IO');
  } finally {
    await server.close();
    if (previous !== undefined) process.env.FITNESS_VIDEO_ROOT = previous;
  }
});

test('video paths outside the root are rejected and listings stay relative', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'fitness-http-'));
  const outside = await mkdtemp(join(tmpdir(), 'fitness-outside-'));
  try {
    await writeFile(join(directory, 'squat-smoke.mp4'), 'abc');
    await writeFile(join(outside, 'secret.mp4'), 'abc');
    const server = await start({ videoRoot: directory });
    try {
      const escaped = await fetch(`${server.base}/api/assessments`, {
        method: 'POST', body: JSON.stringify({ path: '../secret.mp4', exercise: 'squat', targetRepetitions: 1 }),
      });
      assert.equal(escaped.status, 400);
      assert.equal((await json(escaped)).error.code, 'INVALID_ARGUMENTS');

      const absolute = await fetch(`${server.base}/api/assessments`, {
        method: 'POST', body: JSON.stringify({ path: join(outside, 'secret.mp4'), exercise: 'squat', targetRepetitions: 1 }),
      });
      assert.equal(absolute.status, 400);
      assert.equal((await json(absolute)).error.code, 'INVALID_ARGUMENTS');

      const listing = await json(await fetch(`${server.base}/api/videos`));
      assert.equal(listing.total, 1);
      assert.equal(listing.items[0].path, 'squat-smoke.mp4');
      assert.equal(listing.items[0].name, 'squat-smoke.mp4');
      assert.equal(listing.items[0].bytes, 3);
      assert.ok(!JSON.stringify(listing).includes(JSON.stringify(directory).slice(1, -1)), '列表不得包含本机绝对路径');
    } finally {
      await server.close();
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});

test('a received video returns the frozen assessment fields without local paths', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'fitness-http-'));
  try {
    await writeFile(join(directory, 'squat-smoke.mp4'), 'abc');
    const server = await start({ videoRoot: directory });
    try {
      const response = await fetch(`${server.base}/api/assessments`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ path: 'squat-smoke.mp4', exercise: 'squat', targetRepetitions: 1 }),
      });
      assert.equal(response.status, 200);
      const body = await json(response);
      assert.equal(body.schemaVersion, '1.0');
      assert.equal(body.exercise, 'squat');
      assert.match(body.sessionId, /^http-/);
      assert.deepEqual(body.video.name, 'squat-smoke.mp4');
      assert.equal(body.video.bytes, 3);
      assert.equal(typeof body.video.width, 'number');
      assert.deepEqual(Object.keys(body.model).sort(), ['id', 'sha256']);
      assert.equal(body.model.runtime, undefined);
      assert.equal(body.sampling.requestedFps, 10);
      assert.equal(body.motion.repetitions.length, 1);
      assert.deepEqual(Object.keys(body.motion.repetitions[0]).sort(), [
        'bottomMs', 'confidence', 'durationMs', 'endMs', 'maxAngle', 'minAngle',
        'rangeOfMotion', 'stability', 'startMs',
      ]);
      assert.equal(typeof body.score.total, 'number');
      assert.equal(body.score.quality.evaluatedRepetitions, 1);
      assert.ok(body.advice.items.length >= 1);
      assert.ok(!JSON.stringify(body).includes(JSON.stringify(directory).slice(1, -1)), '响应不得包含本机绝对路径');
    } finally {
      await server.close();
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('unloading the plugin destroys the listener', async () => {
  const server = await start();
  await server.close();
  await assert.rejects(fetch(`${server.base}/api/health`));
});

/* ---------------- 认证路由 ---------------- */

const TENANT = '11111111-1111-4111-8111-111111111111';
const USER: UserAccount = Object.freeze({
  schemaVersion: '1.0' as const, tenantId: TENANT, id: '22222222-2222-4222-8222-222222222222',
  status: 'active' as const, version: 1,
  profile: { displayName: '测试用户', locale: 'zh-CN', timeZone: 'Asia/Shanghai', avatarAssetId: null },
  identities: [], createdAt: new Date(0).toISOString(), updatedAt: new Date(0).toISOString(), erasedAt: null,
});
const TOKEN = 'a'.repeat(43);

interface AuthState { readonly sessions: Map<string, AuthPrincipal>; locked: boolean; readonly calls: string[] }

class FakeAuth extends Service implements FitnessAuth {
  static provide = 'fitnessAuth';
  private readonly state: AuthState;
  constructor(ctx: Context, state: AuthState) { super(ctx, 'fitnessAuth'); this.state = state; }
  private rejectTenantFields(value: unknown): void {
    const body = value as Record<string, unknown>;
    if (body.tenantId !== undefined || body.userId !== undefined) {
      throw new FitnessError('INVALID_ARGUMENTS', '路由不接受客户端提交的 tenantId 或 userId');
    }
  }
  async register(value: unknown): Promise<AuthSession> {
    this.rejectTenantFields(value);
    this.state.calls.push('register');
    const session = Object.freeze({ schemaVersion: '1.0' as const, token: TOKEN, expiresAt: new Date(Date.now() + 3_600_000).toISOString(), user: USER });
    this.state.sessions.set(TOKEN, Object.freeze({ schemaVersion: '1.0' as const, tenantId: TENANT, userId: USER.id, sessionId: '33333333-3333-4333-8333-333333333333' }));
    return session;
  }
  async login(value: unknown): Promise<AuthSession> {
    this.rejectTenantFields(value);
    this.state.calls.push('login');
    if (this.state.locked) throw new FitnessError('AUTH_LOCKED', '登录失败次数过多，请稍后再试');
    if ((value as { password?: string }).password !== 'correct horse battery') {
      throw new FitnessError('AUTH_INVALID_CREDENTIALS', '身份或密码错误');
    }
    const session = Object.freeze({ schemaVersion: '1.0' as const, token: TOKEN, expiresAt: new Date(Date.now() + 3_600_000).toISOString(), user: USER });
    this.state.sessions.set(TOKEN, Object.freeze({ schemaVersion: '1.0' as const, tenantId: TENANT, userId: USER.id, sessionId: '33333333-3333-4333-8333-333333333333' }));
    return session;
  }
  async authenticate(token: string): Promise<AuthPrincipal> {
    const principal = this.state.sessions.get(token);
    if (!principal) throw new FitnessError('AUTH_UNAUTHENTICATED', '令牌无效、已过期或已吊销');
    return principal;
  }
  async logout(token: string): Promise<void> { this.state.calls.push('logout'); this.state.sessions.delete(token); }
  async changePassword(_principal: AuthPrincipal, value: unknown): Promise<void> {
    this.rejectTenantFields(value);
    this.state.calls.push('changePassword');
  }
  async revokeAll(): Promise<number> { return 0; }
}

class FakeUsers extends Service implements FitnessUsers {
  static provide = 'fitnessUsers';
  constructor(ctx: Context) { super(ctx, 'fitnessUsers'); }
  async get(tenantId: string, userId: string): Promise<UserAccount | null> {
    return tenantId === TENANT && userId === USER.id ? USER : null;
  }
  async create(): Promise<UserWriteResult> { throw new Error('未实现'); }
  async list(): Promise<UserPage> { throw new Error('未实现'); }
  async updateProfile(): Promise<UserWriteResult> { throw new Error('未实现'); }
  async changeStatus(): Promise<UserWriteResult> { throw new Error('未实现'); }
  async linkIdentity(): Promise<UserWriteResult> { throw new Error('未实现'); }
  async unlinkIdentity(): Promise<UserWriteResult> { throw new Error('未实现'); }
  async findByIdentity(): Promise<UserAccount | null> { throw new Error('未实现'); }
  async readIdentitySubject(): Promise<string | null> { throw new Error('未实现'); }
  async erase(): Promise<UserWriteResult> { throw new Error('未实现'); }
  async reencrypt(): Promise<UserWriteResult> { throw new Error('未实现'); }
  async claimChanges(): Promise<readonly ClaimedUserChange[]> { throw new Error('未实现'); }
  async acknowledgeChange(): Promise<void> { throw new Error('未实现'); }
}

async function startWithAuth(): Promise<{ server: RunningServer; state: AuthState }> {
  const state: AuthState = { sessions: new Map(), locked: false, calls: [] };
  const server = await start({ videoRoot: process.cwd() }, [
    { plugin: FakeUsers },
    { plugin: FakeAuth, config: state },
  ]);
  return { server, state };
}

test('account routes only exist when the auth plugin is mounted', async () => {
  const server = await start();
  try {
    const response = await fetch(`${server.base}/api/auth/me`);
    assert.equal(response.status, 404);
  } finally {
    await server.close();
  }
});

test('register returns 201 with a token and rejects client-supplied tenant fields', async () => {
  const { server } = await startWithAuth();
  try {
    const created = await fetch(`${server.base}/api/auth/register`, {
      method: 'POST',
      body: JSON.stringify({
        identity: { provider: 'email', subject: 'user@example.com' },
        password: 'correct horse battery',
        profile: { displayName: '测试用户', locale: 'zh-CN', timeZone: 'Asia/Shanghai', avatarAssetId: null },
      }),
    });
    assert.equal(created.status, 201);
    const session = await json(created);
    assert.equal(session.token, TOKEN);
    assert.equal(session.user.id, USER.id);

    const smuggled = await fetch(`${server.base}/api/auth/register`, {
      method: 'POST',
      body: JSON.stringify({
        tenantId: TENANT,
        identity: { provider: 'email', subject: 'user@example.com' },
        password: 'correct horse battery',
        profile: { displayName: '测试用户', locale: 'zh-CN', timeZone: 'Asia/Shanghai', avatarAssetId: null },
      }),
    });
    assert.equal(smuggled.status, 400);
    assert.equal((await json(smuggled)).error.code, 'INVALID_ARGUMENTS');
  } finally {
    await server.close();
  }
});

test('protected account routes require a bearer token and never leak existence', async () => {
  const { server } = await startWithAuth();
  try {
    const anonymous = await fetch(`${server.base}/api/auth/me`);
    assert.equal(anonymous.status, 401);
    assert.equal((await json(anonymous)).error.code, 'AUTH_UNAUTHENTICATED');

    const wrong = await fetch(`${server.base}/api/auth/me`, { headers: { authorization: 'Bearer ' + 'b'.repeat(43) } });
    assert.equal(wrong.status, 401);

    await fetch(`${server.base}/api/auth/register`, {
      method: 'POST',
      body: JSON.stringify({
        identity: { provider: 'email', subject: 'user@example.com' },
        password: 'correct horse battery',
        profile: { displayName: '测试用户', locale: 'zh-CN', timeZone: 'Asia/Shanghai', avatarAssetId: null },
      }),
    });
    const me = await fetch(`${server.base}/api/auth/me`, { headers: { authorization: `Bearer ${TOKEN}` } });
    assert.equal(me.status, 200);
    assert.equal((await json(me)).id, USER.id);
  } finally {
    await server.close();
  }
});

test('logout returns 204 and revokes the token; password change returns 204', async () => {
  const { server, state } = await startWithAuth();
  try {
    await fetch(`${server.base}/api/auth/register`, {
      method: 'POST',
      body: JSON.stringify({
        identity: { provider: 'email', subject: 'user@example.com' },
        password: 'correct horse battery',
        profile: { displayName: '测试用户', locale: 'zh-CN', timeZone: 'Asia/Shanghai', avatarAssetId: null },
      }),
    });
    const logout = await fetch(`${server.base}/api/auth/logout`, { method: 'POST', headers: { authorization: `Bearer ${TOKEN}` } });
    assert.equal(logout.status, 204);
    assert.equal(await logout.text(), '');
    const after = await fetch(`${server.base}/api/auth/me`, { headers: { authorization: `Bearer ${TOKEN}` } });
    assert.equal(after.status, 401);

    state.sessions.set(TOKEN, Object.freeze({ schemaVersion: '1.0' as const, tenantId: TENANT, userId: USER.id, sessionId: '33333333-3333-4333-8333-333333333333' }));
    const changed = await fetch(`${server.base}/api/auth/password`, {
      method: 'POST',
      headers: { authorization: `Bearer ${TOKEN}` },
      body: JSON.stringify({ currentPassword: 'correct horse battery', newPassword: 'another strong one' }),
    });
    assert.equal(changed.status, 204);
    assert.ok(state.calls.includes('changePassword'));
  } finally {
    await server.close();
  }
});

test('login maps invalid credentials to 401 and a locked account to 429', async () => {
  const { server, state } = await startWithAuth();
  try {
    const wrong = await fetch(`${server.base}/api/auth/login`, {
      method: 'POST',
      body: JSON.stringify({ identity: { provider: 'email', subject: 'user@example.com' }, password: 'wrong password!!' }),
    });
    assert.equal(wrong.status, 401);
    assert.equal((await json(wrong)).error.code, 'AUTH_INVALID_CREDENTIALS');

    state.locked = true;
    const locked = await fetch(`${server.base}/api/auth/login`, {
      method: 'POST',
      body: JSON.stringify({ identity: { provider: 'email', subject: 'user@example.com' }, password: 'correct horse battery' }),
    });
    assert.equal(locked.status, 429);
    assert.equal((await json(locked)).error.code, 'AUTH_LOCKED');
  } finally {
    await server.close();
  }
});

/* ---------------- 运动历史路由 ---------------- */

const WORKOUT_ID = '44444444-4444-4444-8444-444444444444';
const MISSING_ID = '55555555-5555-4555-8555-555555555555';
const THROWING_ID = '66666666-6666-4666-8666-666666666666';

const SCORE: ScoreResult = Object.freeze({
  policy: { id: 'demo-squat-score', version: '0.1.0', kind: 'heuristic' as const },
  total: 82.97,
  dimensions: [{ key: 'completion' as const, label: '完成度', value: 0.3, weight: 0.4, points: 13.19 }],
  quality: { observedRepetitions: 3, evaluatedRepetitions: 3, excludedRepetitions: 0 },
});

const ADVICE: AdviceResult = Object.freeze({
  policy: { id: 'demo-squat-advice', version: '0.1.0', kind: 'heuristic' as const },
  items: Object.freeze([{ code: 'RANGE', message: '深蹲深度不足' }]),
});

function workoutRecord(): WorkoutRecord {
  return Object.freeze({
    schemaVersion: '1.0' as const,
    id: WORKOUT_ID,
    sessionId: 'session-1',
    exercise: 'squat',
    total: 82.97,
    observedRepetitions: 3,
    targetRepetitions: 10,
    source: 'video' as const,
    capturedAt: new Date(0).toISOString(),
    createdAt: new Date(0).toISOString(),
    score: SCORE,
    advice: ADVICE,
  });
}

interface HistoryState {
  readonly records: Map<string, WorkoutRecord>;
  readonly calls: { kind: string; principal?: AuthPrincipal; query?: WorkoutQuery | undefined }[];
}

class FakeHistory extends Service implements FitnessWorkoutHistory {
  static provide = 'fitnessWorkoutHistory';
  private readonly state: HistoryState;
  constructor(ctx: Context, state: HistoryState) { super(ctx, 'fitnessWorkoutHistory'); this.state = state; }

  async record(principal: AuthPrincipal, value: unknown): Promise<WorkoutRecord> {
    this.state.calls.push({ kind: 'record', principal });
    const input = value as WorkoutRecordInput;
    // The route must supply schemaVersion itself; a client-supplied value never survives.
    if (input.schemaVersion !== '1.0') throw new FitnessError('WORKOUT_INVALID', 'schemaVersion 必须是 1.0');
    const record = workoutRecord();
    this.state.records.set(record.id, record);
    return record;
  }
  async list(principal: AuthPrincipal, query?: WorkoutQuery): Promise<WorkoutPage> {
    this.state.calls.push({ kind: 'list', principal, query });
    return Object.freeze({
      schemaVersion: '1.0' as const, items: Object.freeze([...this.state.records.values()]), nextCursor: null,
    });
  }
  async get(_principal: AuthPrincipal, id: string): Promise<WorkoutRecord> {
    this.state.calls.push({ kind: 'get' });
    if (id === THROWING_ID) throw new FitnessError('WORKOUT_NOT_FOUND', '运动记录不存在');
    // The route must also treat a null answer as 404 while the contract signature is still nullable.
    return (this.state.records.get(id) ?? null) as WorkoutRecord;
  }
  async remove(_principal: AuthPrincipal, id: string): Promise<void> {
    this.state.calls.push({ kind: 'remove' });
    if (!this.state.records.delete(id)) throw new FitnessError('WORKOUT_NOT_FOUND', '运动记录不存在');
  }
  async statistics(_principal: AuthPrincipal): Promise<WorkoutStatistics> {
    this.state.calls.push({ kind: 'statistics' });
    return Object.freeze({
      schemaVersion: '1.0' as const, totalWorkouts: 1, totalObservedRepetitions: 3,
      lastCapturedAt: new Date(0).toISOString(),
      byExercise: Object.freeze([{ exercise: 'squat', workouts: 1, averageScore: 82.97 }]),
    });
  }
}

async function startWithHistory(): Promise<{ server: RunningServer; history: HistoryState }> {
  const auth: AuthState = {
    sessions: new Map([[TOKEN, Object.freeze({
      schemaVersion: '1.0' as const, tenantId: TENANT, userId: USER.id, sessionId: '33333333-3333-4333-8333-333333333333',
    })]]),
    locked: false,
    calls: [],
  };
  const history: HistoryState = { records: new Map(), calls: [] };
  const server = await start({ videoRoot: process.cwd() }, [
    { plugin: FakeUsers },
    { plugin: FakeAuth, config: auth },
    { plugin: FakeHistory, config: history },
  ]);
  return { server, history };
}

function recordBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    sessionId: 'session-1',
    exercise: 'squat',
    targetRepetitions: 10,
    observedRepetitions: 3,
    score: SCORE,
    advice: ADVICE,
    source: 'video',
    ...overrides,
  };
}

test('workout routes exist only with the history service and require a session', async () => {
  const bare = await start();
  try {
    const missing = await fetch(`${bare.base}/api/workouts`);
    assert.equal(missing.status, 404);
    const missingStatistics = await fetch(`${bare.base}/api/workouts/statistics`);
    assert.equal(missingStatistics.status, 404);
  } finally {
    await bare.close();
  }

  const { server, history } = await startWithHistory();
  try {
    const anonymous = await fetch(`${server.base}/api/workouts`);
    assert.equal(anonymous.status, 401);
    assert.equal((await json(anonymous)).error.code, 'AUTH_UNAUTHENTICATED');

    const listed = await fetch(`${server.base}/api/workouts?limit=5&exercise=squat&after=abc&from=2026-01-01T00:00:00Z`, {
      headers: { authorization: `Bearer ${TOKEN}` },
    });
    assert.equal(listed.status, 200);
    const page = await json(listed);
    assert.equal(page.schemaVersion, '1.0');
    assert.deepEqual(page.items, []);
    assert.equal(page.nextCursor, null);
    const call = history.calls.find(item => item.kind === 'list')!;
    assert.equal(call.principal!.userId, USER.id);
    assert.deepEqual(call.query, { limit: 5, exercise: 'squat', after: 'abc', from: '2026-01-01T00:00:00Z' });

    const unknown = await fetch(`${server.base}/api/workouts?offset=1`, { headers: { authorization: `Bearer ${TOKEN}` } });
    assert.equal(unknown.status, 400);
    assert.equal((await json(unknown)).error.code, 'INVALID_ARGUMENTS');

    const badLimit = await fetch(`${server.base}/api/workouts?limit=0`, { headers: { authorization: `Bearer ${TOKEN}` } });
    assert.equal(badLimit.status, 400);
  } finally {
    await server.close();
  }
});

test('recording a workout takes the principal from the session and rejects identity fields', async () => {
  const { server, history } = await startWithHistory();
  const headers = { authorization: `Bearer ${TOKEN}` };
  try {
    const anonymous = await fetch(`${server.base}/api/workouts`, { method: 'POST', body: JSON.stringify(recordBody()) });
    assert.equal(anonymous.status, 401);

    const created = await fetch(`${server.base}/api/workouts`, {
      method: 'POST', headers, body: JSON.stringify(recordBody({ schemaVersion: '2.0' })),
    });
    assert.equal(created.status, 201);
    const record = await json(created);
    assert.equal(record.id, WORKOUT_ID);
    assert.equal(record.score.total, 82.97);
    const call = history.calls.find(item => item.kind === 'record')!;
    assert.equal(call.principal!.tenantId, TENANT);
    assert.equal(call.principal!.userId, USER.id);

    for (const field of ['tenantId', 'userId', 'actorId', 'verified']) {
      const smuggled = await fetch(`${server.base}/api/workouts`, {
        method: 'POST', headers, body: JSON.stringify(recordBody({ [field]: TENANT })),
      });
      assert.equal(smuggled.status, 400, `客户端提交 ${field} 必须被拒绝`);
      assert.equal((await json(smuggled)).error.code, 'INVALID_ARGUMENTS');
    }
  } finally {
    await server.close();
  }
});

test('a workout lookup validates the id and keeps absent and foreign records indistinguishable', async () => {
  const { server, history } = await startWithHistory();
  const headers = { authorization: `Bearer ${TOKEN}` };
  try {
    const malformed = await fetch(`${server.base}/api/workouts/not-a-uuid`, { headers });
    assert.equal(malformed.status, 400);
    assert.equal((await json(malformed)).error.code, 'INVALID_ARGUMENTS');

    for (const id of [MISSING_ID, THROWING_ID]) {
      const absent = await fetch(`${server.base}/api/workouts/${id}`, { headers });
      assert.equal(absent.status, 404);
      assert.equal((await json(absent)).error.code, 'WORKOUT_NOT_FOUND');
    }

    await fetch(`${server.base}/api/workouts`, { method: 'POST', headers, body: JSON.stringify(recordBody()) });
    const found = await fetch(`${server.base}/api/workouts/${WORKOUT_ID}`, { headers });
    assert.equal(found.status, 200);
    const body = await json(found);
    assert.equal(body.id, WORKOUT_ID);
    assert.equal(body.advice.items[0].code, 'RANGE');

    // The static statistics segment must win over the {id} pattern.
    const statistics = await fetch(`${server.base}/api/workouts/statistics`, { headers });
    assert.equal(statistics.status, 200);
    const summary = await json(statistics);
    assert.equal(summary.totalWorkouts, 1);
    assert.equal(summary.byExercise[0].averageScore, 82.97);
    assert.equal(summary.schemaVersion, '1.0');
    assert.ok(history.calls.some(item => item.kind === 'statistics'));
  } finally {
    await server.close();
  }
});

test('deleting a workout returns 204 and a second delete is a 404', async () => {
  const { server } = await startWithHistory();
  const headers = { authorization: `Bearer ${TOKEN}` };
  try {
    const anonymous = await fetch(`${server.base}/api/workouts/${WORKOUT_ID}`, { method: 'DELETE' });
    assert.equal(anonymous.status, 401);

    const malformed = await fetch(`${server.base}/api/workouts/nope`, { method: 'DELETE', headers });
    assert.equal(malformed.status, 400);

    await fetch(`${server.base}/api/workouts`, { method: 'POST', headers, body: JSON.stringify(recordBody()) });
    const removed = await fetch(`${server.base}/api/workouts/${WORKOUT_ID}`, { method: 'DELETE', headers });
    assert.equal(removed.status, 204);
    assert.equal(await removed.text(), '');

    const again = await fetch(`${server.base}/api/workouts/${WORKOUT_ID}`, { method: 'DELETE', headers });
    assert.equal(again.status, 404);
    assert.equal((await json(again)).error.code, 'WORKOUT_NOT_FOUND');
  } finally {
    await server.close();
  }
});
