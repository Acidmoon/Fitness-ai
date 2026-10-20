import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { open } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import test, { before, after } from 'node:test';
import { Service, type Context } from 'cordis';
import { Client } from 'pg';
import { FitnessError } from '../../src/contracts.ts';
import { DatabaseQueryError, type DatabaseRow, type DatabaseSession, type FitnessDatabase } from '../../src/database-contracts.ts';
import type { UserProfile, UserMutationContext } from '../../src/user-contracts.ts';
import { createRuntime } from '../../src/runtime.ts';
import { PostgresPlugin } from '../../src/plugins/postgres.ts';
import { UserDataProtectionPlugin } from '../../src/plugins/user-data-protection.ts';
import { UserDatabasePlugin } from '../../src/plugins/user-database.ts';
import { grantUserDatabaseAccess, initializeUserLookupKey, migrateUserDatabase, provisionUserTenant, userMigrations } from '../../src/user-migrations.ts';

const adminUrl = process.env.FITNESS_TEST_ADMIN_DATABASE_URL;
const runtimeUrl = process.env.FITNESS_TEST_DATABASE_URL;
if (!adminUrl || !runtimeUrl) throw new Error('Use pnpm test:database; an isolated PostgreSQL cluster is required.');
const key1 = randomBytes(32).toString('base64url');
const key2 = randomBytes(32).toString('base64url');
const lookupKey = randomBytes(32).toString('base64url');
const cryptoConfig = { keys:{ key1,key2 },activeKeyId:'key1',lookupKey };
const profile: UserProfile = { displayName:'数据库测试用户',locale:'zh-CN',timeZone:'Asia/Shanghai',avatarAssetId:null };
const mutation = (): UserMutationContext => ({ actorId:'system:integration-test',operationId:randomUUID() });
const hasCode = (code: string) => (error: unknown) => error instanceof FitnessError && error.code===code;
const sqlState = (state: string) => (error: unknown) => error instanceof DatabaseQueryError && error.sqlState===state;
let owner: ReturnType<typeof createRuntime>;
let app: ReturnType<typeof createRuntime>;
const tenantA=randomUUID();
const tenantB=randomUUID();

async function boot(connectionString=runtimeUrl!,config=cryptoConfig) {
  const ctx=createRuntime();
  try {
    await ctx.plugin(PostgresPlugin,{ connectionString,tls:'local' }).await();
    await ctx.plugin(UserDataProtectionPlugin,config).await();
    await ctx.plugin(UserDatabasePlugin).await();
    return ctx;
  } catch (error) { await ctx.fiber.dispose(); throw error; }
}
async function tenant(): Promise<string> { const id=randomUUID(); await provisionUserTenant(owner.fitnessDatabase,id,'Integration tenant'); return id; }
async function create(tenantId: string=tenantA,extra: Record<string,unknown>={}) {
  return app.fitnessUsers.create({ schemaVersion:'1.0',tenantId,profile,mutation:mutation(),...extra });
}
const versionRequest=(tenantId: string,userId: string,expectedVersion: number) => ({ schemaVersion:'1.0',tenantId,userId,expectedVersion,mutation:mutation() });

before(async () => {
  owner=createRuntime();
  await owner.plugin(PostgresPlugin,{ connectionString:adminUrl!,tls:'local' }).await();
  await owner.plugin(UserDataProtectionPlugin,cryptoConfig).await();
  assert.deepEqual(await migrateUserDatabase(owner.fitnessDatabase),{ applied:1,version:1 });
  await grantUserDatabaseAccess(owner.fitnessDatabase,'fitness_users_runtime');
  await initializeUserLookupKey(owner.fitnessDatabase,owner.fitnessUserDataProtection);
  await provisionUserTenant(owner.fitnessDatabase,tenantA,'Tenant A');
  await provisionUserTenant(owner.fitnessDatabase,tenantB,'Tenant B');
  app=await boot();
});
after(async () => { if (app) await app.fiber.dispose(); if (owner) await owner.fiber.dispose(); });

test('checksummed migrations are repeatable and reject changed applied SQL',async () => {
  assert.deepEqual(await migrateUserDatabase(owner.fitnessDatabase),{ applied:0,version:1 });
  const checksum=(await userMigrations())[0]!.checksum;
  await owner.fitnessDatabase.transaction(tx => tx.query('UPDATE fitness_users.schema_migrations SET checksum=$1 WHERE version=1',['0'.repeat(64)]));
  try { await assert.rejects(migrateUserDatabase(owner.fitnessDatabase),hasCode('DATABASE_MIGRATION')); }
  finally { await owner.fitnessDatabase.transaction(tx => tx.query('UPDATE fitness_users.schema_migrations SET checksum=$1 WHERE version=1',[checksum])); }
});

test('creates encrypted user data, exposes safe DTOs, and resolves normalized identities',async () => {
  const email=`${randomUUID()}@example.invalid`;
  const result=await create(tenantA,{ identity:{ provider:'email',subject:email.toUpperCase(),verified:false } });
  assert.equal(result.user.version,1); assert.equal(result.user.status,'active');
  assert.deepEqual(result.user.profile,profile); assert.equal(result.user.identities.length,1);
  assert.equal(result.user.identities[0]!.verifiedAt,null);
  assert.equal(JSON.stringify(result.user).includes(email),false);
  assert.equal((await app.fitnessUsers.findByIdentity(tenantA,{ provider:'email',subject:email }))?.id,result.user.id);
  assert.equal(await app.fitnessUsers.readIdentitySubject(tenantA,result.user.id,result.identityId!),email);
  assert.ok(Object.isFrozen(result.user.profile)); assert.ok(Object.isFrozen(result.user.identities));
  const stored=await owner.fitnessDatabase.transaction(tx => tx.query<{ profile: string; subject: string }>(`SELECT p.sealed_profile AS profile,i.sealed_subject AS subject FROM fitness_users.profiles p
    JOIN fitness_users.identities i ON i.tenant_id=p.tenant_id AND i.user_id=p.user_id WHERE p.tenant_id=$1 AND p.user_id=$2`,[tenantA,result.user.id]));
  assert.ok(stored.rows[0]!.profile.startsWith('v1.key1.'));
  assert.equal(stored.rows[0]!.profile.includes(profile.displayName),false);
  assert.equal(stored.rows[0]!.subject.includes(email),false);
  await assert.rejects(create(tenantA,{ secret:'undeclared' }),hasCode('USER_INVALID'));
});

test('tenant RLS prevents cross-tenant reads, writes, foreign keys, and session reuse leakage',async () => {
  const a=await create(tenantA); const b=await create(tenantB);
  assert.equal(await app.fitnessUsers.get(tenantA,b.user.id),null);
  await app.fitnessDatabase.transaction(async tx => {
    await tx.query("SELECT set_config('fitness.tenant_id',$1,true)",[tenantA]);
    assert.equal((await tx.query('SELECT id FROM fitness_users.accounts WHERE tenant_id=$1',[tenantB])).rowCount,0);
  });
  await app.fitnessDatabase.transaction(async tx => { assert.equal((await tx.query('SELECT id FROM fitness_users.accounts')).rowCount,0); });
  await assert.rejects(app.fitnessDatabase.transaction(async tx => {
    await tx.query("SELECT set_config('fitness.tenant_id',$1,true)",[tenantA]);
    await tx.query('INSERT INTO fitness_users.accounts(tenant_id,id) VALUES ($1,$2)',[tenantB,randomUUID()]);
  }),sqlState('42501'));
  await assert.rejects(app.fitnessDatabase.transaction(async tx => {
    await tx.query("SELECT set_config('fitness.tenant_id',$1,true)",[tenantA]);
    await tx.query('INSERT INTO fitness_users.profiles(tenant_id,user_id,sealed_profile) VALUES ($1,$2,$3)',[tenantA,b.user.id,'v1.not-a-real-ciphertext']);
  }),sqlState('23503'));
  assert.ok(await app.fitnessUsers.get(tenantA,a.user.id));
  await assert.rejects(app.fitnessUsers.get(randomUUID(),a.user.id),hasCode('TENANT_NOT_FOUND'));
});

test('runtime role cannot edit audit, receipts, schemas or hard-delete accounts',async () => {
  for (const sql of [
    'UPDATE fitness_users.audit_events SET actor_id=actor_id',
    'DELETE FROM fitness_users.accounts',
    'UPDATE fitness_users.mutation_receipts SET kind=kind',
    'INSERT INTO fitness_users.key_registry(id,lookup_key_check) VALUES (1,repeat(\'0\',64))',
    'CREATE TABLE fitness_users.unapproved(id integer)',
  ]) await assert.rejects(app.fitnessDatabase.transaction(tx => tx.query(sql)),sqlState('42501'));
  await assert.rejects(boot(adminUrl!),hasCode('DATABASE_ROLE_UNSAFE'));
});

test('duplicate identity races roll back the losing account and its side effects',async () => {
  const t=await tenant(); const subject=`${randomUUID()}@example.invalid`;
  const results=await Promise.allSettled([create(t,{ identity:{ provider:'email',subject,verified:false } }),create(t,{ identity:{ provider:'email',subject,verified:false } })]);
  assert.equal(results.filter(result => result.status==='fulfilled').length,1);
  const failed=results.find(result => result.status==='rejected');
  assert.ok(failed?.status==='rejected' && hasCode('USER_CONFLICT')(failed.reason));
  const counts=await owner.fitnessDatabase.transaction(tx => tx.query<{ accounts: number; receipts: number; events: number }>(`SELECT
    (SELECT count(*)::integer FROM fitness_users.accounts WHERE tenant_id=$1) AS accounts,
    (SELECT count(*)::integer FROM fitness_users.mutation_receipts WHERE tenant_id=$1) AS receipts,
    (SELECT count(*)::integer FROM fitness_users.audit_events WHERE tenant_id=$1) AS events`,[t]));
  assert.deepEqual(counts.rows[0],{ accounts:1,receipts:1,events:1 });
  const other=await create(tenantB,{ identity:{ provider:'email',subject,verified:false } });
  assert.equal(other.user.tenantId,tenantB);
});

test('operation IDs deduplicate concurrent retries and reject different payloads',async () => {
  const t=await tenant(); const request={ schemaVersion:'1.0',tenantId:t,profile,mutation:mutation() };
  const [a,b]=await Promise.all([app.fitnessUsers.create(request),app.fitnessUsers.create(request)]);
  assert.equal(a.user.id,b.user.id); assert.notEqual(a.replayed,b.replayed);
  await assert.rejects(app.fitnessUsers.create({ ...request,profile:{ ...profile,displayName:'different' } }),hasCode('IDEMPOTENCY_CONFLICT'));
  const updated=await app.fitnessUsers.updateProfile({ ...versionRequest(t,a.user.id,1),profile:{ ...profile,displayName:'updated' } });
  assert.equal(updated.user.version,2);
  const replay=await app.fitnessUsers.create(request);
  assert.equal(replay.replayed,true); assert.equal(replay.appliedVersion,1); assert.equal(replay.user.version,2);
  assert.equal(replay.user.profile?.displayName,'updated');
});

test('optimistic versions allow only one of two concurrent edits',async () => {
  const created=await create();
  const results=await Promise.allSettled(['first','second'].map(displayName => app.fitnessUsers.updateProfile({
    ...versionRequest(tenantA,created.user.id,1),profile:{ ...profile,displayName },
  })));
  assert.equal(results.filter(result => result.status==='fulfilled').length,1);
  const failed=results.find(result => result.status==='rejected');
  assert.ok(failed?.status==='rejected' && hasCode('USER_VERSION_CONFLICT')(failed.reason));
  assert.equal((await app.fitnessUsers.get(tenantA,created.user.id))?.version,2);
});

test('identity linking preserves ownership and can update verification for the same owner',async () => {
  const a=await create(); const b=await create(); const subject=`${randomUUID()}@example.invalid`;
  const linked=await app.fitnessUsers.linkIdentity({ ...versionRequest(tenantA,a.user.id,1),identity:{ provider:'email',subject,verified:false } });
  const verified=await app.fitnessUsers.linkIdentity({ ...versionRequest(tenantA,a.user.id,2),identity:{ provider:'email',subject,verified:true } });
  assert.equal(verified.identityId,linked.identityId); assert.ok(verified.user.identities[0]!.verifiedAt);
  await assert.rejects(app.fitnessUsers.linkIdentity({ ...versionRequest(tenantA,b.user.id,1),identity:{ provider:'email',subject,verified:true } }),hasCode('USER_CONFLICT'));
  assert.equal((await app.fitnessUsers.get(tenantA,b.user.id))?.version,1);
  await assert.rejects(app.fitnessUsers.unlinkIdentity({ ...versionRequest(tenantA,b.user.id,1),identityId:linked.identityId }),hasCode('USER_NOT_FOUND'));
  const unlinked=await app.fitnessUsers.unlinkIdentity({ ...versionRequest(tenantA,a.user.id,3),identityId:linked.identityId });
  assert.equal(unlinked.user.identities.length,0);
});

test('suspension and erasure preserve audit while removing personal data and identity claims',async () => {
  const t=await tenant(); const subject=`${randomUUID()}@example.invalid`;
  const request={ schemaVersion:'1.0',tenantId:t,profile,identity:{ provider:'email',subject,verified:true },mutation:mutation() };
  const created=await app.fitnessUsers.create(request);
  const suspended=await app.fitnessUsers.changeStatus({ ...versionRequest(t,created.user.id,1),status:'suspended' });
  assert.equal(suspended.user.status,'suspended');
  const erased=await app.fitnessUsers.erase(versionRequest(t,created.user.id,2));
  assert.equal(erased.user.status,'deleted'); assert.equal(erased.user.profile,null); assert.deepEqual(erased.user.identities,[]);
  assert.ok(erased.user.erasedAt);
  assert.equal(await app.fitnessUsers.findByIdentity(t,{ provider:'email',subject }),null);
  await assert.rejects(app.fitnessUsers.changeStatus({ ...versionRequest(t,created.user.id,3),status:'active' }),hasCode('USER_STATE_CONFLICT'));
  const replay=await app.fitnessUsers.create(request);
  assert.equal(replay.replayed,true); assert.equal(replay.user.status,'deleted');
  const replacement=await create(t,{ identity:{ provider:'email',subject,verified:true } });
  assert.notEqual(replacement.user.id,created.user.id);
  const raw=await owner.fitnessDatabase.transaction(tx => tx.query<{ profiles: number; identities: number; events: number }>(`SELECT
    (SELECT count(*)::integer FROM fitness_users.profiles WHERE tenant_id=$1 AND user_id=$2) AS profiles,
    (SELECT count(*)::integer FROM fitness_users.identities WHERE tenant_id=$1 AND user_id=$2) AS identities,
    (SELECT count(*)::integer FROM fitness_users.audit_events WHERE tenant_id=$1 AND user_id=$2) AS events`,[t,created.user.id]));
  assert.deepEqual(raw.rows[0],{ profiles:0,identities:0,events:3 });
});

test('keyset pagination is tenant-scoped and bounded',async () => {
  const t=await tenant(); for (let i=0;i<3;i++) await create(t);
  const first=await app.fitnessUsers.list(t,{ limit:2 }); assert.equal(first.items.length,2); assert.ok(first.nextCursor);
  const second=await app.fitnessUsers.list(t,{ limit:2,after:first.nextCursor! }); assert.equal(second.items.length,1); assert.equal(second.nextCursor,null);
  assert.equal(new Set([...first.items,...second.items].map(item => item.id)).size,3);
  await assert.rejects(app.fitnessUsers.list(t,{ limit:101 }),hasCode('USER_INVALID'));
});

test('transactional outbox survives failed wakeups, excludes competing workers, and expires leases',async () => {
  const t=await tenant();
  const listener=app.on('fitness/user-changed',() => { throw new Error('fictional consumer failure'); });
  await create(t); listener();
  const [a,b]=await Promise.all([
    app.fitnessUsers.claimChanges(t,{ workerId:'worker-a',limit:1,leaseMs:100 }),
    app.fitnessUsers.claimChanges(t,{ workerId:'worker-b',limit:1,leaseMs:100 }),
  ]);
  assert.equal(a.length+b.length,1);
  const claimed=(a[0] ?? b[0])!; const worker=a.length?'worker-a':'worker-b';
  await assert.rejects(app.fitnessUsers.acknowledgeChange(t,claimed.event.id,'wrong-worker',claimed.leaseToken),hasCode('OUTBOX_LEASE_LOST'));
  await delay(150);
  const next=await app.fitnessUsers.claimChanges(t,{ workerId:'worker-c',leaseMs:1000 });
  assert.equal(next[0]?.event.id,claimed.event.id); assert.notEqual(next[0]?.leaseToken,claimed.leaseToken);
  await assert.rejects(app.fitnessUsers.acknowledgeChange(t,claimed.event.id,worker,claimed.leaseToken),hasCode('OUTBOX_LEASE_LOST'));
  await app.fitnessUsers.acknowledgeChange(t,next[0]!.event.id,'worker-c',next[0]!.leaseToken);
  assert.deepEqual(await app.fitnessUsers.claimChanges(t,{ workerId:'worker-d' }),[]);
});

test('audit failures roll back profile edits, versions, receipts and outbox together',async () => {
  const t=await tenant(); const created=await create(t);
  await owner.fitnessDatabase.transaction(tx => tx.query('REVOKE INSERT ON fitness_users.audit_events FROM fitness_users_runtime'));
  try { await assert.rejects(app.fitnessUsers.updateProfile({ ...versionRequest(t,created.user.id,1),profile:{ ...profile,displayName:'must roll back' } }),sqlState('42501')); }
  finally { await grantUserDatabaseAccess(owner.fitnessDatabase,'fitness_users_runtime'); }
  const current=await app.fitnessUsers.get(t,created.user.id);
  assert.equal(current?.version,1); assert.equal(current.profile?.displayName,profile.displayName);
  const pending=await app.fitnessUsers.claimChanges(t,{ workerId:'rollback-check' }); assert.equal(pending.length,1);
});

test('encryption rotation preserves lookup identities and refuses a replaced lookup key',async () => {
  const created=await create(tenantA,{ identity:{ provider:'phone',subject:'+8613800000001',verified:true } });
  const rotated=await boot(runtimeUrl!,{ ...cryptoConfig,activeKeyId:'key2' });
  try {
    assert.equal((await rotated.fitnessUsers.get(tenantA,created.user.id))?.profile?.displayName,profile.displayName);
    const changed=await rotated.fitnessUsers.reencrypt(versionRequest(tenantA,created.user.id,1)); assert.equal(changed.user.version,2);
    const stored=await owner.fitnessDatabase.transaction(tx => tx.query<{ sealed_profile: string }>('SELECT sealed_profile FROM fitness_users.profiles WHERE tenant_id=$1 AND user_id=$2',[tenantA,created.user.id]));
    assert.ok(stored.rows[0]!.sealed_profile.startsWith('v1.key2.'));
    assert.equal((await rotated.fitnessUsers.findByIdentity(tenantA,{ provider:'phone',subject:'+8613800000001' }))?.id,created.user.id);
  } finally { await rotated.fiber.dispose(); }
  await assert.rejects(boot(runtimeUrl!,{ ...cryptoConfig,lookupKey:randomBytes(32).toString('base64url') }),hasCode('DATA_PROTECTION_CONFIG'));
});

test('identity lookup returns one consistent snapshot during a concurrent unlink',async () => {
  const subject=`${randomUUID()}@example.invalid`;
  const created=await create(tenantA,{ identity:{ provider:'email',subject,verified:true } });
  let interleaved=false;
  class SnapshotDatabase extends Service implements FitnessDatabase {
    static provide='fitnessDatabase';
    constructor(ctx: Context) { super(ctx,'fitnessDatabase'); }
    health() { return app.fitnessDatabase.health(); }
    transaction<T>(action: (session: DatabaseSession) => Promise<T>): Promise<T> {
      return app.fitnessDatabase.transaction(session => action({ query: async <Row extends DatabaseRow>(sql: string,values?: readonly unknown[]) => {
        const result=await session.query<Row>(sql,values);
        if (sql.includes('subject_lookup=$3') && !interleaved) {
          interleaved=true;
          await app.fitnessUsers.unlinkIdentity({ ...versionRequest(tenantA,created.user.id,1),identityId:created.identityId });
        }
        return result;
      }}));
    }
  }
  const ctx=createRuntime();
  try {
    await ctx.plugin(SnapshotDatabase).await(); await ctx.plugin(UserDataProtectionPlugin,cryptoConfig).await(); await ctx.plugin(UserDatabasePlugin).await();
    const found=await ctx.fitnessUsers.findByIdentity(tenantA,{ provider:'email',subject });
    assert.equal(interleaved,true); assert.equal(found?.id,created.user.id);
    assert.ok(found?.identities.some(identity => identity.id===created.identityId));
    assert.deepEqual((await app.fitnessUsers.get(tenantA,created.user.id))?.identities,[]);
  } finally { await ctx.fiber.dispose(); }
});

test('a swallowed SQL error cannot turn an aborted transaction into reported success',async () => {
  const id=randomUUID();
  await assert.rejects(app.fitnessDatabase.transaction(async session => {
    await session.query("SELECT set_config('fitness.tenant_id',$1,true)",[tenantA]);
    await session.query('INSERT INTO fitness_users.accounts(tenant_id,id) VALUES ($1,$2)',[tenantA,id]);
    try { await session.query('SELECT 1/0'); } catch { /* Consumer catches the statement error, but the transaction is still aborted. */ }
    return 'must not be reported as committed';
  }),hasCode('DATABASE_UNAVAILABLE'));
  assert.equal(await app.fitnessUsers.get(tenantA,id),null);
});

test('checked-out connection loss is contained and the pool remains usable',async () => {
  let report!: (pid: number) => void;
  const pid=new Promise<number>(resolve => { report=resolve; });
  const work=app.fitnessDatabase.transaction(async session => {
    const result=await session.query<{ pid: number }>('SELECT pg_backend_pid() AS pid');
    report(result.rows[0]!.pid);
    await session.query('SELECT pg_sleep(5)');
  });
  const expected=assert.rejects(work,hasCode('DATABASE_UNAVAILABLE'));
  const backend=await pid;
  await owner.fitnessDatabase.transaction(session => session.query('SELECT pg_terminate_backend($1)',[backend]));
  await expected;
  assert.equal((await app.fitnessDatabase.health()).status,'ready');
});

test('connection loss during a deferred COMMIT is unknown and destroys that connection',async () => {
  await owner.fitnessDatabase.transaction(session => session.query(`CREATE TABLE fitness_users.commit_failure_probe(id integer PRIMARY KEY);
    CREATE FUNCTION fitness_users.delay_test_commit() RETURNS trigger LANGUAGE plpgsql AS $probe$
      BEGIN PERFORM pg_sleep(2); RETURN NEW; END; $probe$;
    CREATE CONSTRAINT TRIGGER deferred_test_commit AFTER INSERT ON fitness_users.commit_failure_probe
      DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION fitness_users.delay_test_commit();
    GRANT INSERT ON fitness_users.commit_failure_probe TO fitness_users_runtime;`));
  const ctx=createRuntime();
  try {
    await ctx.plugin(PostgresPlugin,{ connectionString:runtimeUrl!,tls:'local',maxConnections:1 }).await();
    let report!: (pid: number) => void;
    const pid=new Promise<number>(resolve => { report=resolve; });
    const work=ctx.fitnessDatabase.transaction(async session => {
      const result=await session.query<{ pid: number }>('SELECT pg_backend_pid() AS pid');
      await session.query('INSERT INTO fitness_users.commit_failure_probe(id) VALUES (1)');
      report(result.rows[0]!.pid);
    });
    const expected=assert.rejects(work,hasCode('DATABASE_TRANSACTION_UNKNOWN'));
    const backend=await pid; let committing=false;
    for (let attempt=0;attempt<50;attempt++) {
      const state=await owner.fitnessDatabase.transaction(session => session.query<{ query: string }>('SELECT query FROM pg_stat_activity WHERE pid=$1',[backend]));
      if (state.rows[0]?.query==='COMMIT') { committing=true; break; }
      await delay(10);
    }
    assert.equal(committing,true);
    await owner.fitnessDatabase.transaction(session => session.query('SELECT pg_terminate_backend($1)',[backend]));
    await expected;
    assert.equal((await ctx.fitnessDatabase.health()).status,'ready');
  } finally { await ctx.fiber.dispose(); }
});

test('database session scope, timeouts, and plugin disposal are bounded',async () => {
  let leaked: DatabaseSession | undefined;
  await app.fitnessDatabase.transaction(async tx => { leaked=tx; await tx.query('SELECT 1'); });
  await assert.rejects(leaked!.query('SELECT 1'),hasCode('DATABASE_CLOSED'));
  const ctx=createRuntime();
  try {
    await ctx.plugin(PostgresPlugin,{ connectionString:runtimeUrl!,tls:'local',statementTimeoutMs:50 }).await();
    await assert.rejects(ctx.fitnessDatabase.transaction(tx => tx.query('SELECT pg_sleep(1)')),hasCode('DATABASE_TIMEOUT'));
    assert.equal((await ctx.fitnessDatabase.health()).status,'ready');
  } finally { await ctx.fiber.dispose(); }
  const stopping=createRuntime();
  await stopping.plugin(PostgresPlugin,{ connectionString:runtimeUrl!,tls:'local' }).await();
  const service=stopping.fitnessDatabase;
  let started!: () => void; const signal=new Promise<void>(resolve => { started=resolve; });
  const operation=service.transaction(async tx => { started(); await tx.query('SELECT pg_sleep(5)'); });
  const expected=assert.rejects(operation,hasCode('DATABASE_CLOSED'));
  await signal; await stopping.fiber.dispose(); await expected;
  await assert.rejects(service.health(),hasCode('DATABASE_CLOSED'));
});

test('removing and remounting the database suspends and restores the user service',async () => {
  const ctx=await boot();
  try {
    const original=ctx.fitnessUsers;
    const provider=[...ctx.registry.get(PostgresPlugin)!.fibers][0]!;
    const consumer=[...ctx.registry.get(UserDatabasePlugin)!.fibers][0]!;
    await provider.dispose();
    await consumer.await();
    assert.equal(Boolean(ctx.fitnessUsers),false);
    await ctx.plugin(PostgresPlugin,{ connectionString:runtimeUrl!,tls:'local' }).await();
    await consumer.await();
    assert.ok(await ctx.fitnessUsers.get(tenantA,(await create()).user.id));
    await assert.rejects(original.get(tenantA,randomUUID()),hasCode('CANCELLED'));
  } finally { await ctx.fiber.dispose(); }
});

test('source and compiled administration commands provision and verify without leaking credentials',async () => {
  const run=async (entry: string,args: string[],override: Record<string,string>={}) => {
    return new Promise<{ status: number; stdout: string; stderr: string }>((resolve,reject) => {
      let stdout=''; let stderr='';
      const child=spawn(process.execPath,[entry,...args],{ windowsHide:true,stdio:['ignore','pipe','pipe'],env:{
        ...process.env,FITNESS_DATABASE_URL:runtimeUrl!,FITNESS_DATABASE_MIGRATION_URL:adminUrl!,FITNESS_DATABASE_TLS:'local',
        FITNESS_USER_ENCRYPTION_KEYS:JSON.stringify(cryptoConfig.keys),FITNESS_USER_ENCRYPTION_ACTIVE_KEY:cryptoConfig.activeKeyId,
        FITNESS_USER_LOOKUP_KEY:lookupKey,...override,
      }});
      const timeout=setTimeout(() => { child.kill(); reject(new Error('Database management command timed out')); },10_000);
      child.stdout!.on('data',data => { stdout+=String(data); }); child.stderr!.on('data',data => { stderr+=String(data); });
      child.once('error',error => { clearTimeout(timeout); reject(error); });
      child.once('exit',code => { clearTimeout(timeout); resolve({ status:code??1,stdout,stderr }); });
    });
  };
  for (const entry of ['src/user-db-main.ts','dist/user-db-main.js']) {
    const migrated=await run(entry,['migrate']); assert.equal(migrated.status,0,migrated.stderr); assert.equal(JSON.parse(migrated.stdout).applied,0);
    const checked=await run(entry,['check']); assert.equal(checked.status,0,checked.stderr); assert.equal(JSON.parse(checked.stdout).status,'ready');
    const initialized=await run(entry,['key-init']); assert.equal(initialized.status,0,initialized.stderr);
    const unsafe=await run(entry,['check'],{ FITNESS_DATABASE_URL:adminUrl! }); assert.equal(unsafe.status,1); assert.match(unsafe.stderr,/^DATABASE_ROLE_UNSAFE:/);
    assert.equal(unsafe.stderr.includes(adminUrl!),false); assert.equal(unsafe.stderr.includes(lookupKey),false);
  }
  const t=randomUUID(); const created=await run('dist/user-db-main.js',['tenant-create',t,'CLI tenant']);
  assert.equal(created.status,0,created.stderr); assert.deepEqual((await app.fitnessUsers.list(t)).items,[]);
});

test('a real custom-format backup restores encrypted user data, constraints, and runtime access',async () => {
  const binaries=process.env.FITNESS_TEST_PG_BIN!; const artifacts=process.env.FITNESS_TEST_ARTIFACTS!;
  const sentinel=await create(tenantA,{ profile:{ ...profile,displayName:'backup restore sentinel' } });
  const url=new URL(adminUrl!);
  const env={ ...process.env,PGHOST:url.hostname,PGPORT:url.port,PGUSER:decodeURIComponent(url.username),PGPASSWORD:decodeURIComponent(url.password) };
  const log=await open(join(artifacts,'backup-restore.log'),'wx');
  const command=async (name: string,args: string[]) => {
    const code=await new Promise<number>((resolve,reject) => { const child=spawn(join(binaries,name+(process.platform==='win32'?'.exe':'')),args,{ env,windowsHide:true,stdio:['ignore',log.fd,log.fd] }); child.once('error',reject); child.once('exit',code => { resolve(code??1); }); });
    assert.equal(code,0,`Inspect ${join(artifacts,'backup-restore.log')}`);
  };
  try {
    const dump=join(artifacts,'users.dump');
    await command('pg_dump',['--format=custom','--file',dump,'--dbname','fitness_users_test']);
    const admin=new Client({ connectionString:adminUrl!,ssl:false });
    try { await admin.connect(); await admin.query('CREATE DATABASE fitness_users_restore'); } finally { await admin.end(); }
    await command('pg_restore',['--exit-on-error','--dbname','fitness_users_restore',dump]);
    const restoredUrl=new URL(runtimeUrl!); restoredUrl.pathname='/fitness_users_restore';
    const restored=await boot(restoredUrl.toString());
    try {
      const user=await restored.fitnessUsers.get(tenantA,sentinel.user.id);
      assert.equal(user?.profile?.displayName,'backup restore sentinel');
      assert.equal(user?.version,1);
      assert.equal(await restored.fitnessUsers.get(tenantB,sentinel.user.id),null);
    } finally { await restored.fiber.dispose(); }
  } finally { await log.close(); }
});
