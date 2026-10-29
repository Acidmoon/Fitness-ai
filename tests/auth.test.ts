import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { Service, type Context } from 'cordis';
import { FitnessError } from '../src/contracts.ts';
import { createRuntime, mountPlugins } from '../src/runtime.ts';
import { AuthPlugin, hashPassword, parsePasswordHash, verifyPassword } from '../src/plugins/auth.ts';
import type { DatabaseResult, DatabaseSession, FitnessDatabase, FitnessUserDataProtection } from '../src/database-contracts.ts';
import type {
  ClaimedUserChange, FitnessUsers, UserAccount, UserMutationContext, UserPage, UserProfile,
  UserWriteResult,
} from '../src/user-contracts.ts';

const TENANT = '11111111-1111-4111-8111-111111111111';

interface Account {
  readonly id: string;
  readonly tenantId: string;
  readonly profile: UserProfile;
  status: 'active' | 'suspended' | 'deleted';
}

interface CredentialRow {
  password_hash: string;
  failed_attempts: number;
  locked_until: Date | null;
}

interface SessionRow {
  readonly id: string;
  readonly tenant_id: string;
  readonly user_id: string;
  readonly token_lookup: string;
  expires_at: Date;
  revoked_at: Date | null;
}

/** In-memory stand-in for the auth tables; migration 002 is delivered by the data line. */
class Backend {
  readonly statements: string[] = [];
  readonly accounts = new Map<string, Account>();
  readonly identities = new Map<string, string>();
  readonly credentials = new Map<string, CredentialRow>();
  readonly sessions = new Map<string, SessionRow>();
  readonly tenants = new Set<string>([TENANT]);

  fingerprint(context: readonly string[], plaintext: string): string {
    return createHash('sha256').update([...context, plaintext].join('\u0000')).digest('hex');
  }

  query(sql: string, values: readonly unknown[]): DatabaseResult {
    this.statements.push(sql);
    if (sql.includes('set_config')) return { rows: [], rowCount: 0 };
    if (sql.includes('SELECT id FROM fitness_users.tenants')) {
      const id = values[0] as string;
      return this.tenants.has(id) ? { rows: [{ id }], rowCount: 1 } : { rows: [], rowCount: 0 };
    }
    if (sql.startsWith('INSERT INTO fitness_users.credentials')) {
      const key = `${values[0]}:${values[1]}`;
      if (this.credentials.has(key)) throw Object.assign(new Error('duplicate key'), { code: '23505' });
      this.credentials.set(key, { password_hash: values[2] as string, failed_attempts: 0, locked_until: null });
      return { rows: [], rowCount: 1 };
    }
    if (sql.includes('FROM fitness_users.credentials WHERE tenant_id=$1 AND user_id=$2')) {
      const row = this.credentials.get(`${values[0]}:${values[1]}`);
      return { rows: row ? [row as unknown as Record<string, unknown>] : [], rowCount: row ? 1 : 0 };
    }
    if (sql.includes('SET failed_attempts=failed_attempts+1')) {
      const row = this.credentials.get(`${values[0]}:${values[1]}`)!;
      row.failed_attempts += 1;
      if (row.failed_attempts >= (values[2] as number)) {
        row.locked_until = new Date(Date.now() + (values[3] as number) * 60_000);
      }
      return { rows: [{ locked_until: row.locked_until }], rowCount: 1 };
    }
    if (sql.includes('locked_until IS NOT NULL AND locked_until <= clock_timestamp()')) {
      const row = this.credentials.get(`${values[0]}:${values[1]}`);
      if (row && row.locked_until !== null && row.locked_until.getTime() <= Date.now()) {
        row.failed_attempts = 0; row.locked_until = null;
        return { rows: [], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }
    if (sql.includes('SET failed_attempts=0')) {
      const row = this.credentials.get(`${values[0]}:${values[1]}`);
      if (row) { row.failed_attempts = 0; row.locked_until = null; }
      return { rows: [], rowCount: row ? 1 : 0 };
    }
    if (sql.includes('SET password_hash=$3')) {
      const row = this.credentials.get(`${values[0]}:${values[1]}`);
      if (row) { row.password_hash = values[2] as string; row.failed_attempts = 0; row.locked_until = null; }
      return { rows: [], rowCount: row ? 1 : 0 };
    }
    if (sql.startsWith('INSERT INTO fitness_users.sessions')) {
      const id = values[1] as string;
      const expires = new Date(Date.now() + (values[4] as number) * 3_600_000);
      this.sessions.set(id, {
        id, tenant_id: values[0] as string, user_id: values[2] as string,
        token_lookup: values[3] as string, expires_at: expires, revoked_at: null,
      });
      return { rows: [{ expires_at: expires }], rowCount: 1 };
    }
    if (sql.includes('FROM fitness_users.sessions s')) {
      const lookup = values[1] as string;
      const row = [...this.sessions.values()].find(session =>
        session.tenant_id === values[0] && session.token_lookup === lookup);
      if (!row || row.revoked_at !== null || row.expires_at.getTime() <= Date.now()) return { rows: [], rowCount: 0 };
      const account = this.accounts.get(row.user_id);
      if (!account || account.status !== 'active') return { rows: [], rowCount: 0 };
      return { rows: [{ id: row.id, tenant_id: row.tenant_id, user_id: row.user_id }], rowCount: 1 };
    }
    if (sql.includes('SET revoked_at=clock_timestamp() WHERE tenant_id=$1 AND user_id=$2 AND id<>$3')) {
      let count = 0;
      for (const row of this.sessions.values()) {
        if (row.tenant_id === values[0] && row.user_id === values[1] && row.id !== values[2] && row.revoked_at === null) {
          row.revoked_at = new Date(); count++;
        }
      }
      return { rows: [], rowCount: count };
    }
    if (sql.includes('SET revoked_at=clock_timestamp() WHERE tenant_id=$1 AND user_id=$2')) {
      let count = 0;
      for (const row of this.sessions.values()) {
        if (row.tenant_id === values[0] && row.user_id === values[1] && row.revoked_at === null) {
          row.revoked_at = new Date(); count++;
        }
      }
      return { rows: [], rowCount: count };
    }
    if (sql.includes('SET revoked_at=clock_timestamp() WHERE tenant_id=$1 AND token_lookup=$2')) {
      const row = [...this.sessions.values()].find(session =>
        session.tenant_id === values[0] && session.token_lookup === values[1] && session.revoked_at === null);
      if (row) { row.revoked_at = new Date(); return { rows: [], rowCount: 1 }; }
      return { rows: [], rowCount: 0 };
    }
    throw new Error(`fake database 未实现该语句：${sql.slice(0, 80)}`);
  }
}

function account(backend: Backend, id: string, profile: UserProfile): UserAccount {
  const record = backend.accounts.get(id)!;
  return Object.freeze({
    schemaVersion: '1.0', tenantId: record.tenantId, id, status: record.status, version: 1,
    profile: record.profile, identities: Object.freeze([]),
    createdAt: new Date(0).toISOString(), updatedAt: new Date(0).toISOString(), erasedAt: null,
  });
}

class FakeUsers extends Service implements FitnessUsers {
  static provide = 'fitnessUsers';
  private readonly store: Backend;
  constructor(ctx: Context, backend: Backend) { super(ctx, 'fitnessUsers'); this.store = backend; }

  async create(value: unknown): Promise<UserWriteResult> {
    const request = value as { tenantId: string; profile: UserProfile; identity?: { provider: string; subject: string }; mutation: UserMutationContext };
    const key = `${request.identity!.provider}\u0000${request.identity!.subject}`;
    if (this.store.identities.has(key)) throw new FitnessError('USER_CONFLICT', '该登录身份已被其他用户占用');
    const id = randomUUID();
    this.store.accounts.set(id, { id, tenantId: request.tenantId, profile: request.profile, status: 'active' });
    this.store.identities.set(key, id);
    return Object.freeze({
      schemaVersion: '1.0' as const, user: account(this.store, id, request.profile),
      operationId: request.mutation.operationId, appliedVersion: 1, replayed: false, identityId: id,
    });
  }
  async findByIdentity(tenantId: string, identity: { provider: string; subject: string }): Promise<UserAccount | null> {
    // The real user service accepts a lookup identity without `verified` only; model that strictly.
    if (Object.keys(identity).some(key => !['provider', 'subject'].includes(key))) {
      throw new FitnessError('USER_INVALID', '输入包含未声明字段');
    }
    const id = this.store.identities.get(`${identity.provider}\u0000${identity.subject}`);
    if (!id) return null;
    const record = this.store.accounts.get(id);
    return record && record.tenantId === tenantId ? account(this.store, id, record.profile) : null;
  }
  async get(tenantId: string, userId: string): Promise<UserAccount | null> {
    const record = this.store.accounts.get(userId);
    return record && record.tenantId === tenantId ? account(this.store, userId, record.profile) : null;
  }
  async erase(value: unknown): Promise<UserWriteResult> {
    const request = value as { userId: string; mutation: UserMutationContext };
    const record = this.store.accounts.get(request.userId)!;
    record.status = 'deleted';
    return Object.freeze({
      schemaVersion: '1.0' as const, user: account(this.store, record.id, record.profile),
      operationId: request.mutation.operationId, appliedVersion: 2, replayed: false, identityId: null,
    });
  }
  async list(): Promise<UserPage> { throw new Error('未实现'); }
  async updateProfile(): Promise<UserWriteResult> { throw new Error('未实现'); }
  async changeStatus(): Promise<UserWriteResult> { throw new Error('未实现'); }
  async linkIdentity(): Promise<UserWriteResult> { throw new Error('未实现'); }
  async unlinkIdentity(): Promise<UserWriteResult> { throw new Error('未实现'); }
  async readIdentitySubject(): Promise<string | null> { throw new Error('未实现'); }
  async reencrypt(): Promise<UserWriteResult> { throw new Error('未实现'); }
  async claimChanges(): Promise<readonly ClaimedUserChange[]> { throw new Error('未实现'); }
  async acknowledgeChange(): Promise<void> { throw new Error('未实现'); }
}

class FakeDatabase extends Service implements FitnessDatabase {
  static provide = 'fitnessDatabase';
  private readonly store: Backend;
  constructor(ctx: Context, backend: Backend) { super(ctx, 'fitnessDatabase'); this.store = backend; }
  async transaction<T>(action: (session: DatabaseSession) => Promise<T>): Promise<T> {
    return action({ query: async <Row extends Record<string, unknown>>(sql: string, values: readonly unknown[] = []) =>
      this.store.query(sql, values) as DatabaseResult<Row> });
  }
  async health() { return Object.freeze({ schemaVersion: '1.0' as const, status: 'ready' as const, serverVersion: 16 }); }
}

class FakeProtection extends Service implements FitnessUserDataProtection {
  static provide = 'fitnessUserDataProtection';
  private readonly store: Backend;
  constructor(ctx: Context, backend: Backend) { super(ctx, 'fitnessUserDataProtection'); this.store = backend; }
  fingerprint(context: readonly string[], plaintext: string): string { return this.store.fingerprint(context, plaintext); }
  seal(): string { throw new Error('认证测试不加密'); }
  open(): string { throw new Error('认证测试不解密'); }
  needsRotation(): boolean { return false; }
}

const PROFILE: UserProfile = { displayName: '测试用户', locale: 'zh-CN', timeZone: 'Asia/Shanghai', avatarAssetId: null };

async function start(config: { maxAttempts?: number; sessionHours?: number; tenantId?: string; lockMinutes?: number } = {}) {
  const backend = new Backend();
  const ctx = createRuntime();
  await ctx.plugin(FakeDatabase, backend).await();
  await ctx.plugin(FakeProtection, backend).await();
  await ctx.plugin(FakeUsers, backend).await();
  await ctx.plugin(AuthPlugin, { tenantId: TENANT, maxAttempts: 3, lockMinutes: 15, ...config }).await();
  return { ctx, backend, auth: ctx.fitnessAuth };
}

function register(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: '1.0',
    identity: { provider: 'email', subject: 'user@example.com' },
    password: 'correct horse battery',
    profile: PROFILE,
    ...overrides,
  };
}

test('passwords hash irreversibly with a fresh salt and verify in constant form', async () => {
  const first = await hashPassword('correct horse battery');
  const second = await hashPassword('correct horse battery');
  assert.notEqual(first, second, '同一密码两次哈希必须不同（盐不同）');
  assert.match(first, /^scrypt\$16384\$8\$1\$[A-Za-z0-9_-]{22}\$[A-Za-z0-9_-]{86}$/);
  assert.ok(!first.includes('correct horse battery'));
  assert.equal(await verifyPassword('correct horse battery', first), true);
  assert.equal(await verifyPassword('wrong password', first), false);
  assert.equal(await verifyPassword('correct horse battery', 'scrypt$1$1$1$bad$bad'), false);
  assert.equal(await verifyPassword('correct horse battery', undefined), false);
  assert.equal(parsePasswordHash('nonsense'), undefined);
});

test('register issues a session and stores only the token fingerprint', async () => {
  const { ctx, backend } = await start();
  try {
    const session = await ctx.fitnessAuth.register(register());
    assert.equal(session.schemaVersion, '1.0');
    assert.match(session.token, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(session.user.profile?.displayName, '测试用户');
    assert.ok(Date.parse(session.expiresAt) > Date.now());
    const stored = [...backend.sessions.values()][0]!;
    assert.notEqual(stored.token_lookup, session.token, '数据库不得存令牌原文');
    assert.equal(stored.token_lookup, backend.fingerprint(['session-token', TENANT], session.token));
    assert.match(stored.token_lookup, /^[a-f0-9]{64}$/);
    assert.ok(!JSON.stringify(backend.credentials).includes('correct horse battery'));
    assert.ok(!backend.statements.some(sql => sql.includes(session.token)), '任何语句都不得携带令牌原文');
  } finally {
    await ctx.fiber.dispose();
  }
});

test('login rejects a wrong password with the same code as an unknown identity', async () => {
  const { ctx } = await start();
  try {
    await ctx.fitnessAuth.register(register());
    await assert.rejects(
      ctx.fitnessAuth.login({ schemaVersion: '1.0', identity: { provider: 'email', subject: 'user@example.com' }, password: 'wrong password!!' }),
      (error: unknown) => error instanceof FitnessError && error.code === 'AUTH_INVALID_CREDENTIALS',
    );
    await assert.rejects(
      ctx.fitnessAuth.login({ schemaVersion: '1.0', identity: { provider: 'email', subject: 'nobody@example.com' }, password: 'wrong password!!' }),
      (error: unknown) => error instanceof FitnessError && error.code === 'AUTH_INVALID_CREDENTIALS',
    );
  } finally {
    await ctx.fiber.dispose();
  }
});

test('repeated failures lock the account even for the correct password', async () => {
  const { ctx } = await start({ maxAttempts: 3 });
  try {
    await ctx.fitnessAuth.register(register());
    const login = (password: string) => ctx.fitnessAuth.login({
      schemaVersion: '1.0', identity: { provider: 'email', subject: 'user@example.com' }, password,
    });
    for (let attempt = 0; attempt < 2; attempt++) {
      await assert.rejects(login('wrong password!!'), (error: unknown) => error instanceof FitnessError && error.code === 'AUTH_INVALID_CREDENTIALS');
    }
    await assert.rejects(login('wrong password!!'), (error: unknown) => error instanceof FitnessError && error.code === 'AUTH_LOCKED');
    await assert.rejects(login('correct horse battery'), (error: unknown) => error instanceof FitnessError && error.code === 'AUTH_LOCKED');
  } finally {
    await ctx.fiber.dispose();
  }
});

test('an expired lock restarts the streak instead of locking on the next failure', async () => {
  const { ctx, backend } = await start({ maxAttempts: 3 });
  try {
    await ctx.fitnessAuth.register(register());
    const login = (password: string) => ctx.fitnessAuth.login({
      schemaVersion: '1.0', identity: { provider: 'email', subject: 'user@example.com' }, password,
    });
    const rejected = (code: string) => (error: unknown) => error instanceof FitnessError && error.code === code;
    for (let attempt = 0; attempt < 2; attempt++) await assert.rejects(login('wrong password!!'), rejected('AUTH_INVALID_CREDENTIALS'));
    await assert.rejects(login('wrong password!!'), rejected('AUTH_LOCKED'));
    const row = [...backend.credentials.values()][0]!;
    assert.equal(row.failed_attempts, 3);

    row.locked_until = new Date(Date.now() - 60_000);
    // The expired lock zeroes the counter, so the first maxAttempts-1 failures must stay unlocked.
    for (let attempt = 0; attempt < 2; attempt++) {
      await assert.rejects(login('wrong password!!'), rejected('AUTH_INVALID_CREDENTIALS'));
      assert.equal(row.locked_until, null);
    }
    assert.equal(row.failed_attempts, 2);
    await assert.rejects(login('wrong password!!'), rejected('AUTH_LOCKED'));
    assert.equal(row.failed_attempts, 3);
    assert.ok(row.locked_until !== null && row.locked_until.getTime() > Date.now());
    await assert.rejects(login('correct horse battery'), rejected('AUTH_LOCKED'));
  } finally {
    await ctx.fiber.dispose();
  }
});

test('sessions expire, revoke on logout, and resolve principal fields from the row', async () => {
  const { ctx, backend } = await start({ sessionHours: 1 });
  try {
    const session = await ctx.fitnessAuth.register(register());
    const principal = await ctx.fitnessAuth.authenticate(session.token);
    assert.equal(principal.tenantId, TENANT);
    assert.equal(principal.userId, session.user.id);
    assert.equal(principal.sessionId, [...backend.sessions.keys()][0]);

    await ctx.fitnessAuth.logout(session.token);
    await assert.rejects(ctx.fitnessAuth.authenticate(session.token),
      (error: unknown) => error instanceof FitnessError && error.code === 'AUTH_UNAUTHENTICATED');

    const second = await ctx.fitnessAuth.login({ schemaVersion: '1.0', identity: { provider: 'email', subject: 'user@example.com' }, password: 'correct horse battery' });
    const row = [...backend.sessions.values()].find(item => item.token_lookup === backend.fingerprint(['session-token', TENANT], second.token))!;
    row.expires_at = new Date(Date.now() - 1000);
    await assert.rejects(ctx.fitnessAuth.authenticate(second.token),
      (error: unknown) => error instanceof FitnessError && error.code === 'AUTH_UNAUTHENTICATED');
    await assert.rejects(ctx.fitnessAuth.authenticate('x'.repeat(43)),
      (error: unknown) => error instanceof FitnessError && error.code === 'AUTH_UNAUTHENTICATED');
    await assert.rejects(ctx.fitnessAuth.authenticate('not-a-token'),
      (error: unknown) => error instanceof FitnessError && error.code === 'AUTH_UNAUTHENTICATED');
  } finally {
    await ctx.fiber.dispose();
  }
});

test('changing the password revokes other sessions but keeps the current one', async () => {
  const { ctx } = await start();
  try {
    const first = await ctx.fitnessAuth.register(register());
    const second = await ctx.fitnessAuth.login({ schemaVersion: '1.0', identity: { provider: 'email', subject: 'user@example.com' }, password: 'correct horse battery' });
    const principal = await ctx.fitnessAuth.authenticate(second.token);
    await assert.rejects(
      ctx.fitnessAuth.changePassword(principal, { schemaVersion: '1.0', currentPassword: 'wrong password!!', newPassword: 'another strong one' }),
      (error: unknown) => error instanceof FitnessError && error.code === 'AUTH_INVALID_CREDENTIALS',
    );
    await ctx.fitnessAuth.changePassword(principal, { schemaVersion: '1.0', currentPassword: 'correct horse battery', newPassword: 'another strong one' });
    await ctx.fitnessAuth.authenticate(second.token);
    await assert.rejects(ctx.fitnessAuth.authenticate(first.token),
      (error: unknown) => error instanceof FitnessError && error.code === 'AUTH_UNAUTHENTICATED');
    const login = await ctx.fitnessAuth.login({ schemaVersion: '1.0', identity: { provider: 'email', subject: 'user@example.com' }, password: 'another strong one' });
    assert.match(login.token, /^[A-Za-z0-9_-]{43}$/);
  } finally {
    await ctx.fiber.dispose();
  }
});

test('a duplicate identity is a conflict, and client-supplied tenant fields are rejected', async () => {
  const { ctx } = await start();
  try {
    await ctx.fitnessAuth.register(register());
    await assert.rejects(ctx.fitnessAuth.register(register()),
      (error: unknown) => error instanceof FitnessError && error.code === 'AUTH_CONFLICT');
    await assert.rejects(ctx.fitnessAuth.register(register({ tenantId: TENANT })),
      (error: unknown) => error instanceof FitnessError && error.code === 'INVALID_ARGUMENTS');
    await assert.rejects(ctx.fitnessAuth.register(register({ password: 'short' })),
      (error: unknown) => error instanceof FitnessError && error.code === 'INVALID_ARGUMENTS');
    await assert.rejects(ctx.fitnessAuth.login({ schemaVersion: '1.0', identity: { provider: 'email', subject: 'user@example.com' }, password: 'x', userId: TENANT }),
      (error: unknown) => error instanceof FitnessError && error.code === 'INVALID_ARGUMENTS');
  } finally {
    await ctx.fiber.dispose();
  }
});

test('auth refuses to start without an explicit tenant id', async () => {
  const backend = new Backend();
  const ctx = createRuntime();
  try {
    await ctx.plugin(FakeDatabase, backend).await();
    await ctx.plugin(FakeProtection, backend).await();
    await ctx.plugin(FakeUsers, backend).await();
    const previous = process.env.FITNESS_TENANT_ID;
    delete process.env.FITNESS_TENANT_ID;
    try {
      await assert.rejects(ctx.plugin(AuthPlugin, {}).await(), /FITNESS_TENANT_ID/);
    } finally {
      if (previous !== undefined) process.env.FITNESS_TENANT_ID = previous;
    }
  } finally {
    await ctx.fiber.dispose();
  }
});
