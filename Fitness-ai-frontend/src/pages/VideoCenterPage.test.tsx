import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import axios from "axios";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { VideoCenterPage } from "@/pages/VideoCenterPage";
import * as exerciseApi from "@/services/exercise-api";
import * as videoApi from "@/services/video-api";

vi.mock("@/services/exercise-api", () => ({
  getExercises: vi.fn(),
  getRecords: vi.fn(),
}));

vi.mock("@/services/video-api", () => ({
  deleteVideo: vi.fn(),
  fetchVideoBlob: vi.fn(),
  uploadVideo: vi.fn(),
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
      <MemoryRouter>
        <VideoCenterPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("VideoCenterPage", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders empty states for both sections when no records exist", async () => {
    vi.mocked(exerciseApi.getExercises).mockResolvedValue([]);
    vi.mocked(exerciseApi.getRecords).mockResolvedValue([]);

    renderPage();

    expect(await screen.findByText("已上传视频为空")).toBeInTheDocument();
    expect(screen.getByText("待上传记录为空")).toBeInTheDocument();
  });

  it("splits uploaded and pending records into separate sections", async () => {
    vi.mocked(exerciseApi.getExercises).mockResolvedValue([
      {
        id: 1,
        name: "标准俯卧撑",
        category: "上肢",
        description: "desc",
      },
    ]);
    vi.mocked(exerciseApi.getRecords).mockResolvedValue([
      {
        id: 11,
        exercise_id: 1,
        score: 90,
        count: 15,
        duration: 70,
        heart_rate_avg: 126,
        video_url: "/videos/demo.mp4",
        feedback: "稳定",
        created_at: "2026-03-11T08:00:00Z",
      },
      {
        id: 12,
        exercise_id: 1,
        score: 82,
        count: 11,
        duration: 55,
        heart_rate_avg: null,
        video_url: null,
        feedback: null,
        created_at: "2026-03-11T09:00:00Z",
      },
    ]);
    vi.mocked(videoApi.deleteVideo).mockResolvedValue({ message: "ok" });
    vi.mocked(videoApi.fetchVideoBlob).mockResolvedValue(new Blob());
    vi.mocked(videoApi.uploadVideo).mockResolvedValue({
      message: "ok",
      video_url: "/videos/demo.mp4",
      file_size: 1,
      video_deleted: false,
      note: "ok",
    });

    renderPage();

    expect(await screen.findByText("记录 ID：11")).toBeInTheDocument();
    expect(screen.getByText("记录 ID：12")).toBeInTheDocument();
    expect(screen.getByText("已上传")).toBeInTheDocument();
    expect(screen.getByText("待上传")).toBeInTheDocument();
  });

  it("shows the upload error message when a pending record upload fails", async () => {
    vi.mocked(exerciseApi.getExercises).mockResolvedValue([
      {
        id: 1,
        name: "标准俯卧撑",
        category: "上肢",
        description: "desc",
      },
    ]);
    vi.mocked(exerciseApi.getRecords).mockResolvedValue([
      {
        id: 12,
        exercise_id: 1,
        score: 82,
        count: 11,
        duration: 55,
        heart_rate_avg: null,
        video_url: null,
        feedback: null,
        created_at: "2026-03-11T09:00:00Z",
      },
    ]);
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

    await screen.findByText("记录 ID：12");
    const fileInput = view.container.querySelector('input[type="file"]') as HTMLInputElement | null;
    expect(fileInput).not.toBeNull();
    fireEvent.change(fileInput as HTMLInputElement, {
      target: {
        files: [new File(["demo"], "demo.mp4", { type: "video/mp4" })],
      },
    });

    expect(await screen.findByText("视频上传失败")).toBeInTheDocument();
  });

  it("shows an in-progress upload state for the pending record being uploaded", async () => {
    vi.mocked(exerciseApi.getExercises).mockResolvedValue([
      {
        id: 1,
        name: "标准俯卧撑",
        category: "上肢",
        description: "desc",
      },
    ]);
    vi.mocked(exerciseApi.getRecords).mockResolvedValue([
      {
        id: 12,
        exercise_id: 1,
        score: 82,
        count: 11,
        duration: 55,
        heart_rate_avg: null,
        video_url: null,
        feedback: null,
        created_at: "2026-03-11T09:00:00Z",
      },
    ]);
    vi.mocked(videoApi.uploadVideo).mockImplementation(
      () =>
        new Promise(() => {
          return undefined;
        })
    );

    const view = renderPage();

    await screen.findByText("记录 ID：12");
    const fileInput = view.container.querySelector('input[type="file"]') as HTMLInputElement | null;
    expect(fileInput).not.toBeNull();
    fireEvent.change(fileInput as HTMLInputElement, {
      target: {
        files: [new File(["demo"], "demo.mp4", { type: "video/mp4" })],
      },
    });

    expect(await screen.findByText("当前正在上传该记录的视频，请稍候。")).toBeInTheDocument();
    expect(screen.getByText("上传中")).toBeInTheDocument();
  });
});
