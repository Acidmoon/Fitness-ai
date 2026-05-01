import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RecordsPage } from "@/pages/RecordsPage";
import * as exerciseApi from "@/services/exercise-api";

vi.mock("@/services/exercise-api", () => ({
  batchDeleteRecords: vi.fn(),
  createRecord: vi.fn(),
  deleteRecord: vi.fn(),
  getExercises: vi.fn(),
  getRecords: vi.fn(),
  updateRecord: vi.fn(),
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
        <RecordsPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("RecordsPage", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders the shared empty state when there are no records", async () => {
    vi.mocked(exerciseApi.getExercises).mockResolvedValue([
      {
        id: 1,
        name: "标准俯卧撑",
        category: "上肢",
        description: "desc",
      },
    ]);
    vi.mocked(exerciseApi.getRecords).mockResolvedValue([]);

    renderPage();

    expect(await screen.findByText("暂无训练记录")).toBeInTheDocument();
    expect(screen.getByText("现在还没有训练记录。")).toBeInTheDocument();
  });

  it("shows the video status badges for records", async () => {
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
        id: 101,
        exercise_id: 1,
        score: 92,
        count: 18,
        duration: 75,
        heart_rate_avg: 128,
        video_url: "/videos/a.mp4",
        feedback: "动作稳定",
        created_at: "2026-03-11T08:00:00Z",
      },
      {
        id: 102,
        exercise_id: 1,
        score: 86,
        count: 12,
        duration: 60,
        heart_rate_avg: null,
        video_url: null,
        feedback: null,
        created_at: "2026-03-11T09:00:00Z",
      },
    ]);

    renderPage();

    expect(await screen.findByText("动作稳定")).toBeInTheDocument();
    expect(screen.getByText("已关联视频")).toBeInTheDocument();
    expect(screen.getByText("待上传视频")).toBeInTheDocument();
  });
});
