import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import axios from "axios";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RecordDetailPage } from "@/pages/RecordDetailPage";
import * as exerciseApi from "@/services/exercise-api";
import * as poseAnalysisApi from "@/services/pose-analysis-api";
import * as videoApi from "@/services/video-api";

vi.mock("@/services/exercise-api", () => ({
  getExercises: vi.fn(),
  getRecordDetail: vi.fn(),
}));

vi.mock("@/services/video-api", () => ({
  deleteVideo: vi.fn(),
  fetchVideoBlob: vi.fn(),
  uploadVideo: vi.fn(),
}));

vi.mock("@/services/pose-analysis-api", () => ({
  applyPoseScoring: vi.fn(),
  createPoseAnalysisJob: vi.fn(),
  getPoseAnalysisJob: vi.fn(),
  getPoseAnalysis: vi.fn(),
  previewPoseScoring: vi.fn(),
  triggerPoseAnalysis: vi.fn(),
}));

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
      mutations: {
        retry: false,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/records/11"]}>
        <Routes>
          <Route path="/records/:recordId" element={<RecordDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("RecordDetailPage", () => {
  beforeEach(() => {
    vi.mocked(exerciseApi.getExercises).mockResolvedValue([
      {
        id: 1,
        name: "标准俯卧撑",
        category: "上肢",
        description: "desc",
      },
    ]);
    vi.mocked(poseAnalysisApi.getPoseAnalysis).mockResolvedValue({
      record_id: 11,
      schema_version: 1,
      status: "idle",
      model: null,
      summary: null,
      frames: [],
      error: null,
    });
    vi.mocked(poseAnalysisApi.getPoseAnalysisJob).mockResolvedValue({
      id: 77,
      record_id: 11,
      status: "succeeded",
      error: null,
      result_summary: null,
      created_at: "2026-03-11T08:00:00Z",
      updated_at: "2026-03-11T08:00:01Z",
      completed_at: "2026-03-11T08:00:01Z",
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("shows the upload error message when upload fails", async () => {
    vi.mocked(exerciseApi.getRecordDetail).mockResolvedValue({
      id: 11,
      exercise_id: 1,
      score: 89,
      count: 14,
      duration: 65,
      heart_rate_avg: 126,
      video_url: null,
      feedback: null,
      created_at: "2026-03-11T08:00:00Z",
    });
    vi.mocked(videoApi.uploadVideo).mockRejectedValue(
      axios.AxiosError.from(new Error("upload failed"), undefined, undefined, undefined, {
        data: { detail: "视频上传失败" },
        status: 400,
        statusText: "Bad Request",
        headers: {},
        config: {} as never,
      })
    );

    const view = renderPage();

    await screen.findByText("当前记录还没有关联视频。");
    const fileInput = view.container.querySelector('input[type="file"]') as HTMLInputElement | null;
    expect(fileInput).not.toBeNull();
    fireEvent.change(fileInput as HTMLInputElement, {
      target: {
        files: [new File(["demo"], "demo.mp4", { type: "video/mp4" })],
      },
    });

    expect(await screen.findByText("视频上传失败")).toBeInTheDocument();
  });

  it("does not show pose analysis action when no video exists", async () => {
    vi.mocked(exerciseApi.getRecordDetail).mockResolvedValue({
      id: 11,
      exercise_id: 1,
      score: 89,
      count: 14,
      duration: 65,
      heart_rate_avg: 126,
      video_url: null,
      feedback: null,
      created_at: "2026-03-11T08:00:00Z",
    });

    renderPage();

    expect(await screen.findByText("上传视频后可开始姿态分析。")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "开始姿态分析" })
    ).not.toBeInTheDocument();
  });

  it("shows pose analysis summary for completed analysis", async () => {
    vi.mocked(exerciseApi.getRecordDetail).mockResolvedValue({
      id: 11,
      exercise_id: 1,
      score: 89,
      count: 14,
      duration: 65,
      heart_rate_avg: 126,
      video_url: "/videos/demo.mp4",
      feedback: null,
      created_at: "2026-03-11T08:00:00Z",
    });
    vi.mocked(poseAnalysisApi.getPoseAnalysis).mockResolvedValue({
      record_id: 11,
      schema_version: 1,
      status: "done",
      model: { name: "thunder", input_size: 256 },
      summary: {
        total_frames: 30,
        processed_frames: 30,
        sampled_frames: 5,
        valid_frame_count: 5,
        average_confidence: 0.88,
        source_fps: 30,
        sample_fps: 5,
      },
      frames: [],
      error: null,
    });

    renderPage();

    expect(await screen.findAllByText("分析完成")).toHaveLength(2);
    expect(screen.getByText("5 帧")).toBeInTheDocument();
    expect(screen.getByText("88%")).toBeInTheDocument();
    expect(screen.getByText("进入动作评分")).toBeInTheDocument();
  });

  it("previews pose scoring after analysis completes", async () => {
    vi.mocked(exerciseApi.getRecordDetail).mockResolvedValue({
      id: 11,
      exercise_id: 1,
      score: 89,
      count: 14,
      duration: 65,
      heart_rate_avg: 126,
      video_url: "/videos/demo.mp4",
      feedback: null,
      created_at: "2026-03-11T08:00:00Z",
    });
    vi.mocked(poseAnalysisApi.getPoseAnalysis).mockResolvedValue({
      record_id: 11,
      schema_version: 1,
      status: "done",
      model: { name: "thunder", input_size: 256 },
      summary: {
        total_frames: 30,
        processed_frames: 30,
        sampled_frames: 5,
        valid_frame_count: 5,
        average_confidence: 0.88,
        source_fps: 30,
        sample_fps: 5,
      },
      frames: [],
      error: null,
    });
    vi.mocked(poseAnalysisApi.previewPoseScoring).mockResolvedValue({
      record_id: 11,
      status: "scored",
      applied: false,
      exercise_type: "push_up",
      score: 96,
      count: 2,
      confidence: 0.91,
      feedback: ["动作轨迹完整"],
      metrics: {
        valid_frames: 5,
        angle_range: 66,
      },
    });

    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "预览动作评分" }));

    expect(await screen.findByText("AI 评分预览已生成。")).toBeInTheDocument();
    expect(screen.getByText("96 分")).toBeInTheDocument();
    expect(screen.getByText("2 次")).toBeInTheDocument();
    expect(screen.getByText("91%")).toBeInTheDocument();
    expect(screen.getByText("动作轨迹完整")).toBeInTheDocument();
    expect(poseAnalysisApi.previewPoseScoring).toHaveBeenCalledWith(11);
  });

  it("shows unsupported scoring without enabling apply", async () => {
    vi.mocked(exerciseApi.getRecordDetail).mockResolvedValue({
      id: 11,
      exercise_id: 1,
      score: 89,
      count: 14,
      duration: 65,
      heart_rate_avg: 126,
      video_url: "/videos/demo.mp4",
      feedback: null,
      created_at: "2026-03-11T08:00:00Z",
    });
    vi.mocked(poseAnalysisApi.getPoseAnalysis).mockResolvedValue({
      record_id: 11,
      schema_version: 1,
      status: "done",
      model: { name: "thunder", input_size: 256 },
      summary: {
        total_frames: 30,
        processed_frames: 30,
        sampled_frames: 5,
        valid_frame_count: 5,
        average_confidence: 0.88,
        source_fps: 30,
        sample_fps: 5,
      },
      frames: [],
      error: null,
    });
    vi.mocked(poseAnalysisApi.previewPoseScoring).mockResolvedValue({
      record_id: 11,
      status: "unsupported",
      applied: false,
      exercise_type: null,
      score: null,
      count: null,
      confidence: null,
      feedback: ["当前动作暂不支持姿态评分"],
      metrics: {},
    });

    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "预览动作评分" }));

    expect(await screen.findByText("当前动作暂不支持 AI 评分。")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "应用 AI 评分" })).toBeDisabled();
  });

  it("applies pose scoring after explicit confirmation", async () => {
    vi.stubGlobal("confirm", vi.fn(() => true));
    vi.mocked(exerciseApi.getRecordDetail).mockResolvedValue({
      id: 11,
      exercise_id: 1,
      score: 89,
      count: 14,
      duration: 65,
      heart_rate_avg: 126,
      video_url: "/videos/demo.mp4",
      feedback: null,
      created_at: "2026-03-11T08:00:00Z",
    });
    vi.mocked(poseAnalysisApi.getPoseAnalysis).mockResolvedValue({
      record_id: 11,
      schema_version: 1,
      status: "done",
      model: { name: "thunder", input_size: 256 },
      summary: {
        total_frames: 30,
        processed_frames: 30,
        sampled_frames: 5,
        valid_frame_count: 5,
        average_confidence: 0.88,
        source_fps: 30,
        sample_fps: 5,
      },
      frames: [],
      error: null,
    });
    vi.mocked(poseAnalysisApi.previewPoseScoring).mockResolvedValue({
      record_id: 11,
      status: "scored",
      applied: false,
      exercise_type: "push_up",
      score: 96,
      count: 2,
      confidence: 0.91,
      feedback: ["动作轨迹完整"],
      metrics: { valid_frames: 5 },
    });
    vi.mocked(poseAnalysisApi.applyPoseScoring).mockResolvedValue({
      record_id: 11,
      status: "scored",
      applied: true,
      exercise_type: "push_up",
      score: 96,
      count: 2,
      confidence: 0.91,
      feedback: ["动作轨迹完整"],
      metrics: { valid_frames: 5 },
    });

    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "预览动作评分" }));
    await screen.findByText("96 分");
    fireEvent.click(screen.getByRole("button", { name: "应用 AI 评分" }));

    expect(await screen.findByText("AI 评分已应用。")).toBeInTheDocument();
    expect(poseAnalysisApi.applyPoseScoring).toHaveBeenCalledWith(11);
  });

  it("disables pose scoring before analysis completes", async () => {
    vi.mocked(exerciseApi.getRecordDetail).mockResolvedValue({
      id: 11,
      exercise_id: 1,
      score: 89,
      count: 14,
      duration: 65,
      heart_rate_avg: 126,
      video_url: "/videos/demo.mp4",
      feedback: null,
      created_at: "2026-03-11T08:00:00Z",
    });

    renderPage();

    expect(await screen.findByRole("button", { name: "预览动作评分" })).toBeDisabled();
    expect(screen.getByText("完成姿态分析后可预览动作评分。")).toBeInTheDocument();
  });

  it("triggers pose analysis and refreshes data", async () => {
    vi.mocked(exerciseApi.getRecordDetail).mockResolvedValue({
      id: 11,
      exercise_id: 1,
      score: 89,
      count: 14,
      duration: 65,
      heart_rate_avg: 126,
      video_url: "/videos/demo.mp4",
      feedback: null,
      created_at: "2026-03-11T08:00:00Z",
    });
    vi.mocked(poseAnalysisApi.createPoseAnalysisJob).mockResolvedValue({
      id: 77,
      record_id: 11,
      status: "queued",
      error: null,
      result_summary: null,
      created_at: "2026-03-11T08:00:00Z",
      updated_at: "2026-03-11T08:00:00Z",
      completed_at: null,
    });

    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "开始姿态分析" }));

    expect(await screen.findByText("姿态分析完成。")).toBeInTheDocument();
    expect(poseAnalysisApi.createPoseAnalysisJob).toHaveBeenCalledWith(11);
    expect(poseAnalysisApi.getPoseAnalysisJob).toHaveBeenCalledWith(77);
  });

  it("shows failed pose analysis job state", async () => {
    vi.mocked(exerciseApi.getRecordDetail).mockResolvedValue({
      id: 11,
      exercise_id: 1,
      score: 89,
      count: 14,
      duration: 65,
      heart_rate_avg: 126,
      video_url: "/videos/demo.mp4",
      feedback: null,
      created_at: "2026-03-11T08:00:00Z",
    });
    vi.mocked(poseAnalysisApi.createPoseAnalysisJob).mockResolvedValue({
      id: 78,
      record_id: 11,
      status: "queued",
      error: null,
      result_summary: null,
      created_at: "2026-03-11T08:00:00Z",
      updated_at: "2026-03-11T08:00:00Z",
      completed_at: null,
    });
    vi.mocked(poseAnalysisApi.getPoseAnalysisJob).mockResolvedValue({
      id: 78,
      record_id: 11,
      status: "failed",
      error: "姿态分析失败",
      result_summary: null,
      created_at: "2026-03-11T08:00:00Z",
      updated_at: "2026-03-11T08:00:01Z",
      completed_at: "2026-03-11T08:00:01Z",
    });

    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "开始姿态分析" }));

    expect(await screen.findByText("姿态分析失败")).toBeInTheDocument();
  });

  it("shows the preview error message when preview fails", async () => {
    vi.mocked(exerciseApi.getRecordDetail).mockResolvedValue({
      id: 11,
      exercise_id: 1,
      score: 89,
      count: 14,
      duration: 65,
      heart_rate_avg: 126,
      video_url: "/videos/demo.mp4",
      feedback: "稳定",
      created_at: "2026-03-11T08:00:00Z",
    });
    vi.mocked(videoApi.fetchVideoBlob).mockRejectedValue(
      axios.AxiosError.from(new Error("preview failed"), undefined, undefined, undefined, {
        data: { detail: "视频预览失败" },
        status: 404,
        statusText: "Not Found",
        headers: {},
        config: {} as never,
      })
    );

    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "预览视频" }));

    expect(await screen.findByText("视频预览失败")).toBeInTheDocument();
  });
});
