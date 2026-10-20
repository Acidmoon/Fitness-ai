import { Service, type Context } from 'cordis';
import rawExercises from '../data/free-exercise-db/exercises.json' with { type: 'json' };
import rawManifest from '../data/free-exercise-db/manifest.json' with { type: 'json' };
import { FitnessError } from '../contracts.ts';
import {
  EXERCISE_CATEGORIES, EXERCISE_EQUIPMENT, EXERCISE_LEVELS, EXERCISE_MUSCLES, GOAL_UNITS,
  type CompletionStandard, type ExerciseCatalogManifest, type ExerciseDefinition,
  type ExerciseGoalRequest, type ExerciseGoalResult, type ExercisePage, type ExerciseQuery,
  type ExerciseSource, type ExerciseStandard, type FitnessExercises,
  type HeuristicTechniqueStandard,
} from '../exercise-contracts.ts';

const ALIASES: Readonly<Record<string, readonly string[]>> = {
  Bodyweight_Squat: ['squat', '深蹲'],
  Pushups: ['push-up', 'pushup', '俯卧撑'],
};
const COMPLETION: CompletionStandard = Object.freeze({
  id: 'personal-goal-completion', version: '1.0.0', kind: 'goal-completion', origin: 'project',
  units: GOAL_UNITS, targetSource: 'caller', formula: '100 * min(observed / target, 1)',
  minConfidence: 0.6, measuresTechnique: false, unitSelection: 'caller-responsibility',
});
Object.freeze(GOAL_UNITS);

function technique(id: string): ExerciseStandard['technique'] {
  const exercise = id === 'Bodyweight_Squat' ? 'squat' : id === 'Pushups' ? 'push-up' : undefined;
  if (!exercise) return Object.freeze({ status: 'unavailable', reason: 'no-calibrated-policy' });
  const standard: HeuristicTechniqueStandard = {
    status: 'heuristic', origin: 'project', validation: 'uncalibrated',
    policy: Object.freeze({ id: `demo-${exercise}-score`, version: '0.1.0', kind: 'heuristic' }),
    observationSchema: 'workout@1.0', motionExercise: exercise, minConfidence: 0.6,
    weights: Object.freeze({ completion: 20, rangeOfMotion: 40, stability: 25, tempo: 15 }),
    tempo: Object.freeze({ minMs: 2000, maxMs: 5000 }),
  };
  return Object.freeze(standard);
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

/** Validate the vendored boundary without silently dropping incomplete records. */
function definitions(): readonly ExerciseDefinition[] {
  try {
    if (!Array.isArray(rawExercises) || rawExercises.length !== rawManifest.exerciseCount) fail('动作总数与来源清单不一致');
    const ids = new Set<string>();
    const sourceRoot = `${rawManifest.repository}/blob/${rawManifest.revision}/exercises`;
    return Object.freeze(rawExercises.map((value): ExerciseDefinition => {
      const data = object(value);
      const id = text(data.id, 'id');
      if (!/^[0-9a-zA-Z_-]+$/.test(id) || ids.has(id)) fail(`动作标识非法或重复：${id}`);
      ids.add(id);
      const strings = (key: string): readonly string[] => {
        const items = data[key];
        if (!Array.isArray(items) || items.some(item => typeof item !== 'string')) fail(`${id}.${key} 必须是字符串数组`);
        return Object.freeze([...items] as string[]);
      };
      const muscles = (key: string) => Object.freeze(strings(key).map(item => member(item, EXERCISE_MUSCLES, key)));
      const instructions = strings('instructions');
      const images = strings('images');
      for (const image of images) if (!new RegExp(`^${id}/[0-9]+\\.jpg$`).test(image)) fail(`${id} 图片引用非法`);
      const quality = technique(id);
      return Object.freeze({
        schemaVersion: '1.0', id, name: text(data.name, 'name'),
        aliases: Object.freeze([...(ALIASES[id] ?? [])]),
        category: member(data.category, EXERCISE_CATEGORIES, 'category'),
        level: member(data.level, EXERCISE_LEVELS, 'level'),
        force: data.force == null ? null : member(data.force, ['static', 'pull', 'push'], 'force'),
        mechanic: data.mechanic === null ? null : member(data.mechanic, ['isolation', 'compound'], 'mechanic'),
        equipment: data.equipment === null ? null : member(data.equipment, EXERCISE_EQUIPMENT, 'equipment'),
        primaryMuscles: muscles('primaryMuscles'), secondaryMuscles: muscles('secondaryMuscles'),
        instructions, instructionStatus: !instructions.some(step => step.trim()) ? 'missing'
          : instructions.some(step => !step.trim()) ? 'partial' : 'available',
        mediaRights: 'unverified',
        imageUrls: Object.freeze(images.map(image => `https://raw.githubusercontent.com/yuhonas/free-exercise-db/${rawManifest.revision}/exercises/${image}`)),
        sourceUrl: `${sourceRoot}/${id}.json`, sourceRevision: rawManifest.revision,
        capabilities: Object.freeze({ goalScoring: true, techniqueScoring: quality.status, poseAnalysis: quality.status }),
      });
    }));
  } catch (cause) {
    throw new FitnessError('CATALOG_INVALID', '动作目录未通过启动校验', { cause });
  }
}

export class ExerciseLibraryPlugin extends Service implements FitnessExercises {
  static provide = 'fitnessExercises';
  private readonly exercises = definitions();
  private readonly index = new Map<string, ExerciseDefinition>();
  private readonly standards = new Map<string, ExerciseStandard>();
  private readonly catalog: ExerciseCatalogManifest;

  constructor(ctx: Context) {
    super(ctx, 'fitnessExercises');
    const counts = Object.fromEntries(EXERCISE_CATEGORIES.map(category => [category,
      this.exercises.filter(item => item.category === category).length]));
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
        instructionStatus: item.instructionStatus, referenceInstructions: item.instructions,
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
        exercises: this.exercises.length, goalScoring: this.exercises.length,
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
    const filtered = this.exercises.filter(item =>
      (search === undefined || [item.id, item.name, ...item.aliases].some(value => value.toLowerCase().includes(search))) &&
      (category === undefined || item.category === category) && (level === undefined || item.level === level) &&
      (equipment === undefined || item.equipment === equipment) &&
      (muscle === undefined || item.primaryMuscles.includes(muscle) || item.secondaryMuscles.includes(muscle)) &&
      (quality === undefined || item.capabilities.techniqueScoring === quality));
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
