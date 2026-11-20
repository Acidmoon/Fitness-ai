import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { Service, type Context } from 'cordis';
import { FitnessError, type AssessmentResult, type FitnessScoring, type ScoreResult, type WorkoutSession } from '../src/contracts.ts';
import { createRuntime, mountPlugins } from '../src/runtime.ts';
import { AssessmentPlugin } from '../src/plugins/assessment.ts';
import { RuleAdvicePlugin } from '../src/plugins/rule-advice.ts';
import { ExerciseLibraryPlugin } from '../src/plugins/exercise-library.ts';
import { RuleScoringPlugin } from '../src/plugins/rule-scoring.ts';
import { WorkoutInputPlugin } from '../src/plugins/workout-input.ts';
import * as JsonReportPlugin from '../src/plugins/json-report.ts';

const sample: unknown = JSON.parse(await readFile(new URL('../examples/squat-session.json', import.meta.url), 'utf8'));
const assessmentPlugins = [AssessmentPlugin, RuleAdvicePlugin, RuleScoringPlugin, WorkoutInputPlugin, ExerciseLibraryPlugin];

function session(overrides: Partial<WorkoutSession> = {}): WorkoutSession {
  return {
    schemaVersion: '1.0', sessionId: 'test-session', exercise: 'squat', targetRepetitions: 1,
    repetitions: [{ rangeOfMotion: 1, stability: 1, durationMs: 3000, confidence: 1 }],
    ...overrides,
  };
}

function hasCode(code: string) {
  return (error: unknown) => error instanceof FitnessError && error.code === code;
}

test('consumer-first loading produces an explainable report and a completion event', async () => {
  const ctx = createRuntime();
  const output: string[] = [];
  const received: AssessmentResult[] = [];
  try {
    await ctx.plugin(JsonReportPlugin, { write: text => { output.push(text); } });
    ctx.on('fitness/assessment-completed', result => { received.push(result); });
    await mountPlugins(ctx, assessmentPlugins);
    const result = ctx.fitnessAssessment.evaluate(sample);
    assert.equal(result.sessionId, 'demo-squat-001');
    assert.equal(result.score.total, 78.81);
    assert.deepEqual(result.score.dimensions.map(item => item.points), [16, 30, 18.75, 14.06]);
    assert.deepEqual(result.score.quality, {
      observedRepetitions: 5, evaluatedRepetitions: 4, excludedRepetitions: 1,
    });
    assert.deepEqual(result.advice.items.map(item => item.code), [
      'improve-capture', 'check-completion', 'improve-range', 'improve-stability',
    ]);
    assert.equal(received[0], result);
    assert.equal(output.length, 1);
    assert.deepEqual(JSON.parse(output[0]!), result);
    assert.ok(Object.isFrozen(result));
    assert.ok(Object.isFrozen(result.score.dimensions));
  } finally {
    await ctx.fiber.dispose();
  }
  assert.equal(ctx.registry.size, 0);
});

test('a full-quality session receives 100 and does not affect the next session', async () => {
  const ctx = createRuntime();
  try {
    await mountPlugins(ctx, assessmentPlugins);
    const first = ctx.fitnessAssessment.evaluate(session());
    assert.equal(first.score.total, 100);
    assert.deepEqual(first.advice.items.map(item => item.code), ['maintain']);
    const second = ctx.fitnessAssessment.evaluate(session({ sessionId: 'second', targetRepetitions: 2 }));
    assert.equal(second.score.total, 90);
    assert.equal(second.sessionId, 'second');
    assert.equal(first.score.total, 100);
  } finally {
    await ctx.fiber.dispose();
  }
});

test('extra repetitions cannot increase the score above 100', async () => {
  const ctx = createRuntime();
  try {
    await mountPlugins(ctx, assessmentPlugins);
    const rep = session().repetitions[0]!;
    assert.equal(ctx.fitnessAssessment.evaluate(session({ repetitions: [rep, rep] })).score.total, 100);
  } finally {
    await ctx.fiber.dispose();
  }
});

test('low-quality observations fail without emitting a misleading result', async () => {
  const ctx = createRuntime();
  let events = 0;
  try {
    await mountPlugins(ctx, assessmentPlugins);
    ctx.on('fitness/assessment-completed', () => { events++; });
    const rep = { ...session().repetitions[0]!, confidence: 0.59 };
    assert.throws(() => ctx.fitnessAssessment.evaluate(session({ repetitions: [rep] })), hasCode('INSUFFICIENT_DATA'));
    assert.equal(events, 0);
    const boundary = ctx.fitnessAssessment.evaluate(session({ repetitions: [{ ...rep, confidence: 0.6 }] }));
    assert.equal(boundary.score.quality.evaluatedRepetitions, 1);
    assert.equal(events, 1);
  } finally {
    await ctx.fiber.dispose();
  }
});

test('unsupported exercises are rejected by the scoring provider', async () => {
  const ctx = createRuntime();
  try {
    await mountPlugins(ctx, assessmentPlugins);
    assert.throws(() => ctx.fitnessAssessment.evaluate(session({ exercise: 'jumping-jack' })), hasCode('UNSUPPORTED_EXERCISE'));
  } finally {
    await ctx.fiber.dispose();
  }
});

class ReplacementScoringPlugin extends Service implements FitnessScoring {
  static provide = 'fitnessScoring';
  constructor(ctx: Context) {
    super(ctx, 'fitnessScoring');
  }
  score(value: WorkoutSession): ScoreResult {
    return {
      policy: { id: 'replacement', version: '1.0.0', kind: 'heuristic' }, total: 42, dimensions: [],
      quality: { observedRepetitions: value.repetitions.length, evaluatedRepetitions: value.repetitions.length, excludedRepetitions: 0 },
    };
  }
}

test('removing and replacing a provider deactivates and reconnects the consumer', { timeout: 5000 }, async () => {
  const ctx = createRuntime();
  try {
    const [assessment, , scoring] = await mountPlugins(ctx, assessmentPlugins);
    assert.ok(assessment && scoring);
    assert.equal(ctx.fitnessAssessment.evaluate(session()).score.total, 100);
    await scoring.dispose();
    await assessment.await();
    assert.equal(ctx.fitnessScoring, undefined);
    assert.equal(Boolean(ctx.fitnessAssessment), false);
    await ctx.plugin(ReplacementScoringPlugin);
    await assessment.await();
    const result = ctx.fitnessAssessment.evaluate(session());
    assert.equal(result.score.total, 42);
    assert.equal(result.score.policy.id, 'replacement');
  } finally {
    await ctx.fiber.dispose();
  }
});

test('report listeners are removed on unload and are not duplicated on remount', async () => {
  const ctx = createRuntime();
  const output: string[] = [];
  const config = { write: (text: string) => { output.push(text); } };
  try {
    await mountPlugins(ctx, assessmentPlugins);
    const reporter = await ctx.plugin(JsonReportPlugin, config);
    ctx.fitnessAssessment.evaluate(session());
    await reporter.dispose();
    ctx.fitnessAssessment.evaluate(session());
    assert.equal(output.length, 1);
    await ctx.plugin(JsonReportPlugin, config);
    ctx.fitnessAssessment.evaluate(session());
    assert.equal(output.length, 2);
  } finally {
    await ctx.fiber.dispose();
  }
});

test('startup reports missing dependencies instead of treating a pending plugin as active', async () => {
  const ctx = createRuntime();
  try {
    await assert.rejects(mountPlugins(ctx, [AssessmentPlugin]), /插件未激活/);
    assert.equal(ctx.fitnessAssessment, undefined);
  } finally {
    await ctx.fiber.dispose();
  }
});

test('hold exercises score targetRepetitions in seconds and emit hold-specific coaching advice', async () => {
  const ctx = createRuntime();
  try {
    await mountPlugins(ctx, assessmentPlugins);
    // Plank: 15s hold against 30s target -> completion = 0.5, tempo = 15000/20000 = 0.75.
    const plankPartial = ctx.fitnessAssessment.evaluate(session({
      exercise: 'plank', targetRepetitions: 30,
      repetitions: [{ rangeOfMotion: 0.7, stability: 0.7, durationMs: 15_000, confidence: 0.9 }],
    }));
    assert.equal(plankPartial.score.policy.id, 'demo-plank-score');
    assert.equal(plankPartial.score.dimensions.find(d => d.key === 'completion')?.value, 0.5);
    assert.equal(plankPartial.score.dimensions.find(d => d.key === 'completion')?.label, '支撑时长完成度');
    assert.equal(plankPartial.score.dimensions.find(d => d.key === 'tempo')?.value, 0.75);
    assert.deepEqual(plankPartial.advice.items.map(item => item.code), [
      'check-completion', 'improve-range', 'improve-stability', 'adjust-tempo',
    ]);
    assert.match(plankPartial.advice.items.find(item => item.code === 'check-completion')!.message, /目标秒数/);
    assert.match(plankPartial.advice.items.find(item => item.code === 'improve-range')!.message, /平板支撑/);
    assert.match(plankPartial.advice.items.find(item => item.code === 'adjust-tempo')!.message, /20–600/);

    // Long plank hold up to 300s (5 minutes) passes WorkoutInputPlugin and reaches 100.
    const plankFull = ctx.fitnessAssessment.evaluate(session({
      exercise: 'plank', targetRepetitions: 60,
      repetitions: [{ rangeOfMotion: 1, stability: 1, durationMs: 300_000, confidence: 0.95 }],
    }));
    assert.equal(plankFull.score.total, 100);
    assert.deepEqual(plankFull.advice.items.map(item => item.code), ['maintain']);

    // Balance: two 10s holds sum to 20s against 20s target -> completion = 1.0, total = 100.
    const balanceFull = ctx.fitnessAssessment.evaluate(session({
      exercise: 'balance', targetRepetitions: 20,
      repetitions: [
        { rangeOfMotion: 1, stability: 1, durationMs: 10_000, confidence: 0.9 },
        { rangeOfMotion: 1, stability: 1, durationMs: 10_000, confidence: 0.9 },
      ],
    }));
    assert.equal(balanceFull.score.policy.id, 'demo-balance-score');
    assert.equal(balanceFull.score.total, 100);
    assert.equal(balanceFull.score.dimensions.find(d => d.key === 'completion')?.label, '平衡时长完成度');
  } finally {
    await ctx.fiber.dispose();
  }
});

test('all 6 repetition and reach exercises score with tailored weights, tempo windows, and advice', async () => {
  const ctx = createRuntime();
  try {
    await mountPlugins(ctx, assessmentPlugins);
    for (const [exercise, durationMs] of [
      ['squat', 3_000], ['push-up', 3_000], ['crunch', 2_500],
      ['sit-up', 3_000], ['jump-rope', 700], ['sit-and-reach', 3_000],
    ] as const) {
      const perfect = ctx.fitnessAssessment.evaluate(session({
        exercise, targetRepetitions: 1,
        repetitions: [{ rangeOfMotion: 1, stability: 1, durationMs, confidence: 0.9 }],
      }));
      assert.equal(perfect.score.policy.id, `demo-${exercise}-score`);
      assert.equal(perfect.score.total, 100, `expected 100 for ${exercise}`);
    }

    const reachLow = ctx.fitnessAssessment.evaluate(session({
      exercise: 'sit-and-reach', targetRepetitions: 2,
      repetitions: [{ rangeOfMotion: 0.6, stability: 0.6, durationMs: 1_500, confidence: 0.9 }],
    }));
    assert.equal(reachLow.score.standard?.exerciseId, 'Sit_And_Reach');
    assert.equal(reachLow.score.dimensions.find(d => d.key === 'rangeOfMotion')?.label, '前屈幅度');
    assert.match(reachLow.advice.items.find(item => item.code === 'improve-range')!.message, /坐位体前屈|前屈/);
    assert.match(reachLow.advice.items.find(item => item.code === 'adjust-tempo')!.message, /2–15/);

    const ropeSlow = ctx.fitnessAssessment.evaluate(session({
      exercise: 'jump-rope', targetRepetitions: 1,
      repetitions: [{ rangeOfMotion: 0.6, stability: 0.6, durationMs: 2_000, confidence: 0.9 }],
    }));
    assert.match(ropeSlow.advice.items.find(item => item.code === 'adjust-tempo')!.message, /0\.4–1\.2/);
  } finally {
    await ctx.fiber.dispose();
  }
});
