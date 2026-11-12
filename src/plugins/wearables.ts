import { randomUUID } from 'node:crypto';
import { Service, type Context } from 'cordis';
import { FitnessError } from '../contracts.ts';
import { DatabaseQueryError, type DatabaseRow, type DatabaseSession } from '../database-contracts.ts';
import type { AuthPrincipal } from '../auth-contracts.ts';
import {
  METRIC_KINDS, METRIC_RANGE, METRIC_UNIT,
  type FitnessWearables, type MetricBucket, type MetricBucketSummary, type MetricIngestResult, type MetricKind,
  type MetricPage, type MetricQuery, type MetricSample, type MetricSummary, type MetricSummaryQuery, type MetricUnit,
} from '../wearable-contracts.ts';

/**
 * 可穿戴生理指标存储。
 *
 * 数值一律加密落库，明文列只有种类、单位、来源、时间这些可索引坐标，因此库内不做
 * 聚合：`list` 与 `summary` 都把密文取回、在服务进程内解密后计算。代价是 `summary`
 * 有扫描上限，见 `MAX_SUMMARY_SAMPLES`。
 *
 * 这一层不参与评分。`fitnessScoring` 不接受生理指标，规则评分里也不得读取它们。
 */

const UUID = /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/i;
const BASE64URL = /^[A-Za-z0-9_-]+$/;
const SOURCE = /^[A-Za-z0-9._:-]{1,32}$/;
const MAX_CURSOR_LENGTH = 512;
const MAX_BATCH = 500;
const MAX_WINDOW_MS = 31 * 24 * 60 * 60 * 1000;
/** 「解密后才聚合」的代价上限；1 分钟采样 × 31 天约 44640 条，留足余量。 */
const MAX_SUMMARY_SAMPLES = 100_000;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function invalid(message: string): never { throw new FitnessError('METRIC_INVALID', message); }
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid('输入必须是对象');
  return value as Record<string, unknown>;
}
function exact(data: Record<string, unknown>, allowed: readonly string[]): void {
  for (const key of Object.keys(data)) if (!allowed.includes(key)) invalid('输入包含未声明字段');
}
function uuid(value: unknown, name = 'id'): string {
  if (typeof value !== 'string' || !UUID.test(value)) invalid(`${name} 必须是 UUID`);
  return value.toLowerCase();
}
function timestamp(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.length > 40 || !TIMESTAMP.test(value) || Number.isNaN(Date.parse(value))) {
    invalid(`${name} 必须是带时区的 ISO 8601 时间`);
  }
  return new Date(value).toISOString();
}
function number(value: unknown, name: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    invalid(`${name} 超出允许范围 ${min}–${max}`);
  }
  return value;
}
function iso(value: Date | string): string { return new Date(value).toISOString(); }

function metricKind(value: unknown): MetricKind {
  if (typeof value !== 'string' || !METRIC_KINDS.includes(value as MetricKind)) {
    invalid('kind 仅支持 heart-rate、spo2、steps、cadence 或 energy');
  }
  return value as MetricKind;
}

interface NormalizedSample {
  readonly kind: MetricKind;
  readonly unit: MetricUnit;
  readonly value: number;
  readonly source: string;
  readonly capturedAt: string;
  readonly intervalMinutes: number | null;
}

/** 种类与单位绑定校验；`{kind:'heart-rate', unit:'percent'}` 直接拒绝。 */
function sample(value: unknown): NormalizedSample {
  const data = object(value);
  exact(data, ['kind', 'unit', 'value', 'source', 'capturedAt', 'intervalMinutes']);
  const kind = metricKind(data.kind);
  if (data.unit !== METRIC_UNIT[kind]) invalid(`${kind} 的单位必须是 ${METRIC_UNIT[kind]}`);
  const range = METRIC_RANGE[kind];
  const numeric = number(data.value, 'value', range.min, range.max);
  if (typeof data.source !== 'string' || !SOURCE.test(data.source)) invalid('source 格式无效');
  const capturedAt = timestamp(data.capturedAt, 'capturedAt');
  let intervalMinutes: number | null = null;
  if (data.intervalMinutes !== undefined) {
    if (kind !== 'steps') invalid('intervalMinutes 仅用于 steps');
    if (typeof data.intervalMinutes !== 'number' || !Number.isInteger(data.intervalMinutes)
      || data.intervalMinutes < 1 || data.intervalMinutes > 1440) invalid('intervalMinutes 必须是 1–1440 的整数');
    intervalMinutes = data.intervalMinutes;
  }
  return Object.freeze({ kind, unit: data.unit as MetricUnit, value: numeric, source: data.source, capturedAt, intervalMinutes });
}

interface Owner { readonly tenantId: string; readonly userId: string }
function ownerOf(value: AuthPrincipal): Owner {
  const data = object(value);
  exact(data, ['schemaVersion', 'tenantId', 'userId', 'sessionId']);
  if (data.schemaVersion !== '1.0') invalid('鉴权主体无效');
  uuid(data.sessionId, 'sessionId');
  return Object.freeze({ tenantId: uuid(data.tenantId, 'tenantId'), userId: uuid(data.userId, 'userId') });
}

/** 密文载荷：数值与区间长度一起加密，明文列不含任何测量值。 */
interface SealedPayload { readonly v: number; readonly i?: number }

export interface MetricCursor { readonly capturedAt: string; readonly id: string }
export function encodeMetricCursor(capturedAt: string, id: string): string {
  return Buffer.from(`${iso(capturedAt)}|${uuid(id)}`, 'utf8').toString('base64url');
}
export function decodeMetricCursor(value: unknown): MetricCursor {
  if (typeof value !== 'string' || value.length > MAX_CURSOR_LENGTH || !BASE64URL.test(value) ||
    Buffer.from(value, 'base64url').toString('base64url') !== value) invalid('after 游标格式无效');
  const parts = Buffer.from(value, 'base64url').toString('utf8').split('|');
  if (parts.length !== 2) invalid('after 游标格式无效');
  return Object.freeze({ capturedAt: timestamp(parts[0], 'after 游标'), id: uuid(parts[1], 'after 游标') });
}

export interface NormalizedMetricQuery {
  readonly limit: number;
  readonly after: MetricCursor | null;
  readonly kind: MetricKind | null;
  readonly from: string | null;
  readonly to: string | null;
}
export function parseMetricQuery(value: unknown = {}): NormalizedMetricQuery {
  const data = object(value);
  exact(data, ['limit', 'after', 'kind', 'from', 'to']);
  const from = data.from === undefined || data.from === null ? null : timestamp(data.from, 'from');
  const to = data.to === undefined || data.to === null ? null : timestamp(data.to, 'to');
  if (from && to && Date.parse(from) > Date.parse(to)) invalid('from 不能晚于 to');
  if (from && to && Date.parse(to) - Date.parse(from) > MAX_WINDOW_MS) invalid('查询时间窗不得超过 31 天');
  let limit = 500;
  if (data.limit !== undefined) {
    if (typeof data.limit !== 'number' || !Number.isInteger(data.limit) || data.limit < 1 || data.limit > 5000) {
      invalid('limit 必须是 1–5000 的整数');
    }
    limit = data.limit;
  }
  return Object.freeze({
    limit,
    after: data.after === undefined || data.after === null ? null : decodeMetricCursor(data.after),
    kind: data.kind === undefined || data.kind === null ? null : metricKind(data.kind),
    from,
    to,
  });
}

export interface NormalizedSummaryQuery {
  readonly kind: MetricKind;
  readonly from: string;
  readonly to: string;
  readonly bucket: MetricBucket;
}
export function parseSummaryQuery(value: unknown): NormalizedSummaryQuery {
  const data = object(value);
  exact(data, ['kind', 'from', 'to', 'bucket']);
  const kind = metricKind(data.kind);
  if (data.from === undefined || data.to === undefined) invalid('聚合必须给出 from 与 to');
  const from = timestamp(data.from, 'from');
  const to = timestamp(data.to, 'to');
  if (Date.parse(from) > Date.parse(to)) invalid('from 不能晚于 to');
  if (Date.parse(to) - Date.parse(from) > MAX_WINDOW_MS) invalid('聚合时间窗不得超过 31 天');
  if (data.bucket !== undefined && data.bucket !== 'hour' && data.bucket !== 'day') invalid('bucket 仅支持 hour 或 day');
  return Object.freeze({ kind, from, to, bucket: (data.bucket ?? 'day') as MetricBucket });
}

type SampleRow = DatabaseRow & {
  id: string; kind: MetricKind; unit: MetricUnit; source: string;
  captured_at: Date; sealed_value: string;
};

const SELECT_SAMPLE = `SELECT id, kind, unit, source, captured_at, sealed_value FROM fitness_users.wearable_samples`;
const INSERT_SAMPLE = `INSERT INTO fitness_users.wearable_samples
  (tenant_id, id, user_id, kind, unit, source, captured_at, sealed_value)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
  ON CONFLICT ON CONSTRAINT wearable_sample_unique DO NOTHING
  RETURNING id`;

export class WearablesPlugin extends Service implements FitnessWearables {
  static provide = 'fitnessWearables';
  static inject = ['fitnessDatabase', 'fitnessUserDataProtection'];
  private closed = false;
  private readonly pending = new Set<Promise<unknown>>();

  constructor(ctx: Context) {
    super(ctx, 'fitnessWearables');
    ctx.effect(() => async () => { this.closed = true; await Promise.allSettled([...this.pending]); });
  }

  private run<T>(tenantId: string, action: (session: DatabaseSession) => Promise<T>): Promise<T> {
    if (this.closed) return Promise.reject(new FitnessError('CANCELLED', '可穿戴插件已卸载'));
    const operation = this.ctx.fitnessDatabase.transaction(async session => {
      await session.query("SELECT set_config('fitness.tenant_id', $1, true)", [tenantId]);
      const tenant = await session.query('SELECT id FROM fitness_users.tenants WHERE id=$1', [tenantId]);
      if (!tenant.rowCount) throw new FitnessError('TENANT_NOT_FOUND', '租户不存在或不可访问');
      return action(session);
    });
    // 跟踪在途事务：卸载时等待，避免插件卸载后仍有写操作落在已关闭的连接池上。
    this.pending.add(operation);
    void operation.then(() => this.pending.delete(operation), () => this.pending.delete(operation));
    return operation.catch((cause: unknown) => {
      throw cause instanceof FitnessError || cause instanceof DatabaseQueryError ? cause : cause;
    });
  }

  private context(owner: Owner, id: string): readonly string[] {
    // AAD 绑定租户、用户、行 id：整表被复制到别处也解不开。
    return Object.freeze(['wearable-value', owner.tenantId, owner.userId, id]);
  }

  private seal(owner: Owner, id: string, payload: SealedPayload): string {
    try {
      return this.ctx.fitnessUserDataProtection.seal(this.context(owner, id), JSON.stringify(payload));
    } catch (cause) {
      throw new FitnessError('DATA_PROTECTION_FAILED', '生理指标加密失败', { cause });
    }
  }

  private open(owner: Owner, id: string, sealed: string): SealedPayload {
    let plaintext: string;
    try {
      plaintext = this.ctx.fitnessUserDataProtection.open(this.context(owner, id), sealed);
    } catch (cause) {
      throw new FitnessError('DATA_PROTECTION_FAILED', '生理指标解密失败', { cause });
    }
    const data = object(JSON.parse(plaintext));
    return Object.freeze({
      v: number(data.v, 'sealed.v', -1e9, 1e9),
      ...(data.i === undefined ? {} : { i: number(data.i, 'sealed.i', 1, 1440) }),
    });
  }

  private toSample(owner: Owner, row: SampleRow): MetricSample {
    const payload = this.open(owner, row.id, row.sealed_value);
    return Object.freeze({
      id: row.id,
      kind: row.kind,
      unit: row.unit,
      value: payload.v,
      source: row.source,
      capturedAt: iso(row.captured_at),
      ...(payload.i === undefined ? {} : { intervalMinutes: payload.i }),
    });
  }

  async ingest(principal: AuthPrincipal, value: unknown): Promise<MetricIngestResult> {
    const owner = ownerOf(principal);
    const data = object(value);
    exact(data, ['schemaVersion', 'samples']);
    if (data.schemaVersion !== '1.0') invalid('schemaVersion 仅支持 1.0');
    if (!Array.isArray(data.samples) || !data.samples.length) invalid('samples 必须是非空数组');
    if (data.samples.length > MAX_BATCH) invalid(`单次最多写入 ${MAX_BATCH} 条样本`);
    // 先整批校验再写库：任一条不合法就整批回滚，客户端不必猜该重传哪几条。
    const samples = data.samples.map(sample);

    const ids = samples.map(() => randomUUID());
    const sealed = samples.map((item, index) => this.seal(owner, ids[index]!,
      item.intervalMinutes === null ? { v: item.value } : { v: item.value, i: item.intervalMinutes }));

    const acceptedIds = await this.run(owner.tenantId, async session => {
      const written: string[] = [];
      for (const [index, item] of samples.entries()) {
        const result = await session.query<{ id: string }>(INSERT_SAMPLE, [
          owner.tenantId, ids[index], owner.userId, item.kind, item.unit, item.source, item.capturedAt, sealed[index],
        ]);
        // 唯一约束命中时没有 RETURNING 行，即视为重复上报，不是错误。
        if (result.rowCount) written.push(ids[index]!);
      }
      return written;
    });

    return Object.freeze({
      schemaVersion: '1.0' as const,
      accepted: acceptedIds.length,
      duplicates: samples.length - acceptedIds.length,
      ids: Object.freeze(acceptedIds),
    });
  }

  async list(principal: AuthPrincipal, query: MetricQuery = {}): Promise<MetricPage> {
    const owner = ownerOf(principal);
    const normalized = parseMetricQuery(query);
    const rows = await this.run(owner.tenantId, async session => {
      const values: unknown[] = [owner.tenantId, owner.userId];
      // 租户由 RLS 兜底，用户必须显式收窄：策略是按 tenant_id 写的，不按 user_id。
      const conditions = ['tenant_id = $1', 'user_id = $2'];
      // 用字符串拼接而不是模板字面量：占位符里的 $ 必须实实在在写出来。
      const bind = (value: unknown) => { values.push(value); return "$" + String(values.length); };
      if (normalized.kind) conditions.push(`kind = ${bind(normalized.kind)}`);
      if (normalized.from) conditions.push(`captured_at >= ${bind(normalized.from)}::timestamptz`);
      if (normalized.to) conditions.push(`captured_at <= ${bind(normalized.to)}::timestamptz`);
      if (normalized.after) {
        conditions.push(`(captured_at, id) < (${bind(normalized.after.capturedAt)}::timestamptz, ${bind(normalized.after.id)}::uuid)`);
      }
      // 多取一条用于判断是否还有下一页，返回前裁掉。
      const limit = bind(normalized.limit + 1);
      return session.query<SampleRow>(
        `${SELECT_SAMPLE} WHERE ${conditions.join(' AND ')} ORDER BY captured_at DESC, id DESC LIMIT ${limit}`,
        values,
      );
    });

    const page = rows.rows.slice(0, normalized.limit);
    const last = page.at(-1);
    return Object.freeze({
      schemaVersion: '1.0' as const,
      items: Object.freeze(page.map(row => this.toSample(owner, row))),
      nextCursor: rows.rows.length > normalized.limit && last ? encodeMetricCursor(iso(last.captured_at), last.id) : null,
    });
  }

  async summary(principal: AuthPrincipal, query: MetricSummaryQuery): Promise<MetricSummary> {
    const owner = ownerOf(principal);
    const normalized = parseSummaryQuery(query);
    const rows = await this.run(owner.tenantId, async session => session.query<SampleRow>(
      `${SELECT_SAMPLE} WHERE tenant_id = $1 AND user_id = $2 AND kind = $3
        AND captured_at >= $4::timestamptz AND captured_at <= $5::timestamptz
        ORDER BY captured_at DESC LIMIT $6`,
      [owner.tenantId, owner.userId, normalized.kind, normalized.from, normalized.to, MAX_SUMMARY_SAMPLES + 1],
    ));
    if (rows.rows.length > MAX_SUMMARY_SAMPLES) {
      invalid(`该时间窗内 ${normalized.kind} 样本超过 ${MAX_SUMMARY_SAMPLES} 条，请缩小范围`);
    }

    const width = normalized.bucket === 'hour' ? HOUR_MS : DAY_MS;
    const buckets = new Map<number, number[]>();
    for (const row of rows.rows) {
      // 按 UTC 边界切桶；时区换算交给客户端，服务端不猜时区。
      const start = Math.floor(row.captured_at.getTime() / width) * width;
      const values = buckets.get(start);
      const payload = this.open(owner, row.id, row.sealed_value);
      if (values) values.push(payload.v);
      else buckets.set(start, [payload.v]);
    }

    const summaries: MetricBucketSummary[] = [...buckets.entries()]
      .sort((left, right) => left[0] - right[0])
      .map(([start, values]) => Object.freeze({
        bucketStart: new Date(start).toISOString(),
        count: values.length,
        min: Math.min(...values),
        max: Math.max(...values),
        average: values.reduce((sum, item) => sum + item, 0) / values.length,
      }));

    return Object.freeze({
      schemaVersion: '1.0' as const,
      kind: normalized.kind,
      unit: METRIC_UNIT[normalized.kind],
      bucket: normalized.bucket,
      buckets: Object.freeze(summaries),
    });
  }

  async remove(principal: AuthPrincipal, id: string): Promise<void> {
    const owner = ownerOf(principal);
    const sampleId = uuid(id);
    const removed = await this.run(owner.tenantId, async session => session.query(
      'DELETE FROM fitness_users.wearable_samples WHERE tenant_id = $1 AND user_id = $2 AND id = $3',
      [owner.tenantId, owner.userId, sampleId],
    ));
    // 不存在、属于别的租户或别的用户，一律同一个错误码，调用方无法据此探测。
    if (!removed.rowCount) throw new FitnessError('METRIC_NOT_FOUND', '生理样本不存在');
  }
}
