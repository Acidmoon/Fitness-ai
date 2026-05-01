import { describe, expect, it, vi } from "vitest";

import { http } from "@/services/http";
import {
  applyPoseScoring,
  getPoseAnalysis,
  previewPoseScoring,
  triggerPoseAnalysis,
} from "@/services/pose-analysis-api";

vi.mock("@/services/http", () => ({
  http: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

describe("pose-analysis-api", () => {
  it("fetches a record pose analysis result", async () => {
    vi.mocked(http.get).mockResolvedValue({ data: { status: "idle" } });

    const result = await getPoseAnalysis(11);

    expect(http.get).toHaveBeenCalledWith("/api/ai/records/11/pose-analysis");
    expect(result.status).toBe("idle");
  });

  it("triggers pose analysis with sample fps", async () => {
    vi.mocked(http.post).mockResolvedValue({ data: { status: "done" } });

    const result = await triggerPoseAnalysis(11, 5);

    expect(http.post).toHaveBeenCalledWith("/api/ai/records/11/pose-analysis", {
      sample_fps: 5,
    });
    expect(result.status).toBe("done");
  });

  it("previews pose scoring without applying results", async () => {
    vi.mocked(http.post).mockResolvedValue({ data: { status: "scored" } });

    const result = await previewPoseScoring(11);

    expect(http.post).toHaveBeenCalledWith("/api/ai/records/11/pose-scoring", {
      apply: false,
    });
    expect(result.status).toBe("scored");
  });

  it("applies pose scoring explicitly", async () => {
    vi.mocked(http.post).mockResolvedValue({
      data: { status: "scored", applied: true },
    });

    const result = await applyPoseScoring(11);

    expect(http.post).toHaveBeenCalledWith("/api/ai/records/11/pose-scoring", {
      apply: true,
    });
    expect(result.applied).toBe(true);
  });
});
