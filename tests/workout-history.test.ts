import assert from 'node:assert/strict';
import test from 'node:test';
import { FitnessError, type AdviceResult, type ScoreResult } from '../src/contracts.ts';
import type { WorkoutRecordInput } from '../src/history-contracts.ts';
import {
  decodeWorkoutCursor, encodeWorkoutCursor, parseWorkoutDetail, parseWorkoutInput, parseWorkoutQuery,
} from '../src/plugins/workout-history.ts';
import { userDatabasePlugins } from '../src/user-app.ts';

const POLICY = { id: 'demo-workout-scoring', version: '0.1.0', kind: 'heuristic' as const };
const SCORE: ScoreResult = {
  policy: POLICY,
  standard: { exerciseId: 'bodyweight-squat', sourceRevision: 'demo-standard@0.1.0' },
  total: 81.5,
  dimensions: [
    { key: 'completion', label: '可评估次数完成度', value: 0.8, weight: 0.5, points: 40 },
    { key: 'rangeOfMotion', label: '动作幅度', value: 0.9, weight: 0.2, points: 18 },
    { key: 'stability', label: '稳定性', value: 0.85, weight: 0.2, points: 17 },
    { key: 'tempo', label: '节奏', value: 0.65, weight: 0.1, points: 6.5 },
  ],
  quality: { observedRepetitions: 5, evaluatedRepetitions: 4, excludedRepetitions: 1 },
};
const ADVICE: AdviceResult = {
  policy: { id: 'demo-workout-advice', version: '0.1.0', kind: 'heuristic' },
  items: [{ code: 'improve-capture', message: '有 1 次记录因置信度不足被排除；请检查遮挡、机位和光照后重新采集。' }],
};
const INPUT: WorkoutRecordInput = {
  schemaVersion: '1.0', sessionId: 'assessment-2f6f5f5e', exercise: 'bodyweight-squat',
  targetRepetitions: 5, observedRepetitions: 5, score: SCORE, advice: ADVICE, source: 'video',
  capturedAt: '2026-10-29T03:20:00.000Z',
};
const hasCode = (code: string) => (error: unknown) => error instanceof FitnessError && error.code === code;
const recordId = '3f0b0cbc-5d31-4c36-9d2f-8a1f0a1b2c3d';

test('pagination cursors round-trip capture time and id and reject tampering', () => {
  const cursor = encodeWorkoutCursor('2026-10-29T03:20:00.000Z', recordId.toUpperCase());
  assert.match(cursor, /^[A-Za-z0-9_-]+$/);
  assert.deepEqual(decodeWorkoutCursor(cursor), { capturedAt: '2026-10-29T03:20:00.000Z', id: recordId });
  assert.notEqual(encodeWorkoutCursor('2026-10-29T03:20:00.001Z', recordId), cursor);
  const [capturedAt, idPart] = Buffer.from(cursor, 'base64url').toString('utf8').split('|') as [string, string];
  assert.equal(capturedAt, '2026-10-29T03:20:00.000Z');
  assert.equal(idPart, recordId);
  for (const malformed of [
    Buffer.from(`${capturedAt}|not-a-uuid`).toString('base64url'),
    Buffer.from(`2026-10-29|${recordId}`).toString('base64url'),
    Buffer.from(`${capturedAt}|${recordId}|extra`).toString('base64url'),
    Buffer.from('no-separator').toString('base64url'),
  ]) assert.throws(() => decodeWorkoutCursor(malformed), hasCode('WORKOUT_INVALID'));
  for (const value of ['', 'not a cursor', '____', cursor + '=', `${cursor}extra`, 42, null]) {
    assert.throws(() => decodeWorkoutCursor(value), hasCode('WORKOUT_INVALID'));
  }
  assert.throws(() => encodeWorkoutCursor('2026-10-29', recordId), hasCode('WORKOUT_INVALID'));
  assert.throws(() => encodeWorkoutCursor('2026-10-29T03:20:00.000Z', 'not-a-uuid'), hasCode('WORKOUT_INVALID'));
});

test('workout input validation rejects undeclared fields, bad enums, and unrepresentable totals', () => {
  const parsed = parseWorkoutInput(INPUT);
  assert.equal(parsed.sessionId, 'assessment-2f6f5f5e');
  assert.equal(parsed.exercise, 'bodyweight-squat');
  assert.equal(parsed.capturedAt, '2026-10-29T03:20:00.000Z');
  assert.equal(parsed.source, 'video');
  assert.equal(parsed.score.total, 81.5);
  assert.ok(Object.isFrozen(parsed));
  assert.deepEqual(parseWorkoutInput({ ...INPUT, capturedAt: undefined }).capturedAt, null);
  assert.deepEqual(parseWorkoutInput({ ...INPUT, exercise: '  bodyweight-squat  ' }).exercise, 'bodyweight-squat');
  const reject = (patch: Record<string, unknown>) => assert.throws(() => parseWorkoutInput({ ...INPUT, ...patch }), hasCode('WORKOUT_INVALID'));
  reject({ schemaVersion: '2.0' });
  reject({ tenantId: '3f0b0cbc-5d31-4c36-9d2f-8a1f0a1b2c3d' });
  reject({ userId: '3f0b0cbc-5d31-4c36-9d2f-8a1f0a1b2c3d' });
  reject({ source: 'sensor' });
  reject({ targetRepetitions: 0 });
  reject({ observedRepetitions: 10_001 });
  reject({ sessionId: '   ' });
  reject({ sessionId: 'a'.repeat(129) });
  reject({ exercise: '深蹲\n' });
  reject({ capturedAt: '2026-10-29 03:20:00' });
  reject({ capturedAt: 'yesterday' });
  reject({ score: { ...SCORE, total: 81.555 } });
  reject({ score: { ...SCORE, total: 101 } });
  reject({ score: { ...SCORE, dimensions: [] } });
  reject({ score: { ...SCORE, dimensions: [{ ...SCORE.dimensions[0], key: 'power' }] } });
  reject({ score: { ...SCORE, policy: { ...POLICY, kind: 'ml' } } });
  reject({ advice: { ...ADVICE, items: [{ code: 'Bad Code', message: 'x' }] } });
  reject({ advice: { ...ADVICE, items: [{ code: 'ok', message: '   ' }] } });
  reject({ advice: { ...ADVICE, items: [{ code: 'ok', message: 'x', extra: true }] } });
});

test('list queries default to a bounded page and reject raw offsets or bare timestamps', () => {
  const parsed = parseWorkoutQuery();
  assert.deepEqual(parsed, { limit: 20, after: null, exercise: null, from: null, to: null });
  const cursor = encodeWorkoutCursor('2026-10-29T03:20:00.000Z', recordId);
  const full = parseWorkoutQuery({ limit: 5, after: cursor, exercise: 'bodyweight-squat', from: '2026-10-01T00:00:00Z', to: '2026-10-31T23:59:59+08:00' });
  assert.equal(full.limit, 5);
  assert.deepEqual(full.after, { capturedAt: '2026-10-29T03:20:00.000Z', id: recordId });
  assert.equal(full.from, '2026-10-01T00:00:00.000Z');
  assert.equal(full.to, '2026-10-31T15:59:59.000Z');
  const reject = (value: Record<string, unknown>) => assert.throws(() => parseWorkoutQuery(value), hasCode('WORKOUT_INVALID'));
  reject({ limit: 0 });
  reject({ limit: 101 });
  reject({ limit: '20' });
  reject({ offset: 40 });
  reject({ after: '2026-10-29T03:20:00.000Z' });
  reject({ exercise: '' });
  reject({ from: '2026-10-01' });
  reject({ to: '2026/10/31' });
});

test('sealed detail keeps score dimensions and advice intact when parsed back', () => {
  const detail = parseWorkoutDetail({ schemaVersion: '1.0', score: SCORE, advice: ADVICE });
  assert.deepEqual(detail.score, SCORE);
  assert.deepEqual(detail.advice, ADVICE);
  assert.ok(Object.isFrozen(detail.score.dimensions));
  assert.ok(Object.isFrozen(detail.advice.items));
  assert.equal('standard' in parseWorkoutDetail({ schemaVersion: '1.0', score: { ...SCORE, standard: undefined }, advice: ADVICE }).score, false);
  for (const value of [null, [], {}, { schemaVersion: '1.0' }, { schemaVersion: '1.0', score: SCORE }, { ...SCORE, advice: ADVICE }]) {
    assert.throws(() => parseWorkoutDetail(value), hasCode('WORKOUT_INVALID'));
  }
  assert.throws(() => parseWorkoutDetail({ schemaVersion: '1.0', score: { ...SCORE, total: '81.5' }, advice: ADVICE }), hasCode('WORKOUT_INVALID'));
});

test('the user database app manifest provides every service its plugins inject', () => {
  // A plugin that is written and tested but never mounted leaves conditional
  // consumers (e.g. the workout HTTP routes) silently inactive. This assertion
  // makes that wiring gap fail here instead of at runtime.
  const entries = userDatabasePlugins as unknown as readonly { readonly provide?: string; readonly inject?: readonly string[] }[];
  const providers = new Map<string, unknown>();
  for (const entry of entries) {
    const provide = entry.provide;
    assert.equal(typeof provide, 'string', '应用清单中的插件必须声明 provide');
    assert.ok(provide);
    assert.equal(providers.has(provide), false, `应用清单重复提供服务 ${provide}`);
    providers.set(provide, entry);
  }
  assert.ok(providers.has('fitnessWorkoutHistory'), 'userDatabasePlugins 必须装载运动历史插件');
  for (const entry of entries) {
    for (const dependency of entry.inject ?? []) {
      assert.ok(providers.has(dependency), `${entry.provide} 依赖的 ${dependency} 不在应用清单中`);
    }
  }
});
