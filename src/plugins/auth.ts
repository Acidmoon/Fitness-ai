import { randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { Service, type Context } from 'cordis';
import { FitnessError } from '../contracts.ts';
import { AUTH_PASSWORD_MAX_CODEPOINTS, AUTH_PASSWORD_MIN_CODEPOINTS, type AuthPrincipal, type AuthSession, type FitnessAuth } from '../auth-contracts.ts';
import type { DatabaseSession } from '../database-contracts.ts';
import type { UserAccount, UserProfile, UserWriteResult } from '../user-contracts.ts';
import { identity as validateIdentity, profile as validateProfile } from '../user-validation.ts';

const scrypt = promisify(scryptCallback) as (
  password: string, salt: Buffer, keylen: number, options: { N: number; r: number; p: number },
) => Promise<Buffer>;

/** Frozen password parameters; the stored string repeats them so a mismatch is detectable. */
export const SCRYPT = Object.freeze({ N: 16384, r: 8, p: 1, keylen: 64, saltBytes: 16 } as const);

export interface AuthConfig {
  tenantId?: string;
  sessionHours?: number;
  maxAttempts?: number;
  lockMinutes?: number;
}

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const SESSION_TOKEN_CONTEXT = 'session-token';
const ACTOR = 'system:auth';
const DUMMY_SALT = Buffer.alloc(SCRYPT.saltBytes);
const DUMMY_HASH = Buffer.alloc(SCRYPT.keylen);

function iso(value: Date | string): string {
  return new Date(value).toISOString();
}

export function parsePasswordHash(stored: string): { salt: Buffer; hash: Buffer } | undefined {
  const parts = stored.split('$');
  if (parts.length !== 6) return undefined;
  const [scheme, n, r, p, salt, hash] = parts;
  if (scheme !== 'scrypt' || Number(n) !== SCRYPT.N || Number(r) !== SCRYPT.r || Number(p) !== SCRYPT.p) return undefined;
  if (!salt || !hash || !/^[A-Za-z0-9_-]+$/.test(salt) || !/^[A-Za-z0-9_-]+$/.test(hash)) return undefined;
  const saltBuffer = Buffer.from(salt, 'base64url');
  const hashBuffer = Buffer.from(hash, 'base64url');
  if (saltBuffer.length !== SCRYPT.saltBytes || hashBuffer.length !== SCRYPT.keylen) return undefined;
  return { salt: saltBuffer, hash: hashBuffer };
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SCRYPT.saltBytes);
  const hash = await scrypt(password, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64url')}$${hash.toString('base64url')}`;
}

/**
 * A malformed stored hash is verified against a dummy salt so rejects stay on the
 * same code path; the comparison itself never short-circuits on length.
 */
export async function verifyPassword(password: string, stored: string | undefined): Promise<boolean> {
  const parsed = stored === undefined ? undefined : parsePasswordHash(stored);
  const salt = parsed?.salt ?? DUMMY_SALT;
  const expected = parsed?.hash ?? DUMMY_HASH;
  const actual = await scrypt(password, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  const equal = expected.length === actual.length && timingSafeEqual(expected, actual);
  return parsed !== undefined && equal;
}

function invalid(message: string): never {
  throw new FitnessError('INVALID_ARGUMENTS', message);
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid('输入必须是对象');
  return value as Record<string, unknown>;
}

function exactKeys(data: Record<string, unknown>, keys: readonly string[]): void {
  for (const key of Object.keys(data)) if (!keys.includes(key)) invalid(`未知字段：${key}`);
}

function password(value: unknown, name: string): string {
  if (typeof value !== 'string' || /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(value)) {
    invalid(`${name} 必须是合法的 Unicode 字符串`);
  }
  const length = [...value].length;
  if (length < AUTH_PASSWORD_MIN_CODEPOINTS || length > AUTH_PASSWORD_MAX_CODEPOINTS) {
    invalid(`${name} 必须是 ${AUTH_PASSWORD_MIN_CODEPOINTS}–${AUTH_PASSWORD_MAX_CODEPOINTS} 个码点`);
  }
  if (!value.trim()) invalid(`${name} 不能全为空白`);
  return value;
}

/** Maps the user plugin's input errors onto the HTTP layer's 400 code. */
function clientInput<T>(run: () => T): T {
  try {
    return run();
  } catch (error) {
    if (error instanceof FitnessError && error.code === 'USER_INVALID') throw new FitnessError('INVALID_ARGUMENTS', error.message);
    throw error;
  }
}

function schema(value: Record<string, unknown>): void {
  if (value.schemaVersion !== '1.0') invalid('schemaVersion 仅支持 1.0');
}

interface Credential {
  readonly passwordHash: string;
  readonly failedAttempts: number;
  readonly lockedUntil: string | null;
}

export class AuthPlugin extends Service implements FitnessAuth {
  static provide = 'fitnessAuth';
  static inject = ['fitnessDatabase', 'fitnessUsers', 'fitnessUserDataProtection'];

  private readonly config: Required<AuthConfig> & { readonly tenantId: string };
  private closed = false;
  private readonly pending = new Set<Promise<unknown>>();

  constructor(ctx: Context, config: AuthConfig = {}) {
    super(ctx, 'fitnessAuth');
    const tenantId = config.tenantId ?? process.env.FITNESS_TENANT_ID;
    if (typeof tenantId !== 'string' || !/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(tenantId)) {
      throw new FitnessError('AUTH_CONFLICT', '未配置有效的 FITNESS_TENANT_ID；认证不设默认租户');
    }
    const integer = (value: unknown, fallback: number, min: number, max: number, name: string): number => {
      const raw = value === undefined ? fallback : typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
      if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < min || raw > max) {
        throw new FitnessError('AUTH_CONFLICT', `${name} 必须是 ${min}–${max} 的整数`);
      }
      return raw;
    };
    this.config = Object.freeze({
      tenantId: tenantId.toLowerCase(),
      sessionHours: integer(config.sessionHours ?? process.env.FITNESS_AUTH_SESSION_HOURS, 168, 1, 720, 'FITNESS_AUTH_SESSION_HOURS'),
      maxAttempts: integer(config.maxAttempts ?? process.env.FITNESS_AUTH_MAX_ATTEMPTS, 5, 1, 20, 'FITNESS_AUTH_MAX_ATTEMPTS'),
      lockMinutes: integer(config.lockMinutes ?? process.env.FITNESS_AUTH_LOCK_MINUTES, 15, 1, 1440, 'FITNESS_AUTH_LOCK_MINUTES'),
    });
    ctx.effect(() => async () => {
      this.closed = true;
      await Promise.allSettled([...this.pending]);
    });
  }

  private get tenantId(): string {
    return this.config.tenantId;
  }

  private run<T>(action: (session: DatabaseSession) => Promise<T>): Promise<T> {
    if (this.closed) return Promise.reject(new FitnessError('CANCELLED', '认证插件已卸载'));
    const operation = this.ctx.fitnessDatabase.transaction(async session => {
      await session.query("SELECT set_config('fitness.tenant_id', $1, true)", [this.tenantId]);
      const tenant = await session.query('SELECT id FROM fitness_users.tenants WHERE id=$1', [this.tenantId]);
      if (!tenant.rowCount) throw new FitnessError('TENANT_NOT_FOUND', '租户不存在或不可访问');
      return action(session);
    });
    this.pending.add(operation);
    return operation.finally(() => { this.pending.delete(operation); });
  }

  private fingerprint(token: string): string {
    return this.ctx.fitnessUserDataProtection.fingerprint([SESSION_TOKEN_CONTEXT, this.tenantId], token);
  }

  private async issueSession(user: UserAccount): Promise<AuthSession> {
    const token = randomBytes(32).toString('base64url');
    const lookup = this.fingerprint(token);
    const sessionId = randomUUID();
    const result = await this.run(session => session.query<{ expires_at: Date | string }>(
      `INSERT INTO fitness_users.sessions(tenant_id,id,user_id,token_lookup,expires_at)
       VALUES ($1,$2,$3,$4,clock_timestamp() + ($5::int * interval '1 hour'))
       RETURNING expires_at`,
      [this.tenantId, sessionId, user.id, lookup, this.config.sessionHours],
    ));
    const expiresAt = iso(result.rows[0]!.expires_at);
    // The event deliberately carries no token and no credential material.
    this.ctx.emit('fitness/auth-session-created', Object.freeze({
      tenantId: this.tenantId, userId: user.id, sessionId, expiresAt,
    }));
    return Object.freeze({ schemaVersion: '1.0' as const, token, expiresAt, user });
  }

  private async credential(userId: string): Promise<Credential | undefined> {
    const result = await this.run(session => session.query<{
      password_hash: string; failed_attempts: number; locked_until: Date | string | null;
    }>('SELECT password_hash,failed_attempts,locked_until FROM fitness_users.credentials WHERE tenant_id=$1 AND user_id=$2',
      [this.tenantId, userId]));
    const row = result.rows[0];
    if (!row) return undefined;
    return {
      passwordHash: row.password_hash,
      failedAttempts: row.failed_attempts,
      lockedUntil: row.locked_until === null ? null : iso(row.locked_until),
    };
  }

  private locked(value: Credential | undefined): boolean {
    return value?.lockedUntil !== null && value?.lockedUntil !== undefined && Date.parse(value.lockedUntil) > Date.now();
  }

  private async recordFailure(userId: string): Promise<'locked' | 'failed'> {
    const result = await this.run(async session => {
      // An expired lock ends the streak: the next failure starts a fresh run of attempts.
      await session.query(
        `UPDATE fitness_users.credentials SET failed_attempts=0,locked_until=NULL,updated_at=clock_timestamp()
         WHERE tenant_id=$1 AND user_id=$2 AND locked_until IS NOT NULL AND locked_until <= clock_timestamp()`,
        [this.tenantId, userId],
      );
      return session.query<{ locked_until: Date | string | null }>(
        `UPDATE fitness_users.credentials
         SET failed_attempts=failed_attempts+1,
             locked_until=CASE WHEN failed_attempts+1 >= $3
               THEN clock_timestamp() + ($4::int * interval '1 minute') ELSE locked_until END,
             updated_at=clock_timestamp()
         WHERE tenant_id=$1 AND user_id=$2
         RETURNING locked_until`,
        [this.tenantId, userId, this.config.maxAttempts, this.config.lockMinutes],
      );
    });
    const until = result.rows[0]?.locked_until;
    return until !== null && until !== undefined && Date.parse(iso(until)) > Date.now() ? 'locked' : 'failed';
  }

  private async clearFailures(userId: string): Promise<void> {
    await this.run(session => session.query(
      'UPDATE fitness_users.credentials SET failed_attempts=0,locked_until=NULL,updated_at=clock_timestamp() WHERE tenant_id=$1 AND user_id=$2',
      [this.tenantId, userId],
    ));
  }

  async register(value: unknown): Promise<AuthSession> {
    const data = object(value);
    schema(data);
    exactKeys(data, ['schemaVersion', 'identity', 'password', 'profile']);
    const identity = clientInput(() => validateIdentity({ ...object(data.identity), verified: true }));
    const profile: UserProfile = clientInput(() => validateProfile(data.profile));
    const passwordValue = password(data.password, 'password');
    const passwordHash = await hashPassword(passwordValue);

    let created: UserWriteResult;
    try {
      created = await this.ctx.fitnessUsers.create({
        schemaVersion: '1.0',
        tenantId: this.tenantId,
        profile,
        identity: { provider: identity.provider, subject: identity.subject, verified: true },
        mutation: { actorId: ACTOR, operationId: randomUUID() },
      });
    } catch (error) {
      if (error instanceof FitnessError && error.code === 'USER_CONFLICT') {
        throw new FitnessError('AUTH_CONFLICT', '该登录身份已被注册', { cause: error });
      }
      throw error;
    }
    const user = created.user;
    try {
      // Not atomic with account creation: the contract records this compensating flow.
      await this.run(session => session.query(
        'INSERT INTO fitness_users.credentials(tenant_id,user_id,password_hash) VALUES ($1,$2,$3)',
        [this.tenantId, user.id, passwordHash],
      ));
    } catch (error) {
      await this.ctx.fitnessUsers.erase({
        schemaVersion: '1.0', tenantId: this.tenantId, userId: user.id, expectedVersion: user.version,
        mutation: { actorId: ACTOR, operationId: randomUUID() },
      }).catch(() => undefined);
      throw error;
    }
    return this.issueSession(user);
  }

  async login(value: unknown): Promise<AuthSession> {
    const data = object(value);
    schema(data);
    exactKeys(data, ['schemaVersion', 'identity', 'password']);
    const identity = clientInput(() => validateIdentity(data.identity, false));
    const passwordValue = typeof data.password === 'string' ? data.password : invalid('password 必须是字符串');

    const user = await this.ctx.fitnessUsers.findByIdentity(this.tenantId, identity);
    const credential = user ? await this.credential(user.id) : undefined;
    // A missing account still pays for one scrypt run so rejects look alike in timing.
    if (this.locked(credential)) throw new FitnessError('AUTH_LOCKED', '登录失败次数过多，请稍后再试');
    const matches = await verifyPassword(passwordValue, credential?.passwordHash);
    if (!user || !credential || !matches) {
      if (user && credential) {
        const state = await this.recordFailure(user.id);
        if (state === 'locked') throw new FitnessError('AUTH_LOCKED', '登录失败次数过多，请稍后再试');
      }
      throw new FitnessError('AUTH_INVALID_CREDENTIALS', '身份或密码错误');
    }
    await this.clearFailures(user.id);
    return this.issueSession(user);
  }

  async authenticate(token: string): Promise<AuthPrincipal> {
    if (typeof token !== 'string' || !TOKEN_PATTERN.test(token)) {
      throw new FitnessError('AUTH_UNAUTHENTICATED', '未提供有效令牌');
    }
    const lookup = this.fingerprint(token);
    const result = await this.run(session => session.query<{ id: string; tenant_id: string; user_id: string }>(
      `SELECT s.id,s.tenant_id,s.user_id FROM fitness_users.sessions s
       JOIN fitness_users.accounts a ON a.tenant_id=s.tenant_id AND a.id=s.user_id
       WHERE s.tenant_id=$1 AND s.token_lookup=$2 AND s.revoked_at IS NULL
         AND s.expires_at > clock_timestamp() AND a.status='active'`,
      [this.tenantId, lookup],
    ));
    const row = result.rows[0];
    if (!row) throw new FitnessError('AUTH_UNAUTHENTICATED', '令牌无效、已过期或已吊销');
    return Object.freeze({ schemaVersion: '1.0' as const, tenantId: row.tenant_id, userId: row.user_id, sessionId: row.id });
  }

  async logout(token: string): Promise<void> {
    if (typeof token !== 'string' || !TOKEN_PATTERN.test(token)) return;
    await this.run(session => session.query(
      'UPDATE fitness_users.sessions SET revoked_at=clock_timestamp() WHERE tenant_id=$1 AND token_lookup=$2 AND revoked_at IS NULL',
      [this.tenantId, this.fingerprint(token)],
    ));
  }

  async changePassword(principal: AuthPrincipal, value: unknown): Promise<void> {
    const data = object(value);
    schema(data);
    exactKeys(data, ['schemaVersion', 'currentPassword', 'newPassword']);
    const current = password(data.currentPassword, 'currentPassword');
    const next = password(data.newPassword, 'newPassword');
    const credential = await this.credential(principal.userId);
    if (!credential) throw new FitnessError('AUTH_UNAUTHENTICATED', '会话对应的凭据不存在');
    if (!await verifyPassword(current, credential.passwordHash)) {
      throw new FitnessError('AUTH_INVALID_CREDENTIALS', '当前密码错误');
    }
    const passwordHash = await hashPassword(next);
    await this.run(async session => {
      await session.query(
        'UPDATE fitness_users.credentials SET password_hash=$3,failed_attempts=0,locked_until=NULL,updated_at=clock_timestamp() WHERE tenant_id=$1 AND user_id=$2',
        [this.tenantId, principal.userId, passwordHash],
      );
      // Other devices lose access; the session that changed the password stays valid.
      await session.query(
        'UPDATE fitness_users.sessions SET revoked_at=clock_timestamp() WHERE tenant_id=$1 AND user_id=$2 AND id<>$3 AND revoked_at IS NULL',
        [this.tenantId, principal.userId, principal.sessionId],
      );
    });
  }

  async revokeAll(tenantId: string, userId: string): Promise<number> {
    const tenant = typeof tenantId === 'string' ? tenantId.toLowerCase() : '';
    if (tenant !== this.tenantId) throw new FitnessError('TENANT_NOT_FOUND', '租户不存在或不可访问');
    if (typeof userId !== 'string' || !/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(userId)) {
      throw new FitnessError('INVALID_ARGUMENTS', 'userId 必须是 UUID');
    }
    const result = await this.run(session => session.query(
      'UPDATE fitness_users.sessions SET revoked_at=clock_timestamp() WHERE tenant_id=$1 AND user_id=$2 AND revoked_at IS NULL',
      [this.tenantId, userId.toLowerCase()],
    ));
    return result.rowCount;
  }
}
