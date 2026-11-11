import type {} from 'cordis';
import type { AuthPrincipal } from './auth-contracts.ts';

/**
 * 可穿戴生理指标契约。
 *
 * 本期只做「摄入、查询、聚合、删除」。它**不参与评分**：`fitnessScoring` 不接受
 * 生理指标输入，规则评分里也不得偷偷读取这些数据。申报书里的多模态融合需要先有
 * 区间化的运动记录和验证方法，那是下一轮的事，不是这一层能凭空补上的。
 *
 * 所有调用都带 {@link AuthPrincipal}：租户与用户只来自已验证的会话行。数值本身
 * 加密落库（AAD 绑定租户、用户、行 id），明文列只保留种类、单位、来源、时间这些
 * 可索引坐标。因此库内不能做 `avg()`/`max()`，聚合在服务进程内解密后计算。
 */

export type MetricKind = 'heart-rate' | 'spo2' | 'steps' | 'cadence' | 'energy';
export type MetricUnit = 'bpm' | 'percent' | 'count' | 'spm' | 'kcal';

/** 种类与单位绑定，不接受 `{kind:'heart-rate', unit:'percent'}` 这类自由组合。 */
export const METRIC_UNIT: Readonly<Record<MetricKind, MetricUnit>> = Object.freeze({
  'heart-rate': 'bpm',
  'spo2': 'percent',
  'steps': 'count',
  'cadence': 'spm',
  'energy': 'kcal',
});

/** 闭区间；越界是 `METRIC_INVALID`，不静默裁剪成边界值。 */
export const METRIC_RANGE: Readonly<Record<MetricKind, { readonly min: number; readonly max: number }>> = Object.freeze({
  'heart-rate': Object.freeze({ min: 20, max: 250 }),
  'spo2': Object.freeze({ min: 50, max: 100 }),
  'steps': Object.freeze({ min: 0, max: 200_000 }),
  'cadence': Object.freeze({ min: 0, max: 300 }),
  'energy': Object.freeze({ min: 0, max: 20_000 }),
});

export const METRIC_KINDS: readonly MetricKind[] = Object.freeze(['heart-rate', 'spo2', 'steps', 'cadence', 'energy']);

/** 单条待写入样本。`id` 由服务端生成，调用方不能指定。 */
export interface MetricInput {
  readonly kind: MetricKind;
  readonly unit: MetricUnit;
  readonly value: number;
  /** 数据来源，如 `health-connect`、`ble-bracelet`；1–32 字符。 */
  readonly source: string;
  /** 必须带时区；无时区的本地时间无法判断对应哪个绝对时刻。 */
  readonly capturedAt: string;
  /** 仅 `steps` 使用：这条样本覆盖的分钟数，默认 1。 */
  readonly intervalMinutes?: number;
}

export interface MetricSample {
  readonly id: string;
  readonly kind: MetricKind;
  readonly unit: MetricUnit;
  /** 解密后的明文数值；只出现在响应里，不落库。 */
  readonly value: number;
  readonly source: string;
  readonly capturedAt: string;
  readonly intervalMinutes?: number;
}

export interface MetricIngestRequest {
  readonly schemaVersion: '1.0';
  /** 上限 500 条。整批一个事务，任一条不合法则整批回滚。 */
  readonly samples: readonly MetricInput[];
}

export interface MetricIngestResult {
  readonly schemaVersion: '1.0';
  readonly accepted: number;
  /** `ON CONFLICT` 命中的条数。重复上报是正常情况，不是错误。 */
  readonly duplicates: number;
  readonly ids: readonly string[];
}

export interface MetricQuery {
  readonly kind?: MetricKind;
  /** 含端点；必须带时区。时间窗上限 31 天。 */
  readonly from?: string;
  readonly to?: string;
  /** 1–5000，默认 500。 */
  readonly limit?: number;
  readonly after?: string;
}

export interface MetricPage {
  readonly schemaVersion: '1.0';
  readonly items: readonly MetricSample[];
  readonly nextCursor: string | null;
}

export type MetricBucket = 'hour' | 'day';

export interface MetricSummaryQuery {
  readonly kind: MetricKind;
  readonly from: string;
  readonly to: string;
  readonly bucket?: MetricBucket;
}

export interface MetricBucketSummary {
  /** UTC 桶起点，ISO 8601。客户端自己按本地时区展示，服务端不猜时区。 */
  readonly bucketStart: string;
  readonly count: number;
  readonly min: number;
  readonly max: number;
  readonly average: number;
}

export interface MetricSummary {
  readonly schemaVersion: '1.0';
  readonly kind: MetricKind;
  readonly unit: MetricUnit;
  readonly bucket: MetricBucket;
  readonly buckets: readonly MetricBucketSummary[];
}

export interface FitnessWearables {
  ingest(principal: AuthPrincipal, value: unknown): Promise<MetricIngestResult>;
  list(principal: AuthPrincipal, query?: MetricQuery): Promise<MetricPage>;
  summary(principal: AuthPrincipal, query: MetricSummaryQuery): Promise<MetricSummary>;
  /** 不存在或不属于该用户，一律 `METRIC_NOT_FOUND`，不区分两种情况。 */
  remove(principal: AuthPrincipal, id: string): Promise<void>;
}

declare module 'cordis' {
  interface Context {
    fitnessWearables: FitnessWearables;
  }
}
