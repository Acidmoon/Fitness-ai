import type {} from 'cordis';

/** Normalized observations supplied by an upstream detector, not raw video. */
export interface Repetition {
  readonly rangeOfMotion: number;
  readonly stability: number;
  readonly durationMs: number;
  readonly confidence: number;
}

export interface WorkoutSession {
  readonly schemaVersion: '1.0';
  readonly sessionId: string;
  readonly exercise: string;
  readonly targetRepetitions: number;
  readonly repetitions: readonly Repetition[];
}

export type DimensionKey = 'completion' | 'rangeOfMotion' | 'stability' | 'tempo';

export interface PolicyReference {
  readonly id: string;
  readonly version: string;
  readonly kind: 'heuristic';
}

export interface ScoreDimension {
  readonly key: DimensionKey;
  readonly label: string;
  readonly value: number;
  readonly weight: number;
  readonly points: number;
}

export interface ScoreResult {
  readonly policy: PolicyReference;
  readonly standard?: { readonly exerciseId: string; readonly sourceRevision: string };
  readonly total: number;
  readonly dimensions: readonly ScoreDimension[];
  readonly quality: {
    readonly observedRepetitions: number;
    readonly evaluatedRepetitions: number;
    readonly excludedRepetitions: number;
  };
}

export interface AdviceItem {
  readonly code: string;
  readonly message: string;
}

export interface AdviceResult {
  readonly policy: PolicyReference;
  readonly items: readonly AdviceItem[];
}

export interface AssessmentResult {
  readonly schemaVersion: '1.0';
  readonly sessionId: string;
  readonly exercise: string;
  readonly score: ScoreResult;
  readonly advice: AdviceResult;
}

export interface FitnessInput {
  parse(value: unknown): WorkoutSession;
  load(path: string): Promise<unknown>;
}

export interface FitnessScoring {
  score(session: WorkoutSession): ScoreResult;
}

export interface FitnessAdvice {
  recommend(session: WorkoutSession, score: ScoreResult): AdviceResult;
}

export interface FitnessAssessment {
  evaluate(value: unknown): AssessmentResult;
}

export interface FitnessCli {
  run(args: readonly string[]): Promise<void>;
}

export type FitnessErrorCode =
  | 'INVALID_WORKOUT'
  | 'UNSUPPORTED_EXERCISE'
  | 'STANDARD_UNAVAILABLE'
  | 'INVALID_EXERCISE_DATA'
  | 'CATALOG_INVALID'
  | 'INSUFFICIENT_DATA'
  | 'INVALID_ARGUMENTS'
  | 'INPUT_IO'
  | 'INVALID_JSON'
  | 'VIDEO_INVALID'
  | 'MODEL_UNAVAILABLE'
  | 'INFERENCE_FAILED'
  | 'INFERENCE_BUSY'
  | 'POSE_INVALID'
  | 'ARTIFACT_IO'
  | 'DATABASE_CONFIG'
  | 'DATABASE_UNAVAILABLE'
  | 'DATABASE_TIMEOUT'
  | 'DATABASE_BUSY'
  | 'DATABASE_CLOSED'
  | 'DATABASE_TRANSACTION_UNKNOWN'
  | 'DATABASE_MIGRATION'
  | 'DATABASE_ROLE_UNSAFE'
  | 'USER_INVALID'
  | 'USER_NOT_FOUND'
  | 'USER_CONFLICT'
  | 'USER_VERSION_CONFLICT'
  | 'USER_STATE_CONFLICT'
  | 'TENANT_NOT_FOUND'
  | 'IDEMPOTENCY_CONFLICT'
  | 'DATA_PROTECTION_CONFIG'
  | 'DATA_PROTECTION_FAILED'
  | 'OUTBOX_LEASE_LOST'
  | 'CANCELLED';

export class FitnessError extends Error {
  readonly code: FitnessErrorCode;

  constructor(code: FitnessErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'FitnessError';
    this.code = code;
  }
}

declare module 'cordis' {
  interface Context {
    fitnessInput: FitnessInput;
    fitnessScoring: FitnessScoring;
    fitnessAdvice: FitnessAdvice;
    fitnessAssessment: FitnessAssessment;
    fitnessCli: FitnessCli;
  }

  interface Events {
    /** @mode emit — synchronous notification after a successful assessment. */
    'fitness/assessment-completed'(result: AssessmentResult): void;
  }
}
