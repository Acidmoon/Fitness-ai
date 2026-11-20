import type { DimensionKey, PolicyReference } from './contracts.ts';
import type { MotionMeasurementMode, SupportedExercise } from './vision-contracts.ts';

export const EXERCISE_CATEGORIES = [
  'strength', 'stretching', 'plyometrics', 'strongman', 'powerlifting',
  'cardio', 'olympic weightlifting',
] as const;
export const EXERCISE_LEVELS = ['beginner', 'intermediate', 'expert'] as const;
export const EXERCISE_EQUIPMENT = [
  'medicine ball', 'dumbbell', 'body only', 'bands', 'kettlebells', 'foam roll',
  'cable', 'machine', 'barbell', 'exercise ball', 'e-z curl bar', 'other',
] as const;
export const EXERCISE_MUSCLES = [
  'abdominals', 'abductors', 'adductors', 'biceps', 'calves', 'chest', 'forearms',
  'glutes', 'hamstrings', 'lats', 'lower back', 'middle back', 'neck',
  'quadriceps', 'shoulders', 'traps', 'triceps',
] as const;
export const EXERCISE_FORCES = ['static', 'pull', 'push'] as const;
export const EXERCISE_MECHANICS = ['isolation', 'compound'] as const;
export const GOAL_UNITS = ['repetitions', 'seconds', 'meters'] as const;
export type ExerciseCategory = typeof EXERCISE_CATEGORIES[number];
export type ExerciseLevel = typeof EXERCISE_LEVELS[number];
export type ExerciseEquipment = typeof EXERCISE_EQUIPMENT[number];
export type ExerciseMuscle = typeof EXERCISE_MUSCLES[number];
export type ExerciseForce = typeof EXERCISE_FORCES[number];
export type ExerciseMechanic = typeof EXERCISE_MECHANICS[number];
export type GoalUnit = typeof GOAL_UNITS[number];

export const EXERCISE_CATEGORY_LABELS: Readonly<Record<ExerciseCategory, string>> = Object.freeze({
  strength: '力量训练',
  stretching: '拉伸柔韧',
  plyometrics: '增强式训练',
  strongman: '大力士训练',
  powerlifting: '力量举',
  cardio: '有氧运动',
  'olympic weightlifting': '举重',
});

export const EXERCISE_LEVEL_LABELS: Readonly<Record<ExerciseLevel, string>> = Object.freeze({
  beginner: '初级',
  intermediate: '中级',
  expert: '高级',
});

export const EXERCISE_EQUIPMENT_LABELS: Readonly<Record<ExerciseEquipment, string>> = Object.freeze({
  'body only': '徒手',
  dumbbell: '哑铃',
  barbell: '杠铃',
  cable: '绳索',
  machine: '固定器械',
  kettlebells: '壶铃',
  bands: '弹力带',
  'medicine ball': '药球',
  'exercise ball': '健身球',
  'foam roll': '泡沫轴',
  'e-z curl bar': '曲杆杠铃',
  other: '其他器械',
});

export const EXERCISE_FORCE_LABELS: Readonly<Record<ExerciseForce, string>> = Object.freeze({
  push: '推',
  pull: '拉',
  static: '静力',
});

export const EXERCISE_MECHANIC_LABELS: Readonly<Record<ExerciseMechanic, string>> = Object.freeze({
  compound: '复合动作',
  isolation: '孤立动作',
});

export const EXERCISE_MUSCLE_LABELS: Readonly<Record<ExerciseMuscle, string>> = Object.freeze({
  abdominals: '腹肌',
  abductors: '髋外展肌',
  adductors: '髋内收肌',
  biceps: '肱二头肌',
  calves: '小腿肌群',
  chest: '胸肌',
  forearms: '前臂',
  glutes: '臀肌',
  hamstrings: '腘绳肌',
  lats: '背阔肌',
  'lower back': '下背部',
  'middle back': '中背部',
  neck: '颈部',
  quadriceps: '股四头肌',
  shoulders: '肩部',
  traps: '斜方肌',
  triceps: '肱三头肌',
});

export interface ExerciseSource {
  readonly id: string;
  readonly repository: string;
  readonly revision: string;
  readonly retrievedOn: string;
  readonly license: string;
  readonly dataFile: string;
  readonly sha256: string;
  readonly exerciseCount: number;
  readonly upstream: string;
  readonly authority: 'community-catalog';
  readonly includesMediaFiles: false;
  readonly includesQualityAnnotations: false;
  readonly mediaRights: 'unverified';
  readonly categoryCounts: Readonly<Record<ExerciseCategory, number>>;
}

export interface ExerciseDefinition {
  readonly schemaVersion: '1.0';
  /** Stable upstream identifier; aliases never replace the stored identifier. */
  readonly id: string;
  readonly name: string;
  readonly nameZh: string;
  readonly aliases: readonly string[];
  readonly category: ExerciseCategory;
  readonly categoryLabel: string;
  readonly level: ExerciseLevel;
  readonly levelLabel: string;
  readonly force: ExerciseForce | null;
  readonly forceLabel: string | null;
  readonly mechanic: ExerciseMechanic | null;
  readonly mechanicLabel: string | null;
  readonly equipment: ExerciseEquipment | null;
  readonly equipmentLabel: string | null;
  readonly primaryMuscles: readonly ExerciseMuscle[];
  readonly primaryMusclesZh: readonly string[];
  readonly secondaryMuscles: readonly ExerciseMuscle[];
  readonly secondaryMusclesZh: readonly string[];
  /** Verbatim upstream English text. Empty source instructions remain empty. */
  readonly instructions: readonly string[];
  /** Simplified Chinese instructions matching `instructions` 1:1; empty steps stay empty. */
  readonly instructionsZh: readonly string[];
  readonly instructionStatus: 'available' | 'partial' | 'missing';
  /** Pinned remote references only; media is not downloaded during startup. */
  readonly imageUrls: readonly string[];
  readonly mediaRights: 'unverified';
  readonly origin: 'free-exercise-db' | 'project';
  readonly sourceUrl: string;
  readonly sourceRevision: string;
  readonly capabilities: {
    readonly goalScoring: true;
    readonly techniqueScoring: 'heuristic' | 'unavailable';
    readonly poseAnalysis: 'heuristic' | 'unavailable';
  };
}

export interface CompletionStandard {
  readonly id: 'personal-goal-completion';
  readonly version: '1.0.0';
  readonly kind: 'goal-completion';
  readonly origin: 'project';
  readonly units: readonly GoalUnit[];
  readonly targetSource: 'caller';
  readonly formula: '100 * min(observed / target, 1)';
  readonly minConfidence: number;
  readonly measuresTechnique: false;
  readonly unitSelection: 'caller-responsibility';
}

export interface HeuristicTechniqueStandard {
  readonly status: 'heuristic';
  readonly policy: PolicyReference;
  readonly origin: 'project';
  readonly validation: 'uncalibrated';
  readonly observationSchema: 'workout@1.0';
  readonly motionExercise: SupportedExercise;
  readonly measurementMode: MotionMeasurementMode;
  readonly targetUnit: 'repetitions' | 'seconds';
  readonly minConfidence: number;
  readonly weights: Readonly<Record<DimensionKey, number>>;
  readonly tempo: { readonly minMs: number; readonly maxMs: number };
}

export interface ExerciseStandard {
  readonly schemaVersion: '1.0';
  readonly exerciseId: string;
  readonly sourceRevision: string;
  readonly instructionStatus: 'available' | 'partial' | 'missing';
  readonly referenceInstructions: readonly string[];
  readonly referenceInstructionsZh: readonly string[];
  readonly sourceUrl: string;
  readonly completion: CompletionStandard;
  readonly technique: HeuristicTechniqueStandard | {
    readonly status: 'unavailable';
    readonly reason: 'no-calibrated-policy';
  };
}

export interface ExerciseQuery {
  readonly query?: string;
  readonly category?: ExerciseCategory;
  readonly level?: ExerciseLevel;
  readonly equipment?: ExerciseEquipment | null;
  readonly muscle?: ExerciseMuscle;
  readonly technique?: 'heuristic' | 'unavailable';
  readonly offset?: number;
  readonly limit?: number;
}

export interface ExercisePage {
  readonly schemaVersion: '1.0';
  readonly total: number;
  readonly offset: number;
  readonly limit: number;
  readonly items: readonly ExerciseDefinition[];
}

export interface ExerciseCatalogManifest {
  readonly schemaVersion: '1.0';
  readonly source: ExerciseSource;
  readonly counts: {
    readonly exercises: number;
    readonly projectDefined: number;
    readonly goalScoring: number;
    readonly heuristicTechnique: number;
    readonly calibratedTechnique: 0;
    readonly missingInstructions: number;
    readonly partialInstructions: number;
  };
}

/** Aggregate completion data, not skeletons or a judgment about movement form. */
export interface ExerciseGoalRequest {
  readonly schemaVersion: '1.0';
  readonly sessionId: string;
  readonly exerciseId: string;
  readonly unit: GoalUnit;
  readonly target: number;
  readonly observed: number;
  /** Reliability on the producing adapter's scale; not a correctness probability. */
  readonly confidence: number;
  readonly observationSource: 'manual' | 'sensor' | 'pose';
}

export interface ExerciseGoalResult {
  readonly schemaVersion: '1.0';
  readonly sessionId: string;
  readonly exerciseId: string;
  readonly sourceRevision: string;
  readonly policy: CompletionStandard;
  readonly scoreKind: 'goal-completion';
  readonly total: number;
  readonly unit: GoalUnit;
  readonly target: number;
  readonly observed: number;
  readonly confidence: number;
  readonly observationSource: ExerciseGoalRequest['observationSource'];
  readonly techniqueScore: null;
}

export interface FitnessExercises {
  manifest(): ExerciseCatalogManifest;
  list(query?: ExerciseQuery): ExercisePage;
  get(idOrAlias: string): ExerciseDefinition;
  getStandard(idOrAlias: string): ExerciseStandard;
  scoreGoal(value: unknown): ExerciseGoalResult;
}

declare module 'cordis' {
  interface Context { fitnessExercises: FitnessExercises }
  interface Events {
    'fitness/exercise-goal-scored'(result: ExerciseGoalResult): void;
  }
}
