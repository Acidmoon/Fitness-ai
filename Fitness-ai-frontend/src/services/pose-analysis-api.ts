import { http } from "@/services/http";
import type { PoseAnalysisResult } from "@/types/pose-analysis";
import type { PoseScoringResult } from "@/types/pose-scoring";

export async function getPoseAnalysis(recordId: number) {
  const { data } = await http.get<PoseAnalysisResult>(
    `/api/ai/records/${recordId}/pose-analysis`
  );
  return data;
}

export async function triggerPoseAnalysis(recordId: number, sampleFps?: number) {
  const { data } = await http.post<PoseAnalysisResult>(
    `/api/ai/records/${recordId}/pose-analysis`,
    sampleFps ? { sample_fps: sampleFps } : {}
  );
  return data;
}

export async function previewPoseScoring(recordId: number) {
  const { data } = await http.post<PoseScoringResult>(
    `/api/ai/records/${recordId}/pose-scoring`,
    { apply: false }
  );
  return data;
}

export async function applyPoseScoring(recordId: number) {
  const { data } = await http.post<PoseScoringResult>(
    `/api/ai/records/${recordId}/pose-scoring`,
    { apply: true }
  );
  return data;
}
