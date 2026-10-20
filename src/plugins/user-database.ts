import { randomUUID } from 'node:crypto';
import { Service, type Context } from 'cordis';
import { FitnessError } from '../contracts.ts';
import type { DatabaseRow, DatabaseSession } from '../database-contracts.ts';
import type {
  ClaimedUserChange, FitnessUsers, IdentityInput, UserAccount, UserChange, UserChangeKind,
  UserIdentity, UserMutationContext, UserPage, UserProfile, UserStatus, UserWriteResult,
} from '../user-contracts.ts';
import { assertUserDatabase } from '../user-migrations.ts';
import * as validate from '../user-validation.ts';
import { DatabaseQueryError } from '../database-contracts.ts';

type AccountRow = DatabaseRow & {
  tenant_id: string; id: string; status: UserStatus; version: number;
  created_at: Date; updated_at: Date; erased_at: Date | null; sealed_profile: string | null;
  identities: { id: string; provider: string; verifiedAt: string | null; createdAt: string }[];
};
type ReceiptRow = DatabaseRow & { request_hash: string; user_id: string; applied_version: number; identity_id: string | null };
type EventRow = DatabaseRow & {
  id: string; tenant_id: string; user_id: string; user_version: number; kind: UserChangeKind;
  actor_id: string; operation_id: string; occurred_at: Date;
};
interface MutationSpec {
  tenantId: string; mutation: UserMutationContext; kind: UserChangeKind; payload: unknown;
  userId?: string | undefined; expectedVersion?: number | undefined;
}
const SELECT_USER = `SELECT a.*, p.sealed_profile, COALESCE((SELECT jsonb_agg(jsonb_build_object(
  'id', i.id, 'provider', i.provider, 'verifiedAt', i.verified_at, 'createdAt', i.created_at) ORDER BY i.id)
  FROM fitness_users.identities i WHERE i.tenant_id=a.tenant_id AND i.user_id=a.id), '[]'::jsonb) AS identities
  FROM fitness_users.accounts a LEFT JOIN fitness_users.profiles p ON p.tenant_id=a.tenant_id AND p.user_id=a.id`;
function iso(value: Date | string): string { return new Date(value).toISOString(); }
function event(row: EventRow): UserChange {
  return Object.freeze({ schemaVersion: '1.0', id: row.id, tenantId: row.tenant_id, userId: row.user_id,
    userVersion: row.user_version, kind: row.kind, actorId: row.actor_id, operationId: row.operation_id, occurredAt: iso(row.occurred_at) });
}

export class UserDatabasePlugin extends Service implements FitnessUsers {
  static provide = 'fitnessUsers';
  static inject = ['fitnessDatabase', 'fitnessUserDataProtection'];
  private closed = false;
  private readonly pending = new Set<Promise<unknown>>();

  constructor(ctx: Context) {
    super(ctx, 'fitnessUsers');
    ctx.effect(() => async () => { this.closed = true; await Promise.allSettled([...this.pending]); });
  }
  async [Service.init](): Promise<void> {
    await assertUserDatabase(this.ctx.fitnessDatabase);
    const expected = this.ctx.fitnessUserDataProtection.fingerprint(['configuration'], 'lookup-key-check-v1');
    await this.ctx.fitnessDatabase.transaction(async session => {
      const result = await session.query<{ lookup_key_check: string }>('SELECT lookup_key_check FROM fitness_users.key_registry WHERE id=1');
      if (result.rows[0]?.lookup_key_check !== expected) throw new FitnessError('DATA_PROTECTION_CONFIG', '身份检索密钥与数据库不匹配，或尚未显式初始化');
    });
  }

  private run<T>(tenantId: string, action: (session: DatabaseSession) => Promise<T>): Promise<T> {
    if (this.closed) return Promise.reject(new FitnessError('CANCELLED', '用户数据库插件已卸载'));
    const operation = this.ctx.fitnessDatabase.transaction(async session => {
      await session.query("SELECT set_config('fitness.tenant_id', $1, true)", [tenantId]);
      const tenant = await session.query('SELECT id FROM fitness_users.tenants WHERE id=$1', [tenantId]);
      if (!tenant.rowCount) throw new FitnessError('TENANT_NOT_FOUND', '租户不存在或不可访问');
      return action(session);
    });
    this.pending.add(operation);
    return operation.finally(() => { this.pending.delete(operation); });
  }
  private profileContext(tenantId: string, userId: string): readonly string[] { return ['profile', tenantId, userId]; }
  private identityContext(tenantId: string, userId: string, identityId: string, provider: string): readonly string[] {
    return ['identity', tenantId, userId, identityId, provider];
  }
  private lookup(tenantId: string, identity: Pick<IdentityInput, 'provider' | 'subject'>): string {
    return this.ctx.fitnessUserDataProtection.fingerprint(['identity-lookup', tenantId, identity.provider], identity.subject);
  }
  private account(row: AccountRow): UserAccount {
    let profile: UserProfile | null = null;
    if (row.status !== 'deleted') {
      if (!row.sealed_profile) throw new FitnessError('DATA_PROTECTION_FAILED', '用户资料缺失，无法返回完整记录');
      try { profile = validate.profile(JSON.parse(this.ctx.fitnessUserDataProtection.open(this.profileContext(row.tenant_id, row.id), row.sealed_profile))); }
      catch { throw new FitnessError('DATA_PROTECTION_FAILED', '用户资料解密或格式校验失败'); }
    }
    const identities: readonly UserIdentity[] = Object.freeze(row.identities.map(identity => Object.freeze({
      id: identity.id, provider: identity.provider, verifiedAt: identity.verifiedAt === null ? null : iso(identity.verifiedAt), createdAt: iso(identity.createdAt),
    })));
    return Object.freeze({ schemaVersion: '1.0', tenantId: row.tenant_id, id: row.id, status: row.status,
      version: row.version, profile, identities, createdAt: iso(row.created_at), updatedAt: iso(row.updated_at), erasedAt: row.erased_at === null ? null : iso(row.erased_at) });
  }
  private async load(session: DatabaseSession, tenantId: string, userId: string): Promise<UserAccount | null> {
    const result = await session.query<AccountRow>(`${SELECT_USER} WHERE a.tenant_id=$1 AND a.id=$2`, [tenantId, userId]);
    return result.rows[0] ? this.account(result.rows[0]) : null;
  }
  private async saveProfile(session: DatabaseSession, tenantId: string, userId: string, profile: UserProfile): Promise<void> {
    const sealed = this.ctx.fitnessUserDataProtection.seal(this.profileContext(tenantId, userId), JSON.stringify(profile));
    await session.query(`INSERT INTO fitness_users.profiles(tenant_id,user_id,sealed_profile) VALUES ($1,$2,$3)
      ON CONFLICT (tenant_id,user_id) DO UPDATE SET sealed_profile=EXCLUDED.sealed_profile`, [tenantId, userId, sealed]);
  }
  private async saveIdentity(session: DatabaseSession, tenantId: string, userId: string, identity: IdentityInput): Promise<string> {
    const id = randomUUID();
    const sealed = this.ctx.fitnessUserDataProtection.seal(this.identityContext(tenantId, userId, id, identity.provider), identity.subject);
    const result = await session.query<{ id: string }>(`INSERT INTO fitness_users.identities
      (tenant_id,id,user_id,provider,subject_lookup,sealed_subject,verified_at) VALUES ($1,$2,$3,$4,$5,$6,CASE WHEN $7 THEN clock_timestamp() ELSE NULL END)
      ON CONFLICT ON CONSTRAINT identities_subject_unique DO UPDATE SET verified_at=EXCLUDED.verified_at
      WHERE fitness_users.identities.user_id=EXCLUDED.user_id RETURNING id`,
      [tenantId,id,userId,identity.provider,this.lookup(tenantId,identity),sealed,identity.verified]);
    if (!result.rows[0]) throw new FitnessError('USER_CONFLICT', '该登录身份已被其他用户占用');
    return result.rows[0].id;
  }
  private async write(spec: MutationSpec, apply: (session: DatabaseSession, userId: string) => Promise<string | null>): Promise<UserWriteResult> {
    let committedEvent: UserChange | undefined;
    const requestHash = this.ctx.fitnessUserDataProtection.fingerprint(['mutation', spec.tenantId, spec.mutation.operationId], validate.canonical({
      kind: spec.kind, actorId: spec.mutation.actorId, userId: spec.userId, expectedVersion: spec.expectedVersion, payload: spec.payload,
    }));
    try {
      const result = await this.run(spec.tenantId, async session => {
        await session.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`${spec.tenantId}:${spec.mutation.operationId}`]);
        const existing = await session.query<ReceiptRow>('SELECT request_hash,user_id,applied_version,identity_id FROM fitness_users.mutation_receipts WHERE tenant_id=$1 AND operation_id=$2', [spec.tenantId,spec.mutation.operationId]);
        const receipt = existing.rows[0];
        if (receipt) {
          if (receipt.request_hash !== requestHash) throw new FitnessError('IDEMPOTENCY_CONFLICT', 'operationId 已用于不同的请求');
          const user = await this.load(session,spec.tenantId,receipt.user_id);
          if (!user) throw new FitnessError('USER_NOT_FOUND', '操作回执引用的用户不存在');
          return Object.freeze({ schemaVersion: '1.0' as const, user, operationId: spec.mutation.operationId,
            appliedVersion: receipt.applied_version, replayed: true, identityId: receipt.identity_id });
        }
        const userId = spec.userId ?? randomUUID();
        if (spec.userId) {
          const locked = await session.query<{ version: number; status: UserStatus }>('SELECT version,status FROM fitness_users.accounts WHERE tenant_id=$1 AND id=$2 FOR UPDATE', [spec.tenantId,userId]);
          if (!locked.rows[0]) throw new FitnessError('USER_NOT_FOUND', '用户不存在或不可访问');
          if (locked.rows[0].version !== spec.expectedVersion) throw new FitnessError('USER_VERSION_CONFLICT', '用户记录已变更，请重新读取版本');
          if (locked.rows[0].status === 'deleted') throw new FitnessError('USER_STATE_CONFLICT', '已删除的用户不能恢复或修改');
          await session.query('UPDATE fitness_users.accounts SET version=version+1,updated_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2', [spec.tenantId,userId]);
        }
        const identityId = await apply(session,userId);
        const user = await this.load(session,spec.tenantId,userId);
        if (!user) throw new FitnessError('USER_NOT_FOUND', '用户写入结果不存在');
        const audit = await session.query<EventRow>(`INSERT INTO fitness_users.audit_events
          (tenant_id,id,user_id,user_version,kind,actor_id,operation_id) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
          [spec.tenantId,randomUUID(),userId,user.version,spec.kind,spec.mutation.actorId,spec.mutation.operationId]);
        const change = event(audit.rows[0]!);
        await session.query('INSERT INTO fitness_users.outbox(tenant_id,event_id) VALUES ($1,$2)', [spec.tenantId,change.id]);
        await session.query(`INSERT INTO fitness_users.mutation_receipts
          (tenant_id,operation_id,request_hash,kind,actor_id,user_id,applied_version,identity_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [spec.tenantId,spec.mutation.operationId,requestHash,spec.kind,spec.mutation.actorId,userId,user.version,identityId]);
        committedEvent = change;
        return Object.freeze({ schemaVersion: '1.0' as const, user, operationId: spec.mutation.operationId, appliedVersion: user.version, replayed: false, identityId });
      });
      if (committedEvent) { try { this.ctx.emit('fitness/user-changed', committedEvent); } catch { /* Delivery remains available in the transactional outbox. */ } }
      return result;
    } catch (error) {
      if (error instanceof DatabaseQueryError && error.sqlState === '23505') throw new FitnessError('USER_CONFLICT', '用户或登录身份存在唯一性冲突');
      throw error;
    }
  }

  async create(value: unknown): Promise<UserWriteResult> {
    const input = validate.base(value,['profile','identity'],true);
    const profile = validate.profile(input.data.profile);
    const identity = input.data.identity === undefined ? undefined : validate.identity(input.data.identity);
    return this.write({ ...input, kind: 'user.created', payload: { profile, identity } }, async (session,userId) => {
      await session.query('INSERT INTO fitness_users.accounts(tenant_id,id) VALUES ($1,$2)', [input.tenantId,userId]);
      await this.saveProfile(session,input.tenantId,userId,profile);
      return identity ? this.saveIdentity(session,input.tenantId,userId,identity) : null;
    });
  }
  async get(tenantId: string, userId: string): Promise<UserAccount | null> {
    const tenant = validate.uuid(tenantId,'tenantId'); const user = validate.uuid(userId,'userId');
    return this.run(tenant,session => this.load(session,tenant,user));
  }
  async list(tenantId: string, options: { readonly limit?: number; readonly after?: string; readonly status?: UserStatus } = {}): Promise<UserPage> {
    const tenant = validate.uuid(tenantId,'tenantId'); const data = validate.object(options);
    validate.exact(data,['limit','after','status']);
    const limit = data.limit === undefined ? 50 : validate.integer(data.limit,'limit',1,100);
    const after = data.after === undefined ? null : validate.uuid(data.after,'after');
    const status = data.status === undefined ? 'active' : data.status;
    if (!['active','suspended','deleted'].includes(status as string)) validate.invalid('status 格式无效');
    return this.run(tenant,async session => {
      const rows = await session.query<AccountRow>(`${SELECT_USER} WHERE a.tenant_id=$1 AND a.status=$2 AND ($3::uuid IS NULL OR a.id>$3) ORDER BY a.id LIMIT $4`, [tenant,status,after,limit+1]);
      return Object.freeze({ schemaVersion: '1.0', items: Object.freeze(rows.rows.slice(0,limit).map(row => this.account(row))),
        nextCursor: rows.rows.length>limit ? rows.rows[limit-1]!.id : null });
    });
  }
  async updateProfile(value: unknown): Promise<UserWriteResult> {
    const input = validate.base(value,['profile']); const profile = validate.profile(input.data.profile);
    return this.write({ ...input, kind: 'user.profile-updated', payload: profile }, async (session,userId) => {
      await this.saveProfile(session,input.tenantId,userId,profile); return null;
    });
  }
  async changeStatus(value: unknown): Promise<UserWriteResult> {
    const input = validate.base(value,['status']); const status = input.data.status;
    if (status !== 'active' && status !== 'suspended') validate.invalid('status 仅支持 active 或 suspended');
    return this.write({ ...input, kind: 'user.status-changed', payload: status }, async (session,userId) => {
      await session.query('UPDATE fitness_users.accounts SET status=$3 WHERE tenant_id=$1 AND id=$2', [input.tenantId,userId,status]); return null;
    });
  }
  async linkIdentity(value: unknown): Promise<UserWriteResult> {
    const input = validate.base(value,['identity']); const identity = validate.identity(input.data.identity);
    return this.write({ ...input, kind: 'user.identity-linked', payload: identity }, (session,userId) => this.saveIdentity(session,input.tenantId,userId,identity));
  }
  async unlinkIdentity(value: unknown): Promise<UserWriteResult> {
    const input = validate.base(value,['identityId']); const id = validate.uuid(input.data.identityId,'identityId');
    return this.write({ ...input, kind: 'user.identity-unlinked', payload: id }, async (session,userId) => {
      const result = await session.query('DELETE FROM fitness_users.identities WHERE tenant_id=$1 AND user_id=$2 AND id=$3', [input.tenantId,userId,id]);
      if (!result.rowCount) throw new FitnessError('USER_NOT_FOUND', '登录身份不存在或不属于该用户'); return id;
    });
  }
  async findByIdentity(tenantId: string, value: { readonly provider: string; readonly subject: string }): Promise<UserAccount | null> {
    const tenant = validate.uuid(tenantId,'tenantId'); const identity = validate.identity(value,false);
    return this.run(tenant,async session => {
      const result = await session.query<AccountRow>(`${SELECT_USER} WHERE a.tenant_id=$1 AND EXISTS (
        SELECT 1 FROM fitness_users.identities lookup WHERE lookup.tenant_id=a.tenant_id AND lookup.user_id=a.id
        AND lookup.provider=$2 AND lookup.subject_lookup=$3)`, [tenant,identity.provider,this.lookup(tenant,identity)]);
      return result.rows[0] ? this.account(result.rows[0]) : null;
    });
  }
  async readIdentitySubject(tenantId: string, userId: string, identityId: string): Promise<string | null> {
    const tenant = validate.uuid(tenantId,'tenantId'); const user = validate.uuid(userId,'userId'); const id = validate.uuid(identityId,'identityId');
    return this.run(tenant,async session => {
      const result = await session.query<{ provider: string; sealed_subject: string }>('SELECT provider,sealed_subject FROM fitness_users.identities WHERE tenant_id=$1 AND user_id=$2 AND id=$3', [tenant,user,id]);
      return result.rows[0] ? this.ctx.fitnessUserDataProtection.open(this.identityContext(tenant,user,id,result.rows[0].provider),result.rows[0].sealed_subject) : null;
    });
  }
  async erase(value: unknown): Promise<UserWriteResult> {
    const input = validate.base(value,[]);
    return this.write({ ...input, kind: 'user.erased', payload: null }, async (session,userId) => {
      await session.query('DELETE FROM fitness_users.identities WHERE tenant_id=$1 AND user_id=$2', [input.tenantId,userId]);
      await session.query('DELETE FROM fitness_users.profiles WHERE tenant_id=$1 AND user_id=$2', [input.tenantId,userId]);
      await session.query("UPDATE fitness_users.accounts SET status='deleted',erased_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2", [input.tenantId,userId]); return null;
    });
  }
  async reencrypt(value: unknown): Promise<UserWriteResult> {
    const input = validate.base(value,[]);
    return this.write({ ...input, kind: 'user.encryption-rotated', payload: null }, async (session,userId) => {
      const user = await this.load(session,input.tenantId,userId);
      if (!user?.profile) throw new FitnessError('USER_NOT_FOUND', '用户资料不存在');
      await this.saveProfile(session,input.tenantId,userId,user.profile);
      const identities = await session.query<{ id: string; provider: string; sealed_subject: string }>('SELECT id,provider,sealed_subject FROM fitness_users.identities WHERE tenant_id=$1 AND user_id=$2', [input.tenantId,userId]);
      for (const identity of identities.rows) {
        const context = this.identityContext(input.tenantId,userId,identity.id,identity.provider);
        const subject = this.ctx.fitnessUserDataProtection.open(context,identity.sealed_subject);
        await session.query('UPDATE fitness_users.identities SET sealed_subject=$4 WHERE tenant_id=$1 AND user_id=$2 AND id=$3',
          [input.tenantId,userId,identity.id,this.ctx.fitnessUserDataProtection.seal(context,subject)]);
      }
      return null;
    });
  }
  async claimChanges(tenantId: string, options: { readonly workerId: string; readonly limit?: number; readonly leaseMs?: number }): Promise<readonly ClaimedUserChange[]> {
    const tenant = validate.uuid(tenantId,'tenantId'); const data = validate.object(options);
    validate.exact(data,['workerId','limit','leaseMs']);
    const worker = validate.workerId(data.workerId);
    const limit = data.limit === undefined ? 50 : validate.integer(data.limit,'limit',1,100);
    const lease = data.leaseMs === undefined ? 30_000 : validate.integer(data.leaseMs,'leaseMs',100,300_000);
    return this.run(tenant,async session => {
      const rows = await session.query<EventRow & { lease_token: string; lease_until: Date }>(`WITH candidates AS (
        SELECT event_id FROM fitness_users.outbox WHERE tenant_id=$1 AND delivered_at IS NULL
        AND (lease_until IS NULL OR lease_until<=clock_timestamp()) ORDER BY event_id FOR UPDATE SKIP LOCKED LIMIT $2
      ), claimed AS (UPDATE fitness_users.outbox o SET lease_owner=$3,lease_token=$4,lease_until=clock_timestamp()+($5::integer*interval '1 millisecond')
        FROM candidates c WHERE o.tenant_id=$1 AND o.event_id=c.event_id RETURNING o.event_id,o.lease_token,o.lease_until)
      SELECT e.*,c.lease_token,c.lease_until FROM claimed c JOIN fitness_users.audit_events e ON e.tenant_id=$1 AND e.id=c.event_id`,
        [tenant,limit,worker,randomUUID(),lease]);
      return Object.freeze(rows.rows.map(row => Object.freeze({ event: event(row), leaseToken: row.lease_token, leaseUntil: iso(row.lease_until) })));
    });
  }
  async acknowledgeChange(tenantId: string, eventId: string, workerId: string, leaseToken: string): Promise<void> {
    const tenant = validate.uuid(tenantId,'tenantId'); const id = validate.uuid(eventId,'eventId');
    const worker = validate.workerId(workerId); const token = validate.uuid(leaseToken,'leaseToken');
    await this.run(tenant,async session => {
      const result = await session.query(`UPDATE fitness_users.outbox SET delivered_at=clock_timestamp()
        WHERE tenant_id=$1 AND event_id=$2 AND lease_owner=$3 AND lease_token=$4 AND lease_until>clock_timestamp() AND delivered_at IS NULL`, [tenant,id,worker,token]);
      if (!result.rowCount) throw new FitnessError('OUTBOX_LEASE_LOST', '事件租约已失效或已被确认');
    });
  }
}
