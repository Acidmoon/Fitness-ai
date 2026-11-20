import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { FitnessError, type WorkoutSession } from '../src/contracts.ts';
import {
  EXERCISE_CATEGORY_LABELS, EXERCISE_EQUIPMENT_LABELS, EXERCISE_FORCE_LABELS,
  EXERCISE_LEVEL_LABELS, EXERCISE_MECHANIC_LABELS, EXERCISE_MUSCLE_LABELS,
  type ExerciseGoalResult, type ExerciseQuery,
} from '../src/exercise-contracts.ts';
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
    assert.equal(manifest.source.exerciseCount, 876);
    assert.equal(manifest.counts.exercises, 878);
    assert.equal(manifest.counts.projectDefined, 2);
    assert.equal(manifest.counts.goalScoring, 878);
    assert.equal(manifest.counts.heuristicTechnique, 8);
    assert.equal(manifest.counts.calibratedTechnique, 0);
    assert.equal(manifest.counts.missingInstructions, 5);
    assert.equal(manifest.counts.partialInstructions, 2);
    assert.equal(ctx.fitnessExercises.get('Clean').instructionStatus, 'partial');
    assert.equal(manifest.source.authority, 'community-catalog');
    assert.equal(manifest.source.includesQualityAnnotations, false);
    assert.equal(manifest.source.includesMediaFiles, false);
    const ids: string[] = [];
    for (let offset = 0; offset < manifest.counts.exercises; offset += 100) {
      const page = ctx.fitnessExercises.list({ offset, limit: 100 });
      assert.equal(page.total, manifest.counts.exercises);
      ids.push(...page.items.map(item => item.id));
    }
    assert.deepEqual(ids, [...source.map(item => item.id), 'Sit_And_Reach', 'Single_Leg_Balance']);
    const upstreamHeuristic = ['Bodyweight_Squat', 'Pushups', 'Crunches', 'Sit-Up', 'Plank', 'Rope_Jumping'];
    for (const raw of source) {
      const definition = ctx.fitnessExercises.get(raw.id);
      const standard = ctx.fitnessExercises.getStandard(raw.id);
      assert.equal(definition.origin, 'free-exercise-db');
      assert.deepEqual(definition.instructions, raw.instructions);
      assert.deepEqual(standard.referenceInstructions, raw.instructions);
      assert.equal(standard.exerciseId, raw.id);
      assert.equal(standard.completion.measuresTechnique, false);
      assert.equal(standard.completion.targetSource, 'caller');
      assert.equal(standard.technique.status, upstreamHeuristic.includes(raw.id) ? 'heuristic' : 'unavailable');
      assert.equal(ctx.fitnessExercises.scoreGoal({ ...goal, exerciseId: raw.id }).total, 80);
    }
    for (const projectId of ['Sit_And_Reach', 'Single_Leg_Balance']) {
      const definition = ctx.fitnessExercises.get(projectId);
      const standard = ctx.fitnessExercises.getStandard(projectId);
      assert.equal(definition.origin, 'project');
      assert.equal(standard.technique.status, 'heuristic');
      assert.equal(ctx.fitnessExercises.scoreGoal({ ...goal, exerciseId: projectId }).total, 80);
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
    assert.equal(ctx.fitnessExercises.get('卷腹').id, 'Crunches');
    assert.equal(ctx.fitnessExercises.get('仰卧起坐').id, 'Sit-Up');
    assert.equal(ctx.fitnessExercises.get('平板支撑').id, 'Plank');
    assert.equal(ctx.fitnessExercises.get('跳绳').id, 'Rope_Jumping');
    assert.equal(ctx.fitnessExercises.get('坐位体前屈').id, 'Sit_And_Reach');
    assert.equal(ctx.fitnessExercises.get('单脚站立平衡测试').id, 'Single_Leg_Balance');
    const standard = ctx.fitnessExercises.getStandard('squat');
    assert.equal(standard.technique.status, 'heuristic');
    if (standard.technique.status === 'heuristic') {
      assert.equal(standard.technique.validation, 'uncalibrated');
      assert.equal(standard.technique.policy.id, 'demo-squat-score');
      assert.equal(standard.technique.measurementMode, 'cycle');
      assert.equal(standard.technique.targetUnit, 'repetitions');
      assert.throws(() => { (standard.technique as { weights: { tempo: number } }).weights.tempo = 99; }, TypeError);
    }
    const plankStandard = ctx.fitnessExercises.getStandard('plank');
    assert.equal(plankStandard.technique.status, 'heuristic');
    if (plankStandard.technique.status === 'heuristic') {
      assert.equal(plankStandard.technique.measurementMode, 'hold');
      assert.equal(plankStandard.technique.targetUnit, 'seconds');
    }
    const balanceStandard = ctx.fitnessExercises.getStandard('balance');
    assert.equal(balanceStandard.technique.status, 'heuristic');
    if (balanceStandard.technique.status === 'heuristic') {
      assert.equal(balanceStandard.technique.measurementMode, 'hold');
      assert.equal(balanceStandard.technique.targetUnit, 'seconds');
      assert.equal(balanceStandard.technique.motionExercise, 'balance');
    }
    const reachStandard = ctx.fitnessExercises.getStandard('sit-and-reach');
    assert.equal(reachStandard.technique.status, 'heuristic');
    if (reachStandard.technique.status === 'heuristic') {
      assert.equal(reachStandard.technique.measurementMode, 'reach');
      assert.equal(reachStandard.technique.targetUnit, 'repetitions');
      assert.equal(reachStandard.technique.motionExercise, 'sit-and-reach');
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
    assert.equal(ctx.fitnessExercises.list({ technique: 'heuristic' }).total, 8);
    assert.equal(ctx.fitnessExercises.list({ category: 'cardio' }).total, 14);
    assert.equal(ctx.fitnessExercises.list({ equipment: null }).items.every(item => item.equipment === null), true);
    assert.deepEqual(ctx.fitnessExercises.list({ offset: 878 }).items, []);
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

test('all 878 exercises expose complete frozen Chinese localization with unchanged upstream sha256', async () => {
  const ctx = await library();
  try {
    const manifest = ctx.fitnessExercises.manifest();
    const bytes = await readFile(new URL('../src/data/free-exercise-db/exercises.json', import.meta.url));
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    assert.equal(sha256, '5bb747e3fc658f095a60dcbf6d53c96627acdcc6ffb6fffde86f7e26995d40bf');
    assert.equal(sha256, manifest.source.sha256);

    const hasCjk = /[\u4e00-\u9fff]/;
    const latinWord = /[A-Za-z]{2,}/;
    let count = 0;

    for (let offset = 0; offset < manifest.counts.exercises; offset += 100) {
      const page = ctx.fitnessExercises.list({ offset, limit: 100 });
      for (const item of page.items) {
        count++;
        assert.ok(item.nameZh.trim().length > 0, `${item.id}: empty nameZh`);
        assert.match(item.nameZh, hasCjk, `${item.id}: nameZh missing Chinese: ${item.nameZh}`);
        assert.doesNotMatch(item.nameZh, latinWord, `${item.id}: nameZh has English word: ${item.nameZh}`);
        assert.notEqual(item.nameZh, item.name, `${item.id}: nameZh unchanged from English`);

        assert.equal(item.categoryLabel, EXERCISE_CATEGORY_LABELS[item.category]);
        assert.equal(item.levelLabel, EXERCISE_LEVEL_LABELS[item.level]);
        assert.equal(item.equipmentLabel, item.equipment === null ? null : EXERCISE_EQUIPMENT_LABELS[item.equipment]);
        assert.equal(item.forceLabel, item.force === null ? null : EXERCISE_FORCE_LABELS[item.force]);
        assert.equal(item.mechanicLabel, item.mechanic === null ? null : EXERCISE_MECHANIC_LABELS[item.mechanic]);
        assert.deepEqual(item.primaryMusclesZh, item.primaryMuscles.map(m => EXERCISE_MUSCLE_LABELS[m]));
        assert.deepEqual(item.secondaryMusclesZh, item.secondaryMuscles.map(m => EXERCISE_MUSCLE_LABELS[m]));
        assert.ok(Object.isFrozen(item.primaryMusclesZh));
        assert.ok(Object.isFrozen(item.secondaryMusclesZh));
        assert.ok(Object.isFrozen(item.instructionsZh));

        assert.equal(item.instructionsZh.length, item.instructions.length, `${item.id}: instructionsZh count mismatch`);
        for (let i = 0; i < item.instructions.length; i++) {
          const en = item.instructions[i]!;
          const zh = item.instructionsZh[i]!;
          if (!en.trim()) {
            assert.equal(zh, '', `${item.id}[${i}]: empty upstream step must remain empty`);
          } else {
            assert.ok(zh.trim().length > 0, `${item.id}[${i}]: non-empty step translated empty`);
            assert.match(zh, hasCjk, `${item.id}[${i}]: step missing Chinese`);
            assert.doesNotMatch(zh, latinWord, `${item.id}[${i}]: step has English leftover: ${zh}`);
          }
        }

        const standard = ctx.fitnessExercises.getStandard(item.id);
        assert.deepEqual(standard.referenceInstructionsZh, item.instructionsZh);
        assert.ok(Object.isFrozen(standard.referenceInstructionsZh));
      }
    }
    assert.equal(count, 878);

    assert.equal(ctx.fitnessExercises.get('Bodyweight_Squat').nameZh, '徒手深蹲');
    assert.equal(ctx.fitnessExercises.get('Pushups').nameZh, '俯卧撑');
    assert.equal(ctx.fitnessExercises.get('Crunches').nameZh, '卷腹');
    assert.equal(ctx.fitnessExercises.get('Sit-Up').nameZh, '仰卧起坐');
    assert.equal(ctx.fitnessExercises.get('Plank').nameZh, '平板支撑');
    assert.equal(ctx.fitnessExercises.get('Rope_Jumping').nameZh, '跳绳');
    assert.equal(ctx.fitnessExercises.get('Sit_And_Reach').nameZh, '坐位体前屈');
    assert.equal(ctx.fitnessExercises.get('Single_Leg_Balance').nameZh, '单脚站立平衡');
    assert.equal(ctx.fitnessExercises.get('Clean').instructionsZh[1], '');
    assert.deepEqual(ctx.fitnessExercises.get('Iron_Cross').instructionsZh, []);
  } finally { await ctx.fiber.dispose(); }
});

test('bilingual search matches Chinese names, muscles, equipment, categories, and English terms', async () => {
  const ctx = await library();
  try {
    const squat = ctx.fitnessExercises.list({ query: '深蹲', limit: 100 });
    assert.equal(squat.items[0]?.id, 'Bodyweight_Squat');
    assert.ok(squat.total > 10, `expected >10 深蹲 results, got ${squat.total}`);

    const bench = ctx.fitnessExercises.list({ query: '卧推', limit: 100 });
    assert.ok(bench.total > 10, `expected >10 卧推 results, got ${bench.total}`);
    assert.ok(bench.items.some(item => item.id === 'Barbell_Bench_Press_-_Medium_Grip'));

    const dumbbell = ctx.fitnessExercises.list({ query: '哑铃', limit: 100 });
    assert.ok(dumbbell.total > 50, `expected >50 哑铃 results, got ${dumbbell.total}`);
    assert.ok(dumbbell.items.some(item => item.equipment === 'dumbbell'));

    const quads = ctx.fitnessExercises.list({ query: '股四头肌', limit: 100 });
    assert.ok(quads.total > 50, `expected >50 股四头肌 results, got ${quads.total}`);
    assert.ok(quads.items.every(item =>
      item.primaryMusclesZh.includes('股四头肌') || item.secondaryMusclesZh.includes('股四头肌') || item.nameZh.includes('股四头肌')));

    const multi = ctx.fitnessExercises.list({ query: '哑铃 卧推', limit: 50 });
    assert.ok(multi.total > 0);
    assert.ok(multi.items.every(item =>
      (item.nameZh.includes('哑铃') || item.equipmentLabel === '哑铃') && item.nameZh.includes('卧推')));

    assert.ok(ctx.fitnessExercises.list({ query: '拉伸柔韧', limit: 50 }).total > 50);
    assert.ok(ctx.fitnessExercises.list({ query: 'quadriceps', limit: 50 }).total > 50);
    assert.ok(ctx.fitnessExercises.list({ query: 'barbell', limit: 50 }).total > 50);
  } finally { await ctx.fiber.dispose(); }
});
