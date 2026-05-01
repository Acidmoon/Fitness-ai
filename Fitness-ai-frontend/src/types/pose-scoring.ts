export type PoseScoringStatus = "scored" | "unsupported";

export interface PoseScoringPhase {
  phase: string;
  frame_index: number;
  timestamp_ms: number;
  angle: number;
}

export interface PoseScoringMetrics {
  valid_frames?: number;
  min_angle?: number;
  max_angle?: number;
  angle_range?: number;
  phases?: PoseScoringPhase[];
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
