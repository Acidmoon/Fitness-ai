import type { DimensionKey, PolicyReference } from './contracts.ts';

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
export const GOAL_UNITS = ['repetitions', 'seconds', 'meters'] as const;
export type ExerciseCategory = typeof EXERCISE_CATEGORIES[number];
export type ExerciseLevel = typeof EXERCISE_LEVELS[number];
export type ExerciseEquipment = typeof EXERCISE_EQUIPMENT[number];
export type ExerciseMuscle = typeof EXERCISE_MUSCLES[number];
export type GoalUnit = typeof GOAL_UNITS[number];

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
  readonly aliases: readonly string[];
  readonly category: ExerciseCategory;
  readonly level: ExerciseLevel;
  readonly force: 'static' | 'pull' | 'push' | null;
  readonly mechanic: 'isolation' | 'compound' | null;
  readonly equipment: ExerciseEquipment | null;
  readonly primaryMuscles: readonly ExerciseMuscle[];
  readonly secondaryMuscles: readonly ExerciseMuscle[];
  /** Verbatim upstream English text. Empty source instructions remain empty. */
  readonly instructions: readonly string[];
  readonly instructionStatus: 'available' | 'partial' | 'missing';
  /** Pinned remote references only; media is not downloaded during startup. */
  readonly imageUrls: readonly string[];
  readonly mediaRights: 'unverified';
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
  readonly motionExercise: 'squat' | 'push-up';
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
