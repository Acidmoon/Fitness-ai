import { Service, type Context } from 'cordis';
import rawExercises from '../data/free-exercise-db/exercises.json' with { type: 'json' };
import rawTranslationsZh from '../data/free-exercise-db/zh-cn.json' with { type: 'json' };
import rawManifest from '../data/free-exercise-db/manifest.json' with { type: 'json' };
import { FitnessError, type DimensionKey } from '../contracts.ts';
import type { MotionMeasurementMode, SupportedExercise } from '../vision-contracts.ts';
import {
  EXERCISE_CATEGORIES, EXERCISE_CATEGORY_LABELS,
  EXERCISE_EQUIPMENT, EXERCISE_EQUIPMENT_LABELS,
  EXERCISE_FORCES, EXERCISE_FORCE_LABELS,
  EXERCISE_LEVELS, EXERCISE_LEVEL_LABELS,
  EXERCISE_MECHANICS, EXERCISE_MECHANIC_LABELS,
  EXERCISE_MUSCLES, EXERCISE_MUSCLE_LABELS,
  GOAL_UNITS,
  type CompletionStandard, type ExerciseCatalogManifest, type ExerciseDefinition,
  type ExerciseGoalRequest, type ExerciseGoalResult, type ExercisePage, type ExerciseQuery,
  type ExerciseSource, type ExerciseStandard, type FitnessExercises,
  type HeuristicTechniqueStandard,
} from '../exercise-contracts.ts';

const PROJECT_REVISION = 'project-campus-1.0';

const ALIASES: Readonly<Record<string, readonly string[]>> = {
  Bodyweight_Squat: ['squat', '深蹲'],
  Pushups: ['push-up', 'pushup', '俯卧撑'],
  Crunches: ['crunch', '卷腹'],
  'Sit-Up': ['situp', '仰卧起坐'],
  Plank: ['平板支撑'],
  Rope_Jumping: ['jump-rope', 'jumprope', '跳绳'],
  Sit_And_Reach: ['sit-and-reach', 'sitandreach', '坐位体前屈', '体前屈'],
  Single_Leg_Balance: ['balance', 'single-leg-balance', '单脚站立', '单脚站立平衡', '单脚站立平衡测试', '平衡测试'],
};

interface TechniqueProfile {
  readonly measurementMode: MotionMeasurementMode;
  readonly targetUnit: 'repetitions' | 'seconds';
  readonly weights: Readonly<Record<DimensionKey, number>>;
  readonly tempo: { readonly minMs: number; readonly maxMs: number };
}

/** Uncalibrated demo weights; holds, reaches, and jumps use their own tempo windows. */
const TECHNIQUE: Readonly<Record<SupportedExercise, TechniqueProfile>> = Object.freeze({
  squat: {
    measurementMode: 'cycle', targetUnit: 'repetitions',
    weights: { completion: 20, rangeOfMotion: 40, stability: 25, tempo: 15 },
    tempo: { minMs: 2_000, maxMs: 5_000 },
  },
  'push-up': {
    measurementMode: 'cycle', targetUnit: 'repetitions',
    weights: { completion: 20, rangeOfMotion: 40, stability: 25, tempo: 15 },
    tempo: { minMs: 2_000, maxMs: 5_000 },
  },
  crunch: {
    measurementMode: 'cycle', targetUnit: 'repetitions',
    weights: { completion: 20, rangeOfMotion: 40, stability: 25, tempo: 15 },
    tempo: { minMs: 1_500, maxMs: 4_000 },
  },
  'sit-up': {
    measurementMode: 'cycle', targetUnit: 'repetitions',
    weights: { completion: 20, rangeOfMotion: 40, stability: 25, tempo: 15 },
    tempo: { minMs: 2_000, maxMs: 5_000 },
  },
  plank: {
    measurementMode: 'hold', targetUnit: 'seconds',
    weights: { completion: 20, rangeOfMotion: 20, stability: 30, tempo: 30 },
    tempo: { minMs: 20_000, maxMs: 600_000 },
  },
  'jump-rope': {
    measurementMode: 'oscillation', targetUnit: 'repetitions',
    weights: { completion: 20, rangeOfMotion: 25, stability: 30, tempo: 25 },
    tempo: { minMs: 400, maxMs: 1_200 },
  },
  'sit-and-reach': {
    measurementMode: 'reach', targetUnit: 'repetitions',
    weights: { completion: 15, rangeOfMotion: 45, stability: 25, tempo: 15 },
    tempo: { minMs: 2_000, maxMs: 15_000 },
  },
  balance: {
    measurementMode: 'hold', targetUnit: 'seconds',
    weights: { completion: 25, rangeOfMotion: 20, stability: 35, tempo: 20 },
    tempo: { minMs: 10_000, maxMs: 300_000 },
  },
});

const MOTION_EXERCISE_BY_ID: Readonly<Record<string, SupportedExercise>> = Object.freeze({
  Bodyweight_Squat: 'squat',
  Pushups: 'push-up',
  Crunches: 'crunch',
  'Sit-Up': 'sit-up',
  Plank: 'plank',
  Rope_Jumping: 'jump-rope',
  Sit_And_Reach: 'sit-and-reach',
  Single_Leg_Balance: 'balance',
});

const COMPLETION: CompletionStandard = Object.freeze({
  id: 'personal-goal-completion', version: '1.0.0', kind: 'goal-completion', origin: 'project',
  units: GOAL_UNITS, targetSource: 'caller', formula: '100 * min(observed / target, 1)',
  minConfidence: 0.6, measuresTechnique: false, unitSelection: 'caller-responsibility',
});
Object.freeze(GOAL_UNITS);

function technique(id: string): ExerciseStandard['technique'] {
  const exercise = MOTION_EXERCISE_BY_ID[id];
  if (!exercise) return Object.freeze({ status: 'unavailable', reason: 'no-calibrated-policy' });
  const profile = TECHNIQUE[exercise];
  const standard: HeuristicTechniqueStandard = {
    status: 'heuristic', origin: 'project', validation: 'uncalibrated',
    policy: Object.freeze({ id: `demo-${exercise}-score`, version: '0.1.0', kind: 'heuristic' }),
    observationSchema: 'workout@1.0', motionExercise: exercise,
    measurementMode: profile.measurementMode, targetUnit: profile.targetUnit,
    minConfidence: 0.6,
    weights: Object.freeze({ ...profile.weights }),
    tempo: Object.freeze({ ...profile.tempo }),
  };
  return Object.freeze(standard);
}

/** Project-defined campus fitness-test entries with no exact match in free-exercise-db. */
function projectDefinitions(): readonly ExerciseDefinition[] {
  return Object.freeze([
    Object.freeze({
      schemaVersion: '1.0' as const,
      id: 'Sit_And_Reach',
      name: 'Sit and Reach',
      nameZh: '坐位体前屈',
      aliases: Object.freeze([...(ALIASES.Sit_And_Reach ?? [])]),
      category: 'stretching' as const,
      categoryLabel: EXERCISE_CATEGORY_LABELS.stretching,
      level: 'beginner' as const,
      levelLabel: EXERCISE_LEVEL_LABELS.beginner,
      force: 'static' as const,
      forceLabel: EXERCISE_FORCE_LABELS.static,
      mechanic: 'compound' as const,
      mechanicLabel: EXERCISE_MECHANIC_LABELS.compound,
      equipment: 'body only' as const,
      equipmentLabel: EXERCISE_EQUIPMENT_LABELS['body only'],
      primaryMuscles: Object.freeze(['hamstrings', 'lower back'] as const),
      primaryMusclesZh: Object.freeze([EXERCISE_MUSCLE_LABELS.hamstrings, EXERCISE_MUSCLE_LABELS['lower back']] as const),
      secondaryMuscles: Object.freeze(['calves'] as const),
      secondaryMusclesZh: Object.freeze([EXERCISE_MUSCLE_LABELS.calves] as const),
      instructions: Object.freeze([
        'Sit on a flat surface with both legs extended straight in front of you and knees kept flat.',
        'Place the camera in a side view so your shoulder, wrist, hip, knee, and ankle remain clearly visible.',
        'Exhale and reach both hands slowly forward along the line of your legs without bending your knees or bouncing.',
        'Hold your maximum comfortable forward reach steadily for at least 2 seconds, then relax back to upright sitting.',
      ]),
      instructionsZh: Object.freeze([
        '坐在平整的地面或垫子上，双腿向前伸直，膝盖保持贴地伸直状态。',
        '将镜头放置在身体侧面，确保肩部、手腕、髋部、膝盖和脚踝都清晰可见。',
        '呼气，双手沿双腿方向缓慢向前伸展，过程中不要屈膝或借力弹振。',
        '在舒适的最大前伸位置稳定保持至少 2 秒，随后放松回到直立坐姿。',
      ]),
      instructionStatus: 'available' as const,
      imageUrls: Object.freeze([] as string[]),
      mediaRights: 'unverified' as const,
      origin: 'project' as const,
      sourceUrl: 'project://fitness-ai/exercises/Sit_And_Reach',
      sourceRevision: PROJECT_REVISION,
      capabilities: Object.freeze({ goalScoring: true as const, techniqueScoring: 'heuristic' as const, poseAnalysis: 'heuristic' as const }),
    }),
    Object.freeze({
      schemaVersion: '1.0' as const,
      id: 'Single_Leg_Balance',
      name: 'Single-Leg Balance',
      nameZh: '单脚站立平衡',
      aliases: Object.freeze([...(ALIASES.Single_Leg_Balance ?? [])]),
      category: 'strength' as const,
      categoryLabel: EXERCISE_CATEGORY_LABELS.strength,
      level: 'beginner' as const,
      levelLabel: EXERCISE_LEVEL_LABELS.beginner,
      force: 'static' as const,
      forceLabel: EXERCISE_FORCE_LABELS.static,
      mechanic: 'compound' as const,
      mechanicLabel: EXERCISE_MECHANIC_LABELS.compound,
      equipment: 'body only' as const,
      equipmentLabel: EXERCISE_EQUIPMENT_LABELS['body only'],
      primaryMuscles: Object.freeze(['calves', 'quadriceps'] as const),
      primaryMusclesZh: Object.freeze([EXERCISE_MUSCLE_LABELS.calves, EXERCISE_MUSCLE_LABELS.quadriceps] as const),
      secondaryMuscles: Object.freeze(['glutes', 'abdominals'] as const),
      secondaryMusclesZh: Object.freeze([EXERCISE_MUSCLE_LABELS.glutes, EXERCISE_MUSCLE_LABELS.abdominals] as const),
      instructions: Object.freeze([
        'Stand upright facing the camera (front or oblique full-body view) with both shoulders, hips, and ankles visible.',
        'Shift your weight onto one standing foot and lift the other foot clearly off the ground.',
        'Keep your torso upright and steady without hopping or touching the raised foot down.',
        'Hold the single-leg stance continuously toward your target duration in seconds.',
      ]),
      instructionsZh: Object.freeze([
        '面向镜头直立站好（正面或斜侧面全身入镜），确保双肩、双髋和双脚踝清晰可见。',
        '将身体重心移至一侧支撑脚，另一只脚清晰抬离地面。',
        '保持躯干直立稳定，不要单脚跳动或让抬起脚触地。',
        '持续保持单脚站立姿势，尽量坚持至目标秒数。',
      ]),
      instructionStatus: 'available' as const,
      imageUrls: Object.freeze([] as string[]),
      mediaRights: 'unverified' as const,
      origin: 'project' as const,
      sourceUrl: 'project://fitness-ai/exercises/Single_Leg_Balance',
      sourceRevision: PROJECT_REVISION,
      capabilities: Object.freeze({ goalScoring: true as const, techniqueScoring: 'heuristic' as const, poseAnalysis: 'heuristic' as const }),
    }),
  ]);
}

function fail(message: string): never { throw new FitnessError('INVALID_EXERCISE_DATA', message); }
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('参数必须是对象');
  return value as Record<string, unknown>;
}
function text(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 128) fail(`${name} 必须是 1–128 字符的非空字符串`);
  return value;
}
function finite(value: unknown, name: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) fail(`${name} 必须是 ${min}–${max} 的有限数值`);
  return value;
}
function member<T extends string>(value: unknown, values: readonly T[], name: string): T {
  if (typeof value !== 'string' || !values.includes(value as T)) fail(`${name} 不在支持的枚举中`);
  return value as T;
}
function exactKeys(data: Record<string, unknown>, keys: readonly string[]): void {
  for (const key of Object.keys(data)) if (!keys.includes(key)) fail(`未知字段：${key}`);
}

/** Validate the vendored boundary and offline Chinese localization without silently dropping records. */
function definitions(): readonly ExerciseDefinition[] {
  try {
    if (!Array.isArray(rawExercises) || rawExercises.length !== rawManifest.exerciseCount) fail('动作总数与来源清单不一致');
    const translations = object(rawTranslationsZh);
    const translationKeys = Object.keys(translations);
    if (translationKeys.length !== rawExercises.length) {
      fail(`中文本地化条目数与动作总数不一致：${translationKeys.length} !== ${rawExercises.length}`);
    }
    const ids = new Set<string>();
    const sourceRoot = `${rawManifest.repository}/blob/${rawManifest.revision}/exercises`;
    return Object.freeze(rawExercises.map((value): ExerciseDefinition => {
      const data = object(value);
      const id = text(data.id, 'id');
      if (!/^[0-9a-zA-Z_-]+$/.test(id) || ids.has(id)) fail(`动作标识非法或重复：${id}`);
      ids.add(id);
      if (!Object.prototype.hasOwnProperty.call(translations, id)) fail(`缺少中文本地化条目：${id}`);
      const zhEntry = object(translations[id]);
      exactKeys(zhEntry, ['name', 'instructions']);
      const nameZh = text(zhEntry.name, `${id}.nameZh`);
      const strings = (src: Record<string, unknown>, key: string): readonly string[] => {
        const items = src[key];
        if (!Array.isArray(items) || items.some(item => typeof item !== 'string')) fail(`${id}.${key} 必须是字符串数组`);
        return Object.freeze([...items] as string[]);
      };
      const muscles = (key: string) => Object.freeze(strings(data, key).map(item => member(item, EXERCISE_MUSCLES, key)));
      const instructions = strings(data, 'instructions');
      const instructionsZh = strings(zhEntry, 'instructions');
      if (instructionsZh.length !== instructions.length) {
        fail(`${id}.instructionsZh 步骤数与英文源不一致：${instructionsZh.length} !== ${instructions.length}`);
      }
      for (let i = 0; i < instructions.length; i++) {
        const srcStep = instructions[i]!;
        const zhStep = instructionsZh[i]!;
        if (!srcStep.trim()) {
          if (zhStep !== '') fail(`${id}.instructionsZh[${i}] 对应空英文步骤必须保持为空字符串`);
        } else if (!zhStep.trim()) {
          fail(`${id}.instructionsZh[${i}] 不能为空`);
        }
      }
      const images = strings(data, 'images');
      for (const image of images) if (!new RegExp(`^${id}/[0-9]+\\.jpg$`).test(image)) fail(`${id} 图片引用非法`);
      const category = member(data.category, EXERCISE_CATEGORIES, 'category');
      const level = member(data.level, EXERCISE_LEVELS, 'level');
      const force = data.force == null ? null : member(data.force, EXERCISE_FORCES, 'force');
      const mechanic = data.mechanic === null ? null : member(data.mechanic, EXERCISE_MECHANICS, 'mechanic');
      const equipment = data.equipment === null ? null : member(data.equipment, EXERCISE_EQUIPMENT, 'equipment');
      const primaryMuscles = muscles('primaryMuscles');
      const secondaryMuscles = muscles('secondaryMuscles');
      const quality = technique(id);
      return Object.freeze({
        schemaVersion: '1.0', id, name: text(data.name, 'name'), nameZh,
        aliases: Object.freeze([...(ALIASES[id] ?? [])]),
        category, categoryLabel: EXERCISE_CATEGORY_LABELS[category],
        level, levelLabel: EXERCISE_LEVEL_LABELS[level],
        force, forceLabel: force === null ? null : EXERCISE_FORCE_LABELS[force],
        mechanic, mechanicLabel: mechanic === null ? null : EXERCISE_MECHANIC_LABELS[mechanic],
        equipment, equipmentLabel: equipment === null ? null : EXERCISE_EQUIPMENT_LABELS[equipment],
        primaryMuscles,
        primaryMusclesZh: Object.freeze(primaryMuscles.map(muscle => EXERCISE_MUSCLE_LABELS[muscle])),
        secondaryMuscles,
        secondaryMusclesZh: Object.freeze(secondaryMuscles.map(muscle => EXERCISE_MUSCLE_LABELS[muscle])),
        instructions, instructionsZh,
        instructionStatus: !instructions.some(step => step.trim()) ? 'missing'
          : instructions.some(step => !step.trim()) ? 'partial' : 'available',
        mediaRights: 'unverified',
        origin: 'free-exercise-db',
        imageUrls: Object.freeze(images.map(image => `https://raw.githubusercontent.com/yuhonas/free-exercise-db/${rawManifest.revision}/exercises/${image}`)),
        sourceUrl: `${sourceRoot}/${id}.json`, sourceRevision: rawManifest.revision,
        capabilities: Object.freeze({ goalScoring: true, techniqueScoring: quality.status, poseAnalysis: quality.status }),
      });
    }));
  } catch (cause) {
    throw new FitnessError('CATALOG_INVALID', '动作目录未通过启动校验', { cause });
  }
}

function searchRank(item: ExerciseDefinition, search: string): number | null {
  const primary = [item.id, item.name, item.nameZh, ...item.aliases].map(value => value.toLowerCase());
  const secondary = [
    item.category, item.categoryLabel,
    item.level, item.levelLabel,
    ...(item.equipment ? [item.equipment] : []),
    ...(item.equipmentLabel ? [item.equipmentLabel] : []),
    ...(item.force ? [item.force] : []),
    ...(item.forceLabel ? [item.forceLabel] : []),
    ...(item.mechanic ? [item.mechanic] : []),
    ...(item.mechanicLabel ? [item.mechanicLabel] : []),
    ...item.primaryMuscles, ...item.primaryMusclesZh,
    ...item.secondaryMuscles, ...item.secondaryMusclesZh,
  ].map(value => value.toLowerCase());

  if (primary.some(value => value === search)) return 0;
  if (primary.some(value => value.startsWith(search))) return 1;
  if (primary.some(value => value.includes(search))) return 2;
  if (secondary.some(value => value.includes(search))) return 3;

  const tokens = search.split(/\s+/).filter(Boolean);
  if (tokens.length > 1) {
    if (tokens.every(token => primary.some(value => value.includes(token)))) return 2;
    const all = [...primary, ...secondary];
    if (tokens.every(token => all.some(value => value.includes(token)))) return 3;
  }
  return null;
}

export class ExerciseLibraryPlugin extends Service implements FitnessExercises {
  static provide = 'fitnessExercises';
  private readonly upstream = definitions();
  private readonly custom = projectDefinitions();
  private readonly exercises = Object.freeze([...this.upstream, ...this.custom]);
  private readonly index = new Map<string, ExerciseDefinition>();
  private readonly standards = new Map<string, ExerciseStandard>();
  private readonly catalog: ExerciseCatalogManifest;

  constructor(ctx: Context) {
    super(ctx, 'fitnessExercises');
    const counts = Object.fromEntries(EXERCISE_CATEGORIES.map(category => [category,
      this.upstream.filter(item => item.category === category).length]));
    for (const category of EXERCISE_CATEGORIES) {
      if (counts[category] !== rawManifest.categoryCounts[category]) throw new FitnessError('CATALOG_INVALID', `动作类别统计不一致：${category}`);
    }
    for (const item of this.exercises) {
      for (const key of [item.id, ...item.aliases]) {
        const normalized = key.toLowerCase();
        if (this.index.has(normalized)) throw new FitnessError('CATALOG_INVALID', `动作标识或别名冲突：${key}`);
        this.index.set(normalized, item);
      }
      this.standards.set(item.id, Object.freeze({
        schemaVersion: '1.0', exerciseId: item.id, sourceRevision: item.sourceRevision,
        instructionStatus: item.instructionStatus,
        referenceInstructions: item.instructions,
        referenceInstructionsZh: item.instructionsZh,
        sourceUrl: item.sourceUrl, completion: COMPLETION, technique: technique(item.id),
      }));
    }
    const source: ExerciseSource = Object.freeze({
      ...rawManifest, authority: 'community-catalog', includesMediaFiles: false,
      includesQualityAnnotations: false, mediaRights: 'unverified', categoryCounts: Object.freeze({ ...rawManifest.categoryCounts }),
    });
    this.catalog = Object.freeze({
      schemaVersion: '1.0', source,
      counts: Object.freeze({
        exercises: this.exercises.length, projectDefined: this.custom.length, goalScoring: this.exercises.length,
        heuristicTechnique: this.exercises.filter(item => item.capabilities.techniqueScoring === 'heuristic').length,
        calibratedTechnique: 0, missingInstructions: this.exercises.filter(item => item.instructionStatus === 'missing').length,
        partialInstructions: this.exercises.filter(item => item.instructionStatus === 'partial').length,
      }),
    });
  }

  manifest(): ExerciseCatalogManifest { return this.catalog; }

  get(idOrAlias: string): ExerciseDefinition {
    const key = text(idOrAlias, 'exerciseId').trim().toLowerCase();
    const item = this.index.get(key);
    if (!item) throw new FitnessError('UNSUPPORTED_EXERCISE', `动作目录中没有该标识：${idOrAlias}`);
    return item;
  }

  getStandard(idOrAlias: string): ExerciseStandard { return this.standards.get(this.get(idOrAlias).id)!; }

  list(query: ExerciseQuery = {}): ExercisePage {
    const data = object(query);
    exactKeys(data, ['query', 'category', 'level', 'equipment', 'muscle', 'technique', 'offset', 'limit']);
    const offset = finite(data.offset === undefined ? 0 : data.offset, 'offset', 0, Number.MAX_SAFE_INTEGER);
    const limit = finite(data.limit === undefined ? 50 : data.limit, 'limit', 1, 100);
    if (!Number.isInteger(offset) || !Number.isInteger(limit)) fail('offset 和 limit 必须是整数');
    const search = data.query === undefined ? undefined : text(data.query, 'query').trim().toLowerCase();
    const category = data.category === undefined ? undefined : member(data.category, EXERCISE_CATEGORIES, 'category');
    const level = data.level === undefined ? undefined : member(data.level, EXERCISE_LEVELS, 'level');
    const equipment = data.equipment == null ? data.equipment : member(data.equipment, EXERCISE_EQUIPMENT, 'equipment');
    const muscle = data.muscle === undefined ? undefined : member(data.muscle, EXERCISE_MUSCLES, 'muscle');
    const quality = data.technique === undefined ? undefined : member(data.technique, ['heuristic', 'unavailable'], 'technique');
    const matched: { item: ExerciseDefinition; rank: number }[] = [];
    for (const item of this.exercises) {
      if (category !== undefined && item.category !== category) continue;
      if (level !== undefined && item.level !== level) continue;
      if (equipment !== undefined && item.equipment !== equipment) continue;
      if (muscle !== undefined && !item.primaryMuscles.includes(muscle) && !item.secondaryMuscles.includes(muscle)) continue;
      if (quality !== undefined && item.capabilities.techniqueScoring !== quality) continue;
      if (search === undefined) {
        matched.push({ item, rank: 0 });
      } else {
        const rank = searchRank(item, search);
        if (rank !== null) matched.push({ item, rank });
      }
    }
    if (search !== undefined) matched.sort((a, b) => a.rank - b.rank);
    const filtered = matched.map(entry => entry.item);
    return Object.freeze({ schemaVersion: '1.0', total: filtered.length, offset, limit, items: Object.freeze(filtered.slice(offset, offset + limit)) });
  }

  scoreGoal(value: unknown): ExerciseGoalResult {
    const data = object(value);
    exactKeys(data, ['schemaVersion', 'sessionId', 'exerciseId', 'unit', 'target', 'observed', 'confidence', 'observationSource']);
    if (data.schemaVersion !== '1.0') fail('schemaVersion 仅支持 "1.0"');
    const sessionId = text(data.sessionId, 'sessionId');
    const item = this.get(text(data.exerciseId, 'exerciseId'));
    const unit = member(data.unit, GOAL_UNITS, 'unit');
    const target = finite(data.target, 'target', Number.MIN_VALUE, 1_000_000_000);
    const observed = finite(data.observed, 'observed', 0, 1_000_000_000);
    if (unit === 'repetitions' && (!Number.isInteger(target) || !Number.isInteger(observed))) fail('repetitions 单位要求目标和观测值均为整数');
    const confidence = finite(data.confidence, 'confidence', 0, 1);
    const observationSource: ExerciseGoalRequest['observationSource'] = member(data.observationSource, ['manual', 'sensor', 'pose'], 'observationSource');
    if (confidence < COMPLETION.minConfidence) throw new FitnessError('INSUFFICIENT_DATA', '训练完成度观测置信度不足 0.6');
    const result: ExerciseGoalResult = Object.freeze({
      schemaVersion: '1.0', sessionId, exerciseId: item.id, sourceRevision: item.sourceRevision,
      policy: COMPLETION, scoreKind: 'goal-completion', total: Math.round(Math.min(observed / target, 1) * 10_000) / 100,
      unit, target, observed, confidence, observationSource, techniqueScore: null,
    });
    this.ctx.emit('fitness/exercise-goal-scored', result);
    return result;
  }
}
