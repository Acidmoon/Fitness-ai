import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { FitnessError, type WorkoutSession } from '../src/contracts.ts';
import type { ExerciseGoalResult, ExerciseQuery } from '../src/exercise-contracts.ts';
import { createRuntime, mountPlugins } from '../src/runtime.ts';
import { ExerciseLibraryPlugin } from '../src/plugins/exercise-library.ts';
import { RuleScoringPlugin } from '../src/plugins/rule-scoring.ts';
import { WorkoutInputPlugin } from '../src/plugins/workout-input.ts';

const hasCode = (code: string) => (error: unknown) => error instanceof FitnessError && error.code === code;
const goal = {
  schemaVersion: '1.0', sessionId: 'goal-test', exerciseId: 'Alternate_Incline_Dumbbell_Curl',
  unit: 'repetitions', target: 10, observed: 8, confidence: 1, observationSource: 'manual',
};
const workout: WorkoutSession = {
  schemaVersion: '1.0', sessionId: 'quality-test', exercise: 'squat', targetRepetitions: 1,
  repetitions: [{ rangeOfMotion: 1, stability: 1, confidence: 1, durationMs: 3000 }],
};

async function library() {
  const ctx = createRuntime();
  await mountPlugins(ctx, [ExerciseLibraryPlugin]);
  return ctx;
}

test('all pinned source records are discoverable without dropping incomplete entries', async () => {
  const ctx = await library();
  try {
    const manifest = ctx.fitnessExercises.manifest();
    const bytes = await readFile(new URL('../src/data/free-exercise-db/exercises.json', import.meta.url));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), manifest.source.sha256);
    const source = JSON.parse(bytes.toString('utf8')) as { id: string; instructions: string[] }[];
    assert.equal(manifest.counts.exercises, 876);
    assert.equal(manifest.counts.goalScoring, 876);
    assert.equal(manifest.counts.heuristicTechnique, 2);
    assert.equal(manifest.counts.calibratedTechnique, 0);
    assert.equal(manifest.counts.missingInstructions, 5);
    assert.equal(manifest.counts.partialInstructions, 2);
    assert.equal(ctx.fitnessExercises.get('Clean').instructionStatus, 'partial');
    assert.equal(manifest.source.authority, 'community-catalog');
    assert.equal(manifest.source.includesQualityAnnotations, false);
    assert.equal(manifest.source.includesMediaFiles, false);
    const ids: string[] = [];
    for (let offset = 0; offset < source.length; offset += 100) {
      const page = ctx.fitnessExercises.list({ offset, limit: 100 });
      assert.equal(page.total, source.length);
      ids.push(...page.items.map(item => item.id));
    }
    assert.deepEqual(ids, source.map(item => item.id));
    for (const raw of source) {
      const definition = ctx.fitnessExercises.get(raw.id);
      const standard = ctx.fitnessExercises.getStandard(raw.id);
      assert.deepEqual(definition.instructions, raw.instructions);
      assert.deepEqual(standard.referenceInstructions, raw.instructions);
      assert.equal(standard.exerciseId, raw.id);
      assert.equal(standard.completion.measuresTechnique, false);
      assert.equal(standard.completion.targetSource, 'caller');
      assert.equal(standard.technique.status, ['Bodyweight_Squat', 'Pushups'].includes(raw.id) ? 'heuristic' : 'unavailable');
      assert.equal(ctx.fitnessExercises.scoreGoal({ ...goal, exerciseId: raw.id }).total, 80);
    }
    assert.equal(ctx.fitnessExercises.get('Iron_Cross').instructionStatus, 'missing');
    assert.deepEqual(ctx.fitnessExercises.get('Iron_Cross').instructions, []);
  } finally { await ctx.fiber.dispose(); }
});

test('stable aliases resolve exact exercise variants and returned data is immutable', async () => {
  const ctx = await library();
  try {
    const squat = ctx.fitnessExercises.get('squat');
    assert.equal(squat.id, 'Bodyweight_Squat');
    assert.equal(ctx.fitnessExercises.get(' 深蹲 '), squat);
    assert.equal(ctx.fitnessExercises.get('BODYWEIGHT_SQUAT'), squat);
    assert.equal(ctx.fitnessExercises.get('push-up').id, 'Pushups');
    const standard = ctx.fitnessExercises.getStandard('squat');
    assert.equal(standard.technique.status, 'heuristic');
    if (standard.technique.status === 'heuristic') {
      assert.equal(standard.technique.validation, 'uncalibrated');
      assert.equal(standard.technique.policy.id, 'demo-squat-score');
      assert.throws(() => { (standard.technique as { weights: { tempo: number } }).weights.tempo = 99; }, TypeError);
    }
    assert.throws(() => { (squat.instructions as string[]).push('changed'); }, TypeError);
    assert.throws(() => { (ctx.fitnessExercises.manifest().source.categoryCounts as { strength: number }).strength = 0; }, TypeError);
    assert.equal(ctx.fitnessExercises.getStandard('Barbell_Full_Squat').technique.status, 'unavailable');
    assert.throws(() => ctx.fitnessExercises.get('not-an-exercise'), hasCode('UNSUPPORTED_EXERCISE'));
  } finally { await ctx.fiber.dispose(); }
});

test('catalog filters combine and pagination preserves a stable source order', async () => {
  const ctx = await library();
  try {
    const filtered = ctx.fitnessExercises.list({ category: 'strength', equipment: 'body only', muscle: 'quadriceps' });
    assert.ok(filtered.total > 0);
    assert.ok(filtered.items.every(item => item.category === 'strength' && item.equipment === 'body only' &&
      [...item.primaryMuscles, ...item.secondaryMuscles].includes('quadriceps')));
    assert.equal(ctx.fitnessExercises.list({ query: '俯卧撑' }).items[0]?.id, 'Pushups');
    assert.equal(ctx.fitnessExercises.list({ technique: 'heuristic' }).total, 2);
    assert.equal(ctx.fitnessExercises.list({ category: 'cardio' }).total, 14);
    assert.equal(ctx.fitnessExercises.list({ equipment: null }).items.every(item => item.equipment === null), true);
    assert.deepEqual(ctx.fitnessExercises.list({ offset: 876 }).items, []);
    for (const invalid of [{ limit: 101 }, { limit: null }, { offset: -1 }, { limit: 1.5 }, { category: 'invented' }, { muscle: 'heart' }, { extra: true }]) {
      assert.throws(() => ctx.fitnessExercises.list(invalid as ExerciseQuery), hasCode('INVALID_EXERCISE_DATA'));
    }
  } finally { await ctx.fiber.dispose(); }
});

test('goal scores measure only caller targets with units, provenance, and result events', async () => {
  const ctx = await library();
  const received: ExerciseGoalResult[] = [];
  try {
    ctx.on('fitness/exercise-goal-scored', result => { received.push(result); });
    const result = ctx.fitnessExercises.scoreGoal(goal);
    assert.equal(result.total, 80);
    assert.equal(result.scoreKind, 'goal-completion');
    assert.equal(result.techniqueScore, null);
    assert.equal(result.observationSource, 'manual');
    assert.equal(result.sourceRevision, ctx.fitnessExercises.manifest().source.revision);
    assert.equal(received[0], result);
    assert.equal(ctx.fitnessExercises.scoreGoal({ ...goal, observed: 0 }).total, 0);
    assert.equal(ctx.fitnessExercises.scoreGoal({ ...goal, observed: 20 }).total, 100);
    assert.equal(ctx.fitnessExercises.scoreGoal({ ...goal, unit: 'seconds', target: 30, observed: 15.5 }).total, 51.67);
    assert.equal(ctx.fitnessExercises.scoreGoal({ ...goal, unit: 'meters', target: 1000, observed: 800 }).total, 80);
    assert.equal(ctx.fitnessExercises.scoreGoal({ ...goal, exerciseId: 'squat', confidence: 0.6 }).exerciseId, 'Bodyweight_Squat');
    assert.ok(Object.isFrozen(result));
    assert.ok(Object.isFrozen(result.policy.units));
  } finally { await ctx.fiber.dispose(); }
});

test('invalid observations and low confidence never emit fabricated scores', async () => {
  const ctx = await library();
  let count = 0;
  try {
    ctx.on('fitness/exercise-goal-scored', () => { count++; });
    for (const invalid of [null, {}, { ...goal, target: 0 }, { ...goal, observed: -1 }, { ...goal, target: NaN },
      { ...goal, observed: Infinity }, { ...goal, observed: 1.5 }, { ...goal, confidence: 1.1 },
      { ...goal, unit: 'kg' }, { ...goal, observationSource: 'guessed' }, { ...goal, schemaVersion: '2.0' },
      { ...goal, qualityScore: 100 }, { ...goal, sessionId: ' ' }]) {
      assert.throws(() => ctx.fitnessExercises.scoreGoal(invalid), hasCode('INVALID_EXERCISE_DATA'));
    }
    assert.throws(() => ctx.fitnessExercises.scoreGoal({ ...goal, confidence: 0.59 }), hasCode('INSUFFICIENT_DATA'));
    assert.throws(() => ctx.fitnessExercises.scoreGoal({ ...goal, exerciseId: 'unlisted' }), hasCode('UNSUPPORTED_EXERCISE'));
    assert.equal(count, 0);
  } finally { await ctx.fiber.dispose(); }
});

test('quality scoring consumes catalog standards, rejects uncalibrated variants, and reconnects after provider replacement', async () => {
  const ctx = createRuntime();
  try {
    const [scoring, , catalog] = await mountPlugins(ctx, [RuleScoringPlugin, WorkoutInputPlugin, ExerciseLibraryPlugin]);
    assert.ok(scoring && catalog);
    assert.equal(ctx.fitnessScoring.score(workout).total, 100);
    assert.equal(ctx.fitnessScoring.score({ ...workout, exercise: 'Bodyweight_Squat' }).total, 100);
    assert.throws(() => ctx.fitnessScoring.score({ ...workout, exercise: 'Barbell_Full_Squat' }), hasCode('STANDARD_UNAVAILABLE'));
    assert.throws(() => ctx.fitnessScoring.score({ ...workout, targetRepetitions: 0 }), hasCode('INVALID_WORKOUT'));
    await catalog.dispose();
    await scoring.await();
    assert.equal(Boolean(ctx.fitnessScoring), false);
    await ctx.plugin(ExerciseLibraryPlugin);
    await scoring.await();
    assert.equal(ctx.fitnessScoring.score(workout).total, 100);
  } finally { await ctx.fiber.dispose(); }
  assert.equal(ctx.registry.size, 0);
});
