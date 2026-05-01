import { afterEach, describe, expect, it } from "vitest";

import {
  clearAccessToken,
  getAccessToken,
  isAuthenticated,
  setAccessToken,
} from "@/services/auth-storage";

describe("auth-storage", () => {
  afterEach(() => {
    clearAccessToken();
  });

  it("stores and reads the access token", () => {
    setAccessToken("token-123");

    expect(getAccessToken()).toBe("token-123");
    expect(isAuthenticated()).toBe(true);
  });

  it("clears the access token", () => {
    setAccessToken("token-123");
    clearAccessToken();

    expect(getAccessToken()).toBeNull();
    expect(isAuthenticated()).toBe(false);
  });
});
