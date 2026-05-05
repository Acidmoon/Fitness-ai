export type PoseAnalysisStatus = "idle" | "done" | "failed";
export type PoseAnalysisJobStatus = "queued" | "running" | "succeeded" | "failed";

export interface PoseAnalysisModelMetadata {
  name: string | null;
  input_size: number | null;
}

export interface PoseAnalysisSummary {
  total_frames: number;
  processed_frames: number;
  sampled_frames: number;
  valid_frame_count: number;
  average_confidence: number;
  source_fps: number | null;
  sample_fps: number;
}

export interface PoseAnalysisKeypoint {
  name: string;
  x: number;
  y: number;
  score: number;
}

export interface PoseAnalysisFrame {
  frame_index: number;
  timestamp_ms: number;
  keypoints: PoseAnalysisKeypoint[];
}

export interface PoseAnalysisResult {
  record_id: number;
  schema_version: number;
  status: PoseAnalysisStatus;
  model: PoseAnalysisModelMetadata | null;
  summary: PoseAnalysisSummary | null;
  frames: PoseAnalysisFrame[];
  error: string | null;
}

export interface PoseAnalysisJob {
  id: number;
  record_id: number;
  status: PoseAnalysisJobStatus;
  error: string | null;
  result_summary: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}
