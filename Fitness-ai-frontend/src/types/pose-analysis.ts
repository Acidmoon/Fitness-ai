export type PoseAnalysisStatus = "idle" | "done" | "failed";

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
