import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { StatusBadge } from "@/components/StatusBadge";

describe("StatusBadge", () => {
  it("renders the provided label", () => {
    render(<StatusBadge label="已上传" tone="success" />);

    expect(screen.getByText("已上传")).toBeInTheDocument();
  });

  it("uses the warning tone class when requested", () => {
    render(<StatusBadge label="表现排行" tone="warning" />);

    expect(screen.getByText("表现排行")).toHaveClass("status-pill-warning");
  });
});
