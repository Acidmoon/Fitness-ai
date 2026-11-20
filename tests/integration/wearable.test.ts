import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import test, { after, before } from 'node:test';
import { Client } from 'pg';
import { FitnessError } from '../../src/contracts.ts';
import type { AuthPrincipal } from '../../src/auth-contracts.ts';
import type { UserMutationContext, UserProfile } from '../../src/user-contracts.ts';
import { createRuntime } from '../../src/runtime.ts';
import { PostgresPlugin } from '../../src/plugins/postgres.ts';
import { UserDataProtectionPlugin } from '../../src/plugins/user-data-protection.ts';
import { UserDatabasePlugin } from '../../src/plugins/user-database.ts';
import { WorkoutHistoryPlugin } from '../../src/plugins/workout-history.ts';
import { WearablesPlugin } from '../../src/plugins/wearables.ts';
import {
  grantUserDatabaseAccess, initializeUserLookupKey, migrateUserDatabase, provisionUserTenant,
} from '../../src/user-migrations.ts';

/**
 * 可穿戴面的真实库验证。
 *
 * 假库单测证明不了这些：RLS 的租户隔离、`ON CONFLICT` 的去重语义、密文配上 AAD
 * 后能否回读、以及「先到者的值胜出」这条取舍。只有真 PostgreSQL 能证明。
 */

const adminUrl = process.env.FITNESS_TEST_ADMIN_DATABASE_URL;
const runtimeUrl = process.env.FITNESS_TEST_DATABASE_URL;
if (!adminUrl || !runtimeUrl) throw new Error('Use pnpm test:database; an isolated PostgreSQL cluster is required.');

// 与其他集成测试文件一样自带一个库：迁移、租户、数据都不会互相污染。
const DATABASE = 'fitness_wearable_test';
const RUNTIME_ROLE = 'fitness_users_runtime';
function onOwnDatabase(connectionString: string): string {
  const url = new URL(connectionString);
  url.pathname = `/${DATABASE}`;
  return url.toString();
}
const adminDatabaseUrl = onOwnDatabase(adminUrl);
const runtimeDatabaseUrl = onOwnDatabase(runtimeUrl);

const key1 = randomBytes(32).toString('base64url');
const key2 = randomBytes(32).toString('base64url');
const lookupKey = randomBytes(32).toString('base64url');
const cryptoConfig = { keys: { key1, key2 }, activeKeyId: 'key1', lookupKey };
const profile: UserProfile = { displayName: '可穿戴测试用户', locale: 'zh-CN', timeZone: 'Asia/Shanghai', avatarAssetId: null };
const mutation = (): UserMutationContext => ({ actorId: 'system:wearable-test', operationId: randomUUID() });
const hasCode = (code: string) => (error: unknown) => error instanceof FitnessError && error.code === code;

let owner: ReturnType<typeof createRuntime>;
let app: ReturnType<typeof createRuntime>;
const tenantA = randomUUID();
const tenantB = randomUUID();
let userA = '';
let userB = '';

async function boot(): Promise<ReturnType<typeof createRuntime>> {
  const ctx = createRuntime();
  try {
    await ctx.plugin(PostgresPlugin, { connectionString: runtimeDatabaseUrl, tls: 'local' }).await();
    await ctx.plugin(UserDataProtectionPlugin, cryptoConfig).await();
    await ctx.plugin(UserDatabasePlugin).await();
    await ctx.plugin(WorkoutHistoryPlugin).await();
    await ctx.plugin(WearablesPlugin).await();
    return ctx;
  } catch (error) {
    await ctx.fiber.dispose();
    throw error;
  }
}

const principalFor = (tenantId: string, userId: string): AuthPrincipal =>
  ({ schemaVersion: '1.0', tenantId, userId, sessionId: randomUUID() });

function sample(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    kind: 'heart-rate',
    unit: 'bpm',
    value: 72,
    source: 'health-connect',
    capturedAt: '2026-11-12T00:00:00.000Z',
    ...overrides,
  };
}

before(async () => {
  const admin = new Client({ connectionString: adminUrl!, ssl: false });
  await admin.connect();
  try {
    // 幂等：同一个服务器上重复跑（例如本地容器）时先清掉上次的库，而不是报 42P04。
    await admin.query(`DROP DATABASE IF EXISTS ${DATABASE} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${DATABASE}`);
  } finally {
    await admin.end();
  }

  owner = createRuntime();
  await owner.plugin(PostgresPlugin, { connectionString: adminDatabaseUrl, tls: 'local' }).await();
  await owner.plugin(UserDataProtectionPlugin, cryptoConfig).await();
  // 全新库：四条迁移必须一次跑完，004 就是其中之一。
  assert.deepEqual(await migrateUserDatabase(owner.fitnessDatabase), { applied: 5, version: 5 });
  await grantUserDatabaseAccess(owner.fitnessDatabase, RUNTIME_ROLE);
  await initializeUserLookupKey(owner.fitnessDatabase, owner.fitnessUserDataProtection);
  await provisionUserTenant(owner.fitnessDatabase, tenantA, 'Wearable tenant A');
  await provisionUserTenant(owner.fitnessDatabase, tenantB, 'Wearable tenant B');
  app = await boot();
  const a = await app.fitnessUsers.create({ schemaVersion: '1.0', tenantId: tenantA, profile, mutation: mutation() });
  const b = await app.fitnessUsers.create({ schemaVersion: '1.0', tenantId: tenantB, profile, mutation: mutation() });
  userA = a.user.id;
  userB = b.user.id;
});

after(async () => {
  if (app) await app.fiber.dispose();
  if (owner) await owner.fiber.dispose();
});

test('the wearable table is tenant-isolated by forced row level security', async () => {
  const tables = await owner.fitnessDatabase.transaction(tx => tx.query<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>(
    `SELECT relrowsecurity, relforcerowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'fitness_users' AND c.relname = 'wearable_samples'`));
  assert.equal(tables.rows.length, 1);
  assert.deepEqual({ ...tables.rows[0] }, { relrowsecurity: true, relforcerowsecurity: true });
});

test('values round-trip through encryption and never sit in a plaintext column', async () => {
  const principal = principalFor(tenantA, userA);
  const result = await app.fitnessWearables.ingest(principal, {
    schemaVersion: '1.0',
    samples: [sample({ value: 137 })],
  });
  assert.equal(result.accepted, 1);
  assert.equal(result.duplicates, 0);
  assert.equal(result.ids.length, 1);

  const page = await app.fitnessWearables.list(principal, { kind: 'heart-rate' });
  const stored = page.items.find(item => item.id === result.ids[0]);
  assert.ok(stored, '写入的样本必须能读回');
  assert.equal(stored.value, 137);
  assert.equal(stored.unit, 'bpm');

  // 明文列不得出现数值本身：这是「健康数据不落明文」的可验证形式。
  const raw = await owner.fitnessDatabase.transaction(tx => tx.query<{ sealed_value: string; plain_row: string }>(
    // 别名不能叫 row：它是 Postgres 的保留字，不加引号就是语法错误。
    `SELECT sealed_value, row_to_json(w)::text AS plain_row FROM fitness_users.wearable_samples w WHERE id = $1`,
    [result.ids[0]]));
  assert.equal(raw.rows.length, 1);
  assert.match(raw.rows[0]!.sealed_value, /^v1\./);
  assert.ok(!raw.rows[0]!.sealed_value.includes('137'));
  assert.ok(!/"137"/.test(raw.rows[0]!.plain_row.replace(/"sealed_value":"[^"]*"/, '')));
});

test('a repeated report is deduplicated instead of double counted, and the first value wins', async () => {
  const principal = principalFor(tenantA, userA);
  const capturedAt = '2026-11-12T01:00:00.000Z';
  const first = await app.fitnessWearables.ingest(principal, {
    schemaVersion: '1.0', samples: [sample({ capturedAt, value: 88 })],
  });
  assert.equal(first.accepted, 1);

  // 同一用户、同一来源、同一时刻：唯一约束命中，后到者被丢弃而不是覆盖。
  const second = await app.fitnessWearables.ingest(principal, {
    schemaVersion: '1.0', samples: [sample({ capturedAt, value: 99 })],
  });
  assert.equal(second.accepted, 0);
  assert.equal(second.duplicates, 1);

  const page = await app.fitnessWearables.list(principal, { kind: 'heart-rate', from: capturedAt, to: capturedAt });
  assert.equal(page.items.length, 1);
  assert.equal(page.items[0]!.value, 88, '先到者的值胜出');
});

test('one batch is one transaction: a single bad sample rolls the whole batch back', async () => {
  const principal = principalFor(tenantA, userA);
  const before = await app.fitnessWearables.list(principal, { kind: 'spo2' });
  await assert.rejects(
    () => app.fitnessWearables.ingest(principal, {
      schemaVersion: '1.0',
      samples: [
        sample({ kind: 'spo2', unit: 'percent', value: 97, source: 'ble-bracelet', capturedAt: '2026-11-12T02:00:00.000Z' }),
        // 单位与种类不匹配：整批必须失败，第一条也不能留下。
        sample({ kind: 'spo2', unit: 'bpm', value: 98, source: 'ble-bracelet', capturedAt: '2026-11-12T02:01:00.000Z' }),
      ],
    }),
    hasCode('METRIC_INVALID'),
  );
  const after = await app.fitnessWearables.list(principal, { kind: 'spo2' });
  assert.equal(after.items.length, before.items.length);
});

test('another tenant cannot read or delete a sample even with the exact id', async () => {
  const mine = principalFor(tenantA, userA);
  const other = principalFor(tenantB, userB);
  const created = await app.fitnessWearables.ingest(mine, {
    schemaVersion: '1.0', samples: [sample({ kind: 'cadence', unit: 'spm', value: 172, capturedAt: '2026-11-12T03:00:00.000Z' })],
  });
  const id = created.ids[0]!;

  const visibleToOther = await app.fitnessWearables.list(other, { kind: 'cadence' });
  assert.ok(!visibleToOther.items.some(item => item.id === id), '别的租户不得看到这条样本');

  await assert.rejects(() => app.fitnessWearables.remove(other, id), hasCode('METRIC_NOT_FOUND'));
  // 越权删除没有副作用。
  const stillThere = await app.fitnessWearables.list(mine, { kind: 'cadence' });
  assert.ok(stillThere.items.some(item => item.id === id));

  await app.fitnessWearables.remove(mine, id);
  await assert.rejects(() => app.fitnessWearables.remove(mine, id), hasCode('METRIC_NOT_FOUND'));
});

test('summaries aggregate decrypted values per UTC bucket', async () => {
  const principal = principalFor(tenantA, userA);
  await app.fitnessWearables.ingest(principal, {
    schemaVersion: '1.0',
    samples: [
      sample({ kind: 'steps', unit: 'count', value: 100, source: 'health-connect', capturedAt: '2026-11-10T01:00:00.000Z', intervalMinutes: 60 }),
      sample({ kind: 'steps', unit: 'count', value: 300, source: 'health-connect', capturedAt: '2026-11-10T05:00:00.000Z', intervalMinutes: 60 }),
      sample({ kind: 'steps', unit: 'count', value: 200, source: 'health-connect', capturedAt: '2026-11-11T01:00:00.000Z', intervalMinutes: 60 }),
    ],
  });

  const summary = await app.fitnessWearables.summary(principal, {
    kind: 'steps', from: '2026-11-10T00:00:00.000Z', to: '2026-11-11T23:59:59.000Z', bucket: 'day',
  });
  assert.equal(summary.unit, 'count');
  assert.equal(summary.bucket, 'day');
  assert.deepEqual(summary.buckets.map(bucket => [bucket.bucketStart, bucket.count, bucket.min, bucket.max, bucket.average]), [
    ['2026-11-10T00:00:00.000Z', 2, 100, 300, 200],
    ['2026-11-11T00:00:00.000Z', 1, 200, 200, 200],
  ]);
  // 每个样本都带区间长度，回读时也要原样带回来。
  const page = await app.fitnessWearables.list(principal, { kind: 'steps' });
  assert.ok(page.items.every(item => item.intervalMinutes === 60));
});

test('a window longer than 31 days is refused rather than silently truncated', async () => {
  const principal = principalFor(tenantA, userA);
  await assert.rejects(
    () => app.fitnessWearables.summary(principal, {
      kind: 'heart-rate', from: '2026-01-01T00:00:00.000Z', to: '2026-11-11T00:00:00.000Z',
    }),
    hasCode('METRIC_INVALID'),
  );
});

test('users inside one tenant cannot read each other\'s samples', async () => {
  const principal = principalFor(tenantB, userB);
  await app.fitnessWearables.ingest(principal, {
    schemaVersion: '1.0', samples: [sample({ kind: 'energy', unit: 'kcal', value: 320, source: 'ble-bracelet', capturedAt: '2026-11-12T04:00:00.000Z' })],
  });
  const summary = await app.fitnessWearables.summary(principal, {
    kind: 'energy', from: '2026-11-12T00:00:00.000Z', to: '2026-11-12T23:59:59.000Z',
  });
  assert.equal(summary.buckets.length, 1);
  assert.equal(summary.buckets[0]!.max, 320);

  // 换一个用户读同一租户：同一租户内的不同用户也不得互相看到。
  const neighbour = await app.fitnessUsers.create({ schemaVersion: '1.0', tenantId: tenantB, profile, mutation: mutation() });
  const neighbourView = await app.fitnessWearables.summary(principalFor(tenantB, neighbour.user.id), {
    kind: 'energy', from: '2026-11-12T00:00:00.000Z', to: '2026-11-12T23:59:59.000Z',
  });
  assert.deepEqual(neighbourView.buckets, []);
});
