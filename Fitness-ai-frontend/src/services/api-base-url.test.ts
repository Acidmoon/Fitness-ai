import { describe, expect, it } from "vitest";

import { resolveApiBaseUrl } from "@/services/api-base-url";

describe("resolveApiBaseUrl", () => {
  it("uses configured API base URL", () => {
    expect(
      resolveApiBaseUrl({
        VITE_API_BASE_URL: "https://api.example.com",
        PROD: true,
      } as ImportMetaEnv)
    ).toBe("https://api.example.com");
  });

  it("uses localhost fallback outside production", () => {
    expect(resolveApiBaseUrl({ DEV: true, PROD: false } as ImportMetaEnv)).toBe(
      "http://127.0.0.1:8000"
    );
  });

  it("rejects missing production API base URL", () => {
    expect(() =>
      resolveApiBaseUrl({ PROD: true } as ImportMetaEnv)
    ).toThrow("VITE_API_BASE_URL must be set for production frontend builds");
  });
});
