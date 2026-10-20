import type {} from 'cordis';
import { FitnessError } from './contracts.ts';

export class DatabaseQueryError extends FitnessError {
  readonly sqlState: string | undefined;
  readonly constraint: string | undefined;
  constructor(error: unknown) {
    const data = error && typeof error === 'object' ? error as Record<string, unknown> : {};
    const state = typeof data.code === 'string' && /^[0-9A-Z]{5}$/.test(data.code) ? data.code : undefined;
    super(state === '57014' || state === '55P03' ? 'DATABASE_TIMEOUT' : 'DATABASE_UNAVAILABLE',
      state === '57014' || state === '55P03' ? '数据库操作超过时间或锁等待预算' : '数据库操作失败');
    this.sqlState = state;
    this.constraint = typeof data.constraint === 'string' && /^[a-z0-9_]{1,100}$/.test(data.constraint) ? data.constraint : undefined;
  }
}


export type DatabaseRow = Record<string, unknown>;
export interface DatabaseResult<Row extends DatabaseRow = DatabaseRow> {
  readonly rows: readonly Row[];
  readonly rowCount: number;
}
export interface DatabaseSession {
  query<Row extends DatabaseRow = DatabaseRow>(sql: string, values?: readonly unknown[]): Promise<DatabaseResult<Row>>;
}
export interface FitnessDatabase {
  /** One connection, one bounded transaction. Callbacks must not perform remote I/O. */
  transaction<T>(action: (session: DatabaseSession) => Promise<T>): Promise<T>;
  health(): Promise<{ readonly schemaVersion: '1.0'; readonly status: 'ready'; readonly serverVersion: number }>;
}
export interface SealedData { readonly value: string }
export interface FitnessUserDataProtection {
  seal(context: readonly string[], plaintext: string): string;
  open(context: readonly string[], envelope: string): string;
  fingerprint(context: readonly string[], plaintext: string): string;
  needsRotation(envelope: string): boolean;
}
export interface DatabaseMigration {
  readonly version: number;
  readonly name: string;
  readonly sql: string;
  readonly checksum: string;
}

declare module 'cordis' {
  interface Context {
    fitnessDatabase: FitnessDatabase;
    fitnessUserDataProtection: FitnessUserDataProtection;
  }
}
