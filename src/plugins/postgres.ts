import { readFileSync } from 'node:fs';
import { Service, type Context } from 'cordis';
import { Pool, type PoolClient, type PoolConfig } from 'pg';
import { FitnessError } from '../contracts.ts';
import { DatabaseQueryError, type DatabaseRow, type DatabaseResult, type DatabaseSession, type FitnessDatabase } from '../database-contracts.ts';

export interface PostgresConfig {
  readonly connectionString?: string;
  readonly tls?: 'verify-full' | 'local';
  readonly ca?: string;
  readonly maxConnections?: number;
  readonly maxQueue?: number;
  readonly connectionTimeoutMs?: number;
  readonly statementTimeoutMs?: number;
  readonly transactionTimeoutMs?: number;
}
function invalid(): never { throw new FitnessError('DATABASE_CONFIG', '数据库配置无效；检查 URL、TLS 和连接预算，不要在 URL 中设置额外参数'); }
function integer(value: unknown, fallback: number, min: number, max: number): number {
  const result = value === undefined ? fallback : typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
  if (typeof result !== 'number' || !Number.isInteger(result) || result < min || result > max) invalid();
  return result;
}

export function postgresOptions(config: PostgresConfig = {}): { pool: PoolConfig; transactionTimeoutMs: number; maxQueue: number } {
  const connectionString = config.connectionString ?? process.env.FITNESS_DATABASE_URL;
  if (!connectionString) invalid();
  let url: URL;
  try { url = new URL(connectionString); } catch { invalid(); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.username || !url.password || url.pathname.length < 2 || url.search || url.hash) invalid();
  const tls = config.tls ?? process.env.FITNESS_DATABASE_TLS ?? 'verify-full';
  if (tls !== 'verify-full' && tls !== 'local') invalid();
  if (tls === 'local' && !['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname)) invalid();
  let ca = config.ca;
  if (ca === undefined && process.env.FITNESS_DATABASE_CA_FILE) {
    try { ca = readFileSync(process.env.FITNESS_DATABASE_CA_FILE, 'utf8'); } catch { invalid(); }
  }
  const statementTimeoutMs = integer(config.statementTimeoutMs ?? process.env.FITNESS_DATABASE_STATEMENT_TIMEOUT_MS, 10_000, 50, 120_000);
  const transactionTimeoutMs = integer(config.transactionTimeoutMs ?? process.env.FITNESS_DATABASE_TRANSACTION_TIMEOUT_MS, 30_000, 100, 180_000);
  return {
    pool: {
      connectionString, ssl: tls === 'local' ? false : { rejectUnauthorized: true, ...(ca === undefined ? {} : { ca }) },
      max: integer(config.maxConnections ?? process.env.FITNESS_DATABASE_POOL_MAX, 10, 1, 50),
      connectionTimeoutMillis: integer(config.connectionTimeoutMs, 5_000, 100, 30_000),
      idleTimeoutMillis: 30_000, maxLifetimeSeconds: 300,
      statement_timeout: statementTimeoutMs, query_timeout: statementTimeoutMs + 1000,
      lock_timeout: Math.min(statementTimeoutMs, 3000), idle_in_transaction_session_timeout: transactionTimeoutMs,
      application_name: 'fitness-ai-users', options: '-c search_path=pg_catalog -c timezone=UTC',
    },
    transactionTimeoutMs, maxQueue: integer(config.maxQueue, 100, 0, 1000),
  };
}

export class PostgresPlugin extends Service implements FitnessDatabase {
  static provide = 'fitnessDatabase';
  private readonly pool: Pool;
  private readonly transactionTimeoutMs: number;
  private readonly maxQueue: number;
  private readonly active = new Map<PoolClient, () => void>();
  private closed = false;

  constructor(ctx: Context, config: PostgresConfig = {}) {
    const settings = postgresOptions(config);
    super(ctx, 'fitnessDatabase');
    this.pool = new Pool(settings.pool);
    this.transactionTimeoutMs = settings.transactionTimeoutMs;
    this.maxQueue = settings.maxQueue;
    // Idle connection errors are reported by subsequent health checks, never raw SQL logs.
    this.pool.on('error', () => {});
    ctx.effect(() => async () => {
      this.closed = true;
      for (const cancel of [...this.active.values()]) cancel();
      await this.pool.end();
    });
  }

  async [Service.init](): Promise<void> { await this.health(); }

  async health(): Promise<{ readonly schemaVersion: '1.0'; readonly status: 'ready'; readonly serverVersion: number }> {
    const version = await this.transaction(async session => {
      const result = await session.query<{ version: string }>("SELECT current_setting('server_version_num') AS version");
      return Number(result.rows[0]?.version);
    });
    if (!Number.isInteger(version) || version < 160000) throw new FitnessError('DATABASE_CONFIG', '需要 PostgreSQL 16 或以上版本');
    return Object.freeze({ schemaVersion: '1.0', status: 'ready', serverVersion: version });
  }

  async transaction<T>(action: (session: DatabaseSession) => Promise<T>): Promise<T> {
    if (this.closed) throw new FitnessError('DATABASE_CLOSED', '数据库插件已卸载');
    if (this.pool.totalCount >= (this.pool.options.max ?? 10) && this.pool.idleCount === 0 && this.pool.waitingCount >= this.maxQueue) {
      throw new FitnessError('DATABASE_BUSY', '数据库等待队列已达到预算');
    }
    let client: PoolClient;
    try { client = await this.pool.connect(); } catch { throw new FitnessError('DATABASE_UNAVAILABLE', '无法取得数据库连接'); }
    if (this.closed) { client.release(true); throw new FitnessError('DATABASE_CLOSED', '数据库插件已卸载'); }
    let usable = true;
    let released = false;
    let committing = false;
    let timer: ReturnType<typeof setTimeout>;
    let onConnectionError = () => {};
    const release = (destroy = false) => {
      if (released) return;
      released = true; usable = false;
      this.active.delete(client);
      if (destroy) client.once('end', () => { client.removeListener('error', onConnectionError); });
      client.release(destroy);
      if (!destroy) client.removeListener('error', onConnectionError);
    };
    const interrupted = new Promise<never>((_resolve, reject) => {
      const cancel = (reason: 'closed' | 'timeout' | 'connection') => {
        if (released) return;
        const code = committing ? 'DATABASE_TRANSACTION_UNKNOWN' : reason === 'closed' ? 'DATABASE_CLOSED'
          : reason === 'timeout' ? 'DATABASE_TIMEOUT' : 'DATABASE_UNAVAILABLE';
        release(true);
        reject(new FitnessError(code, committing ? '提交结果未知；请使用相同 operationId 查询或重试，不要生成新操作标识'
          : reason === 'closed' ? '数据库卸载已终止事务' : reason === 'timeout' ? '数据库事务超过总时间预算' : '数据库连接中断，事务未完成'));
      };
      onConnectionError = () => { cancel('connection'); };
      client.on('error', onConnectionError);
      this.active.set(client, () => { cancel('closed'); });
      timer = setTimeout(() => { cancel('timeout'); }, this.transactionTimeoutMs);
    });
    const query = async <Row extends DatabaseRow>(sql: string, values?: readonly unknown[]): Promise<DatabaseResult<Row>> => {
      if (!usable) throw new FitnessError('DATABASE_CLOSED', '事务会话已失效');
      try {
        const raw = await client.query<Row>(sql, values === undefined ? undefined : [...values]);
        const result = Array.isArray(raw) ? raw.at(-1) : raw;
        return { rows: result?.rows ?? [], rowCount: result?.rowCount ?? 0 };
      } catch (error) { throw new DatabaseQueryError(error); }
    };
    const operation = (async () => {
      try {
        await query('BEGIN');
        const result = await action(Object.freeze({ query }));
        if (!usable) throw new FitnessError('DATABASE_CLOSED', '事务会话已失效');
        usable = false;
        committing = true;
        let commit;
        try { commit = await client.query('COMMIT'); } catch (error) { throw new DatabaseQueryError(error); }
        committing = false;
        if (commit.command !== 'COMMIT') throw new FitnessError('DATABASE_UNAVAILABLE', '数据库事务已回滚，未提交业务变更');
        return result;
      } catch (error) {
        const definitive = error instanceof DatabaseQueryError && error.sqlState !== undefined && /^(23|40)/.test(error.sqlState);
        if (committing && !definitive) {
          release(true);
          throw new FitnessError('DATABASE_TRANSACTION_UNKNOWN', '提交结果未知；请使用相同 operationId 查询或重试');
        }
        if (!released) { try { await client.query('ROLLBACK'); } catch { release(true); } }
        throw error;
      } finally { usable = false; release(); }
    })();
    try { return await Promise.race([operation, interrupted]); }
    finally { clearTimeout(timer!); }
  }
}
