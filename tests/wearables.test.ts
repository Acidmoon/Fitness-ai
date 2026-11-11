import assert from 'node:assert/strict';
import test from 'node:test';
import { FitnessError } from '../src/contracts.ts';
import {
  METRIC_RANGE, METRIC_UNIT, type MetricKind,
} from '../src/wearable-contracts.ts';
import {
  decodeMetricCursor, encodeMetricCursor, parseMetricQuery, parseSummaryQuery,
} from '../src/plugins/wearables.ts';

/**
 * 可穿戴面里不依赖数据库的部分：单位绑定、范围、时间窗、游标。
 * 真实库行为（RLS、去重、解密回读）由 tests/integration 覆盖。
 */

const code = (error: unknown): string => (error instanceof FitnessError ? error.code : 'NOT_A_FITNESS_ERROR');

test('every kind is bound to exactly one unit', async () => {
  const kinds: MetricKind[] = ['heart-rate', 'spo2', 'steps', 'cadence', 'energy'];
  for (const kind of kinds) {
    assert.ok(METRIC_UNIT[kind], `${kind} 缺少单位绑定`);
    assert.ok(METRIC_RANGE[kind].min < METRIC_RANGE[kind].max, `${kind} 范围无效`);
  }
  assert.deepEqual(Object.keys(METRIC_UNIT).sort(), [...kinds].sort());
});

test('summaries require an explicit kind and a bounded window', async () => {
  assert.throws(() => parseSummaryQuery({ from: '2026-11-01T00:00:00Z', to: '2026-11-02T00:00:00Z' }),
    (error: unknown) => code(error) === 'METRIC_INVALID');

  // 31 天窗是上限；31 天零 1 毫秒必须被拒绝，而不是静默截断。
  const start = Date.parse('2026-10-01T00:00:00Z');
  const over = new Date(start + 31 * 24 * 60 * 60 * 1000 + 1).toISOString();
  assert.throws(() => parseSummaryQuery({ kind: 'heart-rate', from: '2026-10-01T00:00:00Z', to: over }),
    (error: unknown) => code(error) === 'METRIC_INVALID');

  // 恰好 31 天是允许的边界值，与上面「多 1 毫秒即拒绝」成对，证明边界是有意画的。
  const exact = new Date(start + 31 * 24 * 60 * 60 * 1000).toISOString();
  const accepted = parseSummaryQuery({ kind: 'heart-rate', from: '2026-10-01T00:00:00Z', to: exact, bucket: 'hour' });
  assert.equal(accepted.bucket, 'hour');
  assert.equal(accepted.kind, 'heart-rate');
});

test('a bare local time is refused because it names no absolute moment', async () => {
  assert.throws(() => parseSummaryQuery({ kind: 'steps', from: '2026-11-01T10:00:00', to: '2026-11-02T10:00:00Z' }),
    (error: unknown) => code(error) === 'METRIC_INVALID');
  // 带偏移量是可接受的写法。
  const accepted = parseSummaryQuery({ kind: 'steps', from: '2026-11-01T10:00:00+08:00', to: '2026-11-02T10:00:00+08:00' });
  assert.equal(accepted.from, '2026-11-01T02:00:00.000Z');
});

test('list queries bound the page size and reject undeclared parameters', async () => {
  assert.equal(parseMetricQuery({}).limit, 500);
  assert.equal(parseMetricQuery({ limit: 1 }).limit, 1);
  assert.equal(parseMetricQuery({ limit: 5000 }).limit, 5000);
  for (const bad of [0, -1, 5001, 1.5]) {
    assert.throws(() => parseMetricQuery({ limit: bad }), (error: unknown) => code(error) === 'METRIC_INVALID');
  }
  assert.throws(() => parseMetricQuery({ tenantId: 'x' }), (error: unknown) => code(error) === 'METRIC_INVALID');
  assert.throws(() => parseMetricQuery({ kind: 'blood-glucose' }), (error: unknown) => code(error) === 'METRIC_INVALID');
});

test('metric cursors round-trip capture time and id and reject tampering', async () => {
  const capturedAt = '2026-11-12T00:00:00.000Z';
  const id = '11111111-1111-4111-8111-111111111111';
  const cursor = encodeMetricCursor(capturedAt, id);
  assert.deepEqual(decodeMetricCursor(cursor), { capturedAt, id });

  for (const bad of ['', 'not base64!', Buffer.from('missing-separator', 'utf8').toString('base64url')]) {
    assert.throws(() => decodeMetricCursor(bad), (error: unknown) => code(error) === 'METRIC_INVALID');
  }
  // 两段都必须是合法时间与 UUID，否则游标就是在传递未校验的输入。
  assert.throws(() => decodeMetricCursor(Buffer.from('yesterday|' + id, 'utf8').toString('base64url')),
    (error: unknown) => code(error) === 'METRIC_INVALID');
  assert.throws(() => decodeMetricCursor(Buffer.from(capturedAt + '|nope', 'utf8').toString('base64url')),
    (error: unknown) => code(error) === 'METRIC_INVALID');
});
