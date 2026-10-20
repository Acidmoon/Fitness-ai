import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { FitnessError } from './contracts.ts';
import type { DatabaseMigration, DatabaseSession, FitnessDatabase, FitnessUserDataProtection } from './database-contracts.ts';

export async function userMigrations(): Promise<readonly DatabaseMigration[]> {
  const sql = (await readFile(new URL('./data/user-database/001-users.sql', import.meta.url), 'utf8')).replace(/\r\n/g, '\n');
  return Object.freeze([Object.freeze({ version: 1, name: 'users', sql, checksum: createHash('sha256').update(sql).digest('hex') })]);
}
async function checkHistory(session: DatabaseSession, migrations: readonly DatabaseMigration[]): Promise<number> {
  const present = await session.query<{ name: string | null }>("SELECT to_regclass('fitness_users.schema_migrations') AS name");
  if (!present.rows[0]?.name) throw new FitnessError('DATABASE_MIGRATION', '用户数据库需要先执行显式迁移');
  const history = await session.query<{ version: number; name: string; checksum: string }>(
    'SELECT version, name, checksum FROM fitness_users.schema_migrations ORDER BY version');
  for (let index = 0; index < history.rows.length; index++) {
    const actual = history.rows[index];
    const expected = migrations[index];
    if (!expected || actual?.version !== expected.version || actual.name !== expected.name || actual.checksum !== expected.checksum) {
      throw new FitnessError('DATABASE_MIGRATION', '用户数据库迁移历史或校验和不匹配；拒绝自动修复');
    }
  }
  return history.rows.length;
}
export async function migrateUserDatabase(database: FitnessDatabase): Promise<{ readonly applied: number; readonly version: number }> {
  const migrations = await userMigrations();
  return database.transaction(async session => {
    await session.query('SELECT pg_advisory_xact_lock(19011, 1)');
    await session.query('CREATE SCHEMA IF NOT EXISTS fitness_users');
    await session.query('REVOKE ALL ON SCHEMA fitness_users FROM PUBLIC');
    await session.query(`CREATE TABLE IF NOT EXISTS fitness_users.schema_migrations (
      version integer PRIMARY KEY, name text NOT NULL, checksum varchar(64) NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT clock_timestamp())`);
    const count = await checkHistory(session, migrations);
    for (const migration of migrations.slice(count)) {
      await session.query(migration.sql);
      await session.query('INSERT INTO fitness_users.schema_migrations(version, name, checksum) VALUES ($1, $2, $3)',
        [migration.version, migration.name, migration.checksum]);
    }
    return Object.freeze({ applied: migrations.length - count, version: migrations.at(-1)!.version });
  });
}
export async function assertUserDatabase(database: FitnessDatabase): Promise<void> {
  const migrations = await userMigrations();
  await database.transaction(async session => {
    const role = await session.query<{ unsafe: boolean }>(`SELECT (r.rolsuper OR r.rolbypassrls OR r.rolcreaterole OR r.rolcreatedb
      OR EXISTS (SELECT 1 FROM pg_database d WHERE d.datname = current_database() AND pg_has_role(current_user, d.datdba, 'MEMBER'))
      OR EXISTS (SELECT 1 FROM pg_namespace n WHERE n.nspname = 'fitness_users' AND pg_has_role(current_user, n.nspowner, 'MEMBER')))
      AS unsafe FROM pg_roles r WHERE r.rolname = current_user`);
    if (!role.rows[0] || role.rows[0].unsafe) throw new FitnessError('DATABASE_ROLE_UNSAFE', '用户插件必须使用非所有者、无超级用户及 BYPASSRLS 权限的独立运行账号');
    const count = await checkHistory(session, migrations);
    if (count !== migrations.length) throw new FitnessError('DATABASE_MIGRATION', '用户数据库需要先执行显式迁移');
    const protection = await session.query<{ count: number }>(`SELECT count(*)::integer AS count
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'fitness_users' AND c.relname IN ('tenants','accounts','profiles','identities','mutation_receipts','audit_events','outbox')
      AND c.relrowsecurity AND c.relforcerowsecurity AND NOT pg_has_role(current_user, c.relowner, 'MEMBER')`);
    if (protection.rows[0]?.count !== 7) throw new FitnessError('DATABASE_ROLE_UNSAFE', '用户表的租户隔离配置不完整');
  });
}
export async function grantUserDatabaseAccess(database: FitnessDatabase, role: string): Promise<void> {
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(role)) throw new FitnessError('DATABASE_CONFIG', '运行角色名格式无效');
  const target = `"${role}"`;
  await database.transaction(async session => {
    await session.query(`GRANT USAGE ON SCHEMA fitness_users TO ${target}`);
    await session.query(`GRANT SELECT ON fitness_users.schema_migrations, fitness_users.key_registry, fitness_users.tenants TO ${target}`);
    await session.query(`GRANT SELECT, INSERT, UPDATE ON fitness_users.accounts TO ${target}`);
    await session.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON fitness_users.profiles, fitness_users.identities TO ${target}`);
    await session.query(`GRANT SELECT, INSERT ON fitness_users.mutation_receipts, fitness_users.audit_events TO ${target}`);
    await session.query(`GRANT SELECT, INSERT ON fitness_users.outbox TO ${target}`);
    await session.query(`GRANT UPDATE (lease_owner, lease_token, lease_until, delivered_at) ON fitness_users.outbox TO ${target}`);
  });
}
export async function initializeUserLookupKey(database: FitnessDatabase, protection: FitnessUserDataProtection): Promise<void> {
  const fingerprint = protection.fingerprint(['configuration'], 'lookup-key-check-v1');
  await database.transaction(async session => {
    await session.query('SELECT pg_advisory_xact_lock(19011, 2)');
    const current = await session.query<{ lookup_key_check: string }>('SELECT lookup_key_check FROM fitness_users.key_registry WHERE id=1');
    if (current.rows[0]) {
      if (current.rows[0].lookup_key_check !== fingerprint) throw new FitnessError('DATA_PROTECTION_CONFIG', '身份检索密钥已初始化，拒绝覆盖');
      return;
    }
    await session.query('INSERT INTO fitness_users.key_registry(id, lookup_key_check) VALUES (1,$1)', [fingerprint]);
  });
}
export async function provisionUserTenant(database: FitnessDatabase, id: string, name: string): Promise<void> {
  if (!/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id) || !name.trim() || name.length > 100 || /[\x00-\x1f\x7f]/.test(name)) {
    throw new FitnessError('USER_INVALID', '租户 ID 或名称格式无效');
  }
  await database.transaction(async session => {
    await session.query("SELECT set_config('fitness.tenant_id', $1, true)", [id.toLowerCase()]);
    await session.query('INSERT INTO fitness_users.tenants(id, name) VALUES ($1, $2)', [id.toLowerCase(), name.trim()]);
  });
}
