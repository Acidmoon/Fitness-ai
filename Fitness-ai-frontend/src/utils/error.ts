import axios from "axios";

/**
 * Extract a human-readable error message from an Axios error.
 *
 * Handles both plain-string `detail` (400/500 responses) and structured
 * Pydantic/FastAPI validation error arrays (422 responses).
 */
export function extractApiErrorMessage(
  error: unknown,
  fallback: string,
): string {
  if (!axios.isAxiosError(error)) {
    return fallback;
  }

  const detail = error.response?.data?.detail;

  if (typeof detail === "string") {
    return detail || fallback;
  }

  if (Array.isArray(detail)) {
    const messages = detail
      .map((item: { msg?: string }) => item.msg)
      .filter((m): m is string => typeof m === "string")
      .map((m) => m.replace(/^Value error,\s*/, ""));
    return messages.length > 0 ? messages[0] : fallback;
  }

  return fallback;
}
