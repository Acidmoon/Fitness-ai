import type {} from 'cordis';
import type { AuthPrincipal } from './auth-contracts.ts';
import type { AdviceResult, ScoreResult } from './contracts.ts';

/**
 * Workout history contract.
 *
 * Every call takes an {@link AuthPrincipal}: the tenant and user always come
 * from a verified session, never from a request body. Calls are tenant-scoped by
 * row level security, so a principal from one tenant cannot read another.
 *
 * Only the normalized outcome is stored: the score dimensions, the advice items
 * and the repetition aggregates. Skeletons, keypoint time series and the source
 * video are not stored here.
 */

export type WorkoutSource = 'video' | 'json';

export interface WorkoutRecordInput {
  readonly schemaVersion: '1.0';
  /** Caller-supplied session identifier of the underlying assessment. */
  readonly sessionId: string;
  readonly exercise: string;
  readonly targetRepetitions: number;
  readonly observedRepetitions: number;
  readonly score: ScoreResult;
  readonly advice: AdviceResult;
  readonly source: WorkoutSource;
  /** When the movement happened; defaults to the write time when omitted. */
  readonly capturedAt?: string;
}

/** Compact row used by list responses. */
export interface WorkoutSummary {
  readonly id: string;
  readonly exercise: string;
  readonly total: number;
  readonly observedRepetitions: number;
  readonly targetRepetitions: number;
  readonly source: WorkoutSource;
  readonly capturedAt: string;
  readonly createdAt: string;
}

export interface WorkoutRecord extends WorkoutSummary {
  readonly schemaVersion: '1.0';
  readonly sessionId: string;
  readonly score: ScoreResult;
  readonly advice: AdviceResult;
}

export interface WorkoutPage {
  readonly schemaVersion: '1.0';
  readonly items: readonly WorkoutSummary[];
  readonly nextCursor: string | null;
}

export interface WorkoutQuery {
  readonly limit?: number;
  /** Opaque cursor taken from `WorkoutPage.nextCursor`. */
  readonly after?: string;
  readonly exercise?: string;
  /** Inclusive ISO 8601 lower bound on `capturedAt`. */
  readonly from?: string;
  /** Inclusive ISO 8601 upper bound on `capturedAt`. */
  readonly to?: string;
}

export interface WorkoutStatistics {
  readonly schemaVersion: '1.0';
  readonly totalWorkouts: number;
  readonly totalObservedRepetitions: number;
  readonly lastCapturedAt: string | null;
  readonly byExercise: readonly {
    readonly exercise: string;
    readonly workouts: number;
    readonly averageScore: number;
  }[];
}

export interface FitnessWorkoutHistory {
  record(principal: AuthPrincipal, value: unknown): Promise<WorkoutRecord>;
  list(principal: AuthPrincipal, query?: WorkoutQuery): Promise<WorkoutPage>;
  /**
   * Reads one record. A record belonging to another tenant or user is
   * indistinguishable from a missing one: both reject with `WORKOUT_NOT_FOUND`.
   */
  get(principal: AuthPrincipal, id: string): Promise<WorkoutRecord>;
  /** Deletes one record; a missing or foreign record rejects with `WORKOUT_NOT_FOUND`. */
  remove(principal: AuthPrincipal, id: string): Promise<void>;
  statistics(principal: AuthPrincipal): Promise<WorkoutStatistics>;
}

declare module 'cordis' {
  interface Context {
    fitnessWorkoutHistory: FitnessWorkoutHistory;
  }
}
