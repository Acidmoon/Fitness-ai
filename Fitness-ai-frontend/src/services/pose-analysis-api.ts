import { http } from "@/services/http";
import type { components } from "@/api/types";
import type { PoseAnalysisJob, PoseAnalysisResult } from "@/types/pose-analysis";
import type { PoseScoringResult } from "@/types/pose-scoring";

type PoseAnalysisJobContract = components["schemas"]["PoseAnalysisJobResponse"];

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

export async function createPoseAnalysisJob(recordId: number, sampleFps?: number) {
  const { data } = await http.post<PoseAnalysisJobContract>(
    `/api/ai/records/${recordId}/pose-analysis/jobs`,
    sampleFps ? { sample_fps: sampleFps } : {}
  );
  return data as PoseAnalysisJob;
}

export async function getPoseAnalysisJob(jobId: number) {
  const { data } = await http.get<PoseAnalysisJobContract>(
    `/api/ai/pose-analysis/jobs/${jobId}`
  );
  return data as PoseAnalysisJob;
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
