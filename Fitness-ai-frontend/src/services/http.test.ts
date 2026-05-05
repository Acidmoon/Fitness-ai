import type { AxiosError, InternalAxiosRequestConfig } from "axios";
import { beforeEach, describe, expect, it } from "vitest";

import { clearAccessToken, getAccessToken, setAccessToken } from "@/services/auth-storage";
import { attachBearerToken, handleAuthError } from "@/services/http";

describe("http auth behavior", () => {
  beforeEach(() => {
    clearAccessToken();
  });

  it("attaches bearer token to API requests", () => {
    setAccessToken("token-123");

    const config = attachBearerToken({
      headers: {},
    } as InternalAxiosRequestConfig);

    expect(config.headers.Authorization).toBe("Bearer token-123");
  });

  it("clears stored token on 401 responses", async () => {
    setAccessToken("token-123");
    const error = { response: { status: 401 } } as AxiosError;

    await expect(handleAuthError(error)).rejects.toBe(error);

    expect(getAccessToken()).toBeNull();
  });

  it("does not clear stored token on 403 responses", async () => {
    setAccessToken("token-123");
    const error = { response: { status: 403 } } as AxiosError;

    await expect(handleAuthError(error)).rejects.toBe(error);

    expect(getAccessToken()).toBe("token-123");
  });
});
