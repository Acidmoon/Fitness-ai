export type PoseScoringStatus = "scored" | "unsupported";

export interface PoseScoringPhase {
  phase: string;
  frame_index: number;
  timestamp_ms: number;
  angle: number;
}

export type PoseErrorSeverity = "none" | "minor" | "major";

export interface PoseScoringError {
  code: string;
  label: string;
  severity: PoseErrorSeverity;
  feedback: string;
  evidence: Record<string, unknown>;
}

export interface PoseScoringMetrics {
  valid_frames?: number;
  min_angle?: number;
  max_angle?: number;
  angle_range?: number;
  phases?: PoseScoringPhase[];
  errors?: PoseScoringError[];
  [key: string]: unknown;
}

export interface PoseScoringResult {
  record_id: number;
  status: PoseScoringStatus;
  applied: boolean;
  exercise_type: string | null;
  score: number | null;
  count: number | null;
  confidence: number | null;
  feedback: string[];
  metrics: PoseScoringMetrics;
}
