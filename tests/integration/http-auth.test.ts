import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import test, { after, before } from 'node:test';
import { Service, type Context } from 'cordis';
import { Client } from 'pg';
import type { AdviceResult, ScoreResult } from '../../src/contracts.ts';import type { FitnessPose, PoseOptions, PoseSequence, VideoFile } from '../../src/vision-contracts.ts';
import { createRuntime, mountPlugins } from '../../src/runtime.ts';
import { AssessmentPlugin } from '../../src/plugins/assessment.ts';
import { AuthPlugin } from '../../src/plugins/auth.ts';
import { ExerciseLibraryPlugin } from '../../src/plugins/exercise-library.ts';
import { HttpApiPlugin } from '../../src/plugins/http-api.ts';
import { JointMotionPlugin } from '../../src/plugins/joint-motion.ts';
import { JsonArtifactsPlugin } from '../../src/plugins/json-artifacts.ts';
import { LocalFilePlugin } from '../../src/plugins/local-file.ts';
import { PostgresPlugin } from '../../src/plugins/postgres.ts';
import { RuleAdvicePlugin } from '../../src/plugins/rule-advice.ts';
import { RuleScoringPlugin } from '../../src/plugins/rule-scoring.ts';
import { UserDataProtectionPlugin } from '../../src/plugins/user-data-protection.ts';
import { UserDatabasePlugin } from '../../src/plugins/user-database.ts';
import { VideoAssessmentPlugin } from '../../src/plugins/video-assessment.ts';
import { WorkoutHistoryPlugin } from '../../src/plugins/workout-history.ts';
import { WorkoutInputPlugin } from '../../src/plugins/workout-input.ts';
import {
  grantUserDatabaseAccess, initializeUserLookupKey, migrateUserDatabase, provisionUserTenant,
} from '../../src/user-migrations.ts';
import { makePoses } from '../vision-fixtures.ts';

/**
 * End-to-end account and history routes against a real PostgreSQL database.
 *
 * The auth tables, the row level security policies and every SQL statement are only
 * proven here: the unit tests stand in a fake database, so they cannot catch syntax,
 * parameter type inference, `set_config` scoping or the `JOIN accounts` filter.
 *
 * This file owns its own database inside the temporary cluster so that it does not
 * share the lookup key registry with the user database suite; both files may run in
 * either order.
 */

const adminUrl = process.env.FITNESS_TEST_ADMIN_DATABASE_URL;
const runtimeUrl = process.env.FITNESS_TEST_DATABASE_URL;
if (!adminUrl || !runtimeUrl) throw new Error('Use pnpm test:database; an isolated PostgreSQL cluster is required.');

const DATABASE = 'fitness_http_auth_test';
const RUNTIME_ROLE = 'fitness_users_runtime';
function onOwnDatabase(connectionString: string): string {
  const url = new URL(connectionString);
  url.pathname = `/${DATABASE}`;
  return url.toString();
}
const adminDatabaseUrl = onOwnDatabase(adminUrl);
const runtimeDatabaseUrl = onOwnDatabase(runtimeUrl);

const TENANT = randomUUID();
const keys = { key1: randomBytes(32).toString('base64url'), key2: randomBytes(32).toString('base64url') };
const cryptoConfig = { keys, activeKeyId: 'key1', lookupKey: randomBytes(32).toString('base64url') };
const PASSWORD = 'correct horse battery';
const PROFILE = { displayName: '真实库测试用户', locale: 'zh-CN', timeZone: 'Asia/Shanghai', avatarAssetId: null };

class FixturePosePlugin extends Service implements FitnessPose {
  static provide = 'fitnessPose';
  private readonly poses: PoseSequence;
  constructor(ctx: Context, config: { poses: PoseSequence }) { super(ctx, 'fitnessPose'); this.poses = config.poses; }
  async estimate(_video: VideoFile, _options?: PoseOptions): Promise<PoseSequence> { return this.poses; }
}

/** The HTTP entry point injects these three video services, so the pipeline has to be mounted. */
const pipeline = [
  VideoAssessmentPlugin, AssessmentPlugin, LocalFilePlugin, JointMotionPlugin, JsonArtifactsPlugin,
  WorkoutInputPlugin, RuleScoringPlugin, RuleAdvicePlugin, ExerciseLibraryPlugin,
];

const scoreOf = (total: number): ScoreResult => ({
  policy: { id: 'demo-workout-scoring', version: '0.1.0', kind: 'heuristic' },
  total,
  dimensions: [{ key: 'completion', label: '可评估次数完成度', value: 0.8, weight: 1, points: total }],
  quality: { observedRepetitions: 3, evaluatedRepetitions: 3, excludedRepetitions: 0 },
});
const ADVICE_TEXT = '本次数据满足当前演示规则，保持动作质量。';
const adviceOf = (): AdviceResult => ({
  policy: { id: 'demo-workout-advice', version: '0.1.0', kind: 'heuristic' },
  items: [{ code: 'maintain', message: ADVICE_TEXT }],
});
const workoutBody = (): Record<string, unknown> => ({
  sessionId: `assessment-${randomUUID()}`,
  exercise: 'bodyweight-squat',
  targetRepetitions: 3,
  observedRepetitions: 3,
  score: scoreOf(82.97),
  advice: adviceOf(),
  source: 'video',
});

let owner: Context;
let hub: Context;
let base = '';
let inspector: Client;

async function boot(): Promise<Context> {
  const ctx = createRuntime();
  try {
    await ctx.plugin(FixturePosePlugin, { poses: makePoses() }).await();
    await mountPlugins(ctx, pipeline);
    await ctx.plugin(PostgresPlugin, { connectionString: runtimeDatabaseUrl, tls: 'local' }).await();
    await ctx.plugin(UserDataProtectionPlugin, cryptoConfig).await();
    await ctx.plugin(UserDatabasePlugin).await();
    await ctx.plugin(WorkoutHistoryPlugin).await();
    await ctx.plugin(AuthPlugin, { tenantId: TENANT, maxAttempts: 3, lockMinutes: 1, sessionHours: 1 }).await();
    let address: { host: string; port: number } | undefined;
    await ctx.plugin(HttpApiPlugin, { port: 0, onListening: value => { address = value; } }).await();
    if (!address) throw new Error('HTTP 插件未报告监听地址');
    base = `http://127.0.0.1:${address.port}`;
    return ctx;
  } catch (error) {
    await ctx.fiber.dispose();
    throw error;
  }
}

interface Reply { readonly status: number; readonly body: any; readonly text: string }

async function call(path: string, options: { method?: string; token?: string; body?: unknown } = {}): Promise<Reply> {
  const headers: Record<string, string> = {};
  if (options.token !== undefined) headers['authorization'] = `Bearer ${options.token}`;
  const init: RequestInit = { method: options.method ?? 'GET', headers };
  if (options.body !== undefined) {
    headers['content-type'] = 'application/json';
    init.body = JSON.stringify(options.body);
  }
  const response = await fetch(`${base}${path}`, init);
  const text = await response.text();
  let body: any = null;
  if (text) { try { body = JSON.parse(text); } catch { body = text; } }
  return { status: response.status, body, text };
}

const identity = () => ({ provider: 'email', subject: `user-${randomUUID()}@example.com` });

async function register(login = identity()): Promise<{ token: string; userId: string }> {
  const created = await call('/api/auth/register', { method: 'POST', body: { identity: login, password: PASSWORD, profile: PROFILE } });
  assert.equal(created.status, 201, `注册应返回 201，实际 ${created.status}: ${created.text}`);
  return { token: created.body.token as string, userId: created.body.user.id as string };
}

async function login(login: { provider: string; subject: string }, password = PASSWORD): Promise<Reply> {
  return call('/api/auth/login', { method: 'POST', body: { identity: login, password } });
}

before(async () => {
  const admin = new Client({ connectionString: adminUrl, ssl: false });
  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE ${DATABASE}`);
  } finally { await admin.end(); }

  owner = createRuntime();
  try {
    await owner.plugin(PostgresPlugin, { connectionString: adminDatabaseUrl, tls: 'local' }).await();
    await owner.plugin(UserDataProtectionPlugin, cryptoConfig).await();
    assert.deepEqual(await migrateUserDatabase(owner.fitnessDatabase), { applied: 3, version: 3 });
    await grantUserDatabaseAccess(owner.fitnessDatabase, RUNTIME_ROLE);
    await initializeUserLookupKey(owner.fitnessDatabase, owner.fitnessUserDataProtection);
    await provisionUserTenant(owner.fitnessDatabase, TENANT, 'HTTP auth integration tenant');
  } catch (error) {
    await owner.fiber.dispose();
    throw error;
  }
  inspector = new Client({ connectionString: adminDatabaseUrl, ssl: false });
  await inspector.connect();
  hub = await boot();
});

after(async () => {
  await hub?.fiber.dispose();
  await inspector?.end().catch(() => undefined);
  await owner?.fiber.dispose();
});

test('register, login, me and logout run against the real credential tables', async () => {
  const loginValue = identity();
  const created = await call('/api/auth/register', { method: 'POST', body: { identity: loginValue, password: PASSWORD, profile: PROFILE } });
  assert.equal(created.status, 201);
  const token = created.body.token as string;
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  const userId = created.body.user.id as string;
  assert.match(userId, /^[0-9a-f-]{36}$/);

  // The database holds a fingerprint of the token, never the token itself.
  const stored = await inspector.query<{ token_lookup: string }>(
    'SELECT token_lookup FROM fitness_users.sessions WHERE user_id=$1', [userId]);
  assert.equal(stored.rowCount, 1);
  assert.match(stored.rows[0]!.token_lookup, /^[a-f0-9]{64}$/);
  assert.notEqual(stored.rows[0]!.token_lookup, token);

  const loggedIn = await login(loginValue);
  assert.equal(loggedIn.status, 200, loggedIn.text);
  const second = loggedIn.body.token as string;
  assert.notEqual(second, token);

  const me = await call('/api/auth/me', { token: second });
  assert.equal(me.status, 200);
  assert.equal(me.body.id, userId);
  assert.equal(me.body.tenantId, TENANT);

  const anonymous = await call('/api/auth/me');
  assert.equal(anonymous.status, 401);
  assert.equal(anonymous.body.error.code, 'AUTH_UNAUTHENTICATED');

  const logout = await call('/api/auth/logout', { method: 'POST', token: second });
  assert.equal(logout.status, 204);
  assert.equal(logout.text, '');
  assert.equal((await call('/api/auth/me', { token: second })).status, 401);
  // Logging out one session must not touch the other one.
  assert.equal((await call('/api/auth/me', { token })).status, 200);
  // Logout stays idempotent against a revoked token.
  assert.equal((await call('/api/auth/logout', { method: 'POST', token: second })).status, 204);
});

test('lockout counts real failures and restarts the streak after the lock expires', async () => {
  const loginValue = identity();
  const { userId } = await register(loginValue);

  for (let attempt = 0; attempt < 2; attempt++) {
    const rejected = await login(loginValue, 'wrong password!!');
    assert.equal(rejected.status, 401, rejected.text);
    assert.equal(rejected.body.error.code, 'AUTH_INVALID_CREDENTIALS');
  }
  const locked = await login(loginValue, 'wrong password!!');
  assert.equal(locked.status, 429);
  assert.equal(locked.body.error.code, 'AUTH_LOCKED');
  // A locked account rejects the correct password as well.
  assert.equal((await login(loginValue)).status, 429);

  const before = await inspector.query<{ failed_attempts: number; locked_until: Date | null }>(
    'SELECT failed_attempts,locked_until FROM fitness_users.credentials WHERE user_id=$1', [userId]);
  assert.equal(before.rows[0]!.failed_attempts, 3);
  assert.ok(before.rows[0]!.locked_until !== null);

  // Expire the lock without touching the counter: the next failure has to restart the streak.
  const expired = await inspector.query(
    "UPDATE fitness_users.credentials SET locked_until=clock_timestamp() - interval '1 minute' WHERE user_id=$1", [userId]);
  assert.equal(expired.rowCount, 1);

  const first = await login(loginValue, 'wrong password!!');
  assert.equal(first.status, 401);
  assert.equal(first.body.error.code, 'AUTH_INVALID_CREDENTIALS');
  const counted = await inspector.query<{ failed_attempts: number; locked_until: Date | null }>(
    'SELECT failed_attempts,locked_until FROM fitness_users.credentials WHERE user_id=$1', [userId]);
  assert.equal(counted.rows[0]!.failed_attempts, 1, '锁定到期后的第一次失败必须从 1 重新计数');
  assert.equal(counted.rows[0]!.locked_until, null);

  assert.equal((await login(loginValue, 'wrong password!!')).status, 401);
  const relocked = await login(loginValue, 'wrong password!!');
  assert.equal(relocked.status, 429);
  assert.equal(relocked.body.error.code, 'AUTH_LOCKED');
  // The user gets the full streak again, so the counter is maxAttempts and not four.
  const after = await inspector.query<{ failed_attempts: number }>(
    'SELECT failed_attempts FROM fitness_users.credentials WHERE user_id=$1', [userId]);
  assert.equal(after.rows[0]!.failed_attempts, 3);
});

test('sessions expire and a password change revokes the other sessions', async () => {
  const loginValue = identity();
  const { token: firstToken } = await register(loginValue);
  const second = await login(loginValue);
  assert.equal(second.status, 200);
  const secondToken = second.body.token as string;

  const changed = await call('/api/auth/password', {
    method: 'POST', token: secondToken, body: { currentPassword: PASSWORD, newPassword: 'another strong one' },
  });
  assert.equal(changed.status, 204);
  assert.equal((await call('/api/auth/me', { token: secondToken })).status, 200);
  assert.equal((await call('/api/auth/me', { token: firstToken })).status, 401);

  // The new password works on the real scrypt hash stored in the database.
  const relogin = await login(loginValue, 'another strong one');
  assert.equal(relogin.status, 200);

  const expired = await inspector.query(
    "UPDATE fitness_users.sessions SET expires_at=clock_timestamp() - interval '1 second' WHERE user_id=$1",
    [second.body.user.id]);
  assert.ok((expired.rowCount ?? 0) >= 1);
  assert.equal((await call('/api/auth/me', { token: secondToken })).status, 401);
  assert.equal((await call('/api/auth/me', { token: relogin.body.token as string })).status, 401);
});

test('a duplicate identity conflicts and client identity fields are refused', async () => {
  const loginValue = identity();
  await register(loginValue);
  const duplicate = await call('/api/auth/register', {
    method: 'POST', body: { identity: loginValue, password: PASSWORD, profile: PROFILE },
  });
  assert.equal(duplicate.status, 409);
  assert.equal(duplicate.body.error.code, 'AUTH_CONFLICT');

  const smuggled = await call('/api/auth/register', {
    method: 'POST', body: { identity: identity(), password: PASSWORD, profile: PROFILE, tenantId: TENANT },
  });
  assert.equal(smuggled.status, 400);
  assert.equal(smuggled.body.error.code, 'INVALID_ARGUMENTS');
});

test('workout routes are registered and scoped to the authenticated user', async () => {
  const ownerUser = await register();
  const stranger = await register();

  // The five routes exist because the history service is mounted; a missing route would be 404 here too,
  // so each call also asserts the answer a working route must give.
  const empty = await call('/api/workouts', { token: ownerUser.token });
  assert.equal(empty.status, 200);
  assert.deepEqual(empty.body.items, []);
  assert.equal(empty.body.nextCursor, null);

  const anonymous = await call('/api/workouts');
  assert.equal(anonymous.status, 401);

  const created = await call('/api/workouts', { method: 'POST', token: ownerUser.token, body: workoutBody() });
  assert.equal(created.status, 201, `写入历史应返回 201，实际 ${created.status}: ${created.text}`);
  const recordId = created.body.id as string;
  assert.match(recordId, /^[0-9a-f-]{36}$/);
  assert.equal(created.body.score.total, 82.97);

  const fetched = await call(`/api/workouts/${recordId}`, { token: ownerUser.token });
  assert.equal(fetched.status, 200);
  assert.equal(fetched.body.advice.items[0].message, ADVICE_TEXT);

  const statistics = await call('/api/workouts/statistics', { token: ownerUser.token });
  assert.equal(statistics.status, 200);
  assert.equal(statistics.body.totalWorkouts, 1);
  assert.equal(statistics.body.byExercise[0].averageScore, 82.97);

  const badCursor = await call('/api/workouts?after=not-a-cursor', { token: ownerUser.token });
  assert.equal(badCursor.status, 400);
  assert.equal(badCursor.body.error.code, 'WORKOUT_INVALID');

  // Another authenticated user sees neither the record nor any trace of it.
  const foreignGet = await call(`/api/workouts/${recordId}`, { token: stranger.token });
  assert.equal(foreignGet.status, 404);
  assert.equal(foreignGet.body.error.code, 'WORKOUT_NOT_FOUND');
  const foreignList = await call('/api/workouts', { token: stranger.token });
  assert.equal(foreignList.status, 200);
  assert.deepEqual(foreignList.body.items, []);
  const foreignDelete = await call(`/api/workouts/${recordId}`, { method: 'DELETE', token: stranger.token });
  assert.equal(foreignDelete.status, 404);
  assert.equal((await call(`/api/workouts/${recordId}`, { token: ownerUser.token })).status, 200);

  // Score and advice are sealed in the database: only the aggregate columns are plaintext.
  const sealed = await inspector.query<{ sealed_detail: string; exercise: string }>(
    'SELECT sealed_detail,exercise FROM fitness_users.workout_records WHERE id=$1', [recordId]);
  assert.match(sealed.rows[0]!.sealed_detail, /^v1\./);
  assert.ok(!sealed.rows[0]!.sealed_detail.includes(ADVICE_TEXT), '明细必须整体加密，明文里不得出现建议文本');
  assert.equal(sealed.rows[0]!.exercise, 'bodyweight-squat');

  const removed = await call(`/api/workouts/${recordId}`, { method: 'DELETE', token: ownerUser.token });
  assert.equal(removed.status, 204);
  assert.equal(removed.text, '');
  assert.equal((await call(`/api/workouts/${recordId}`, { token: ownerUser.token })).status, 404);
});

test('the wrong password on a password change is not counted as a login failure', async () => {
  const { token, userId } = await register();
  const rejected = await call('/api/auth/password', {
    method: 'POST', token, body: { currentPassword: 'wrong password!!', newPassword: 'another strong one' },
  });
  assert.equal(rejected.status, 401, rejected.text);
  assert.equal(rejected.body.error.code, 'AUTH_INVALID_CREDENTIALS');
  const counted = await inspector.query<{ failed_attempts: number }>(
    'SELECT failed_attempts FROM fitness_users.credentials WHERE user_id=$1', [userId]);
  assert.equal(counted.rows[0]!.failed_attempts, 0);
  assert.equal((await call('/api/auth/me', { token })).status, 200);
});
