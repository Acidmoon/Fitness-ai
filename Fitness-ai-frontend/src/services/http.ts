import axios from "axios";
import type { AxiosError, InternalAxiosRequestConfig } from "axios";

import { resolveApiBaseUrl } from "@/services/api-base-url";
import {
  clearAuth,
  getAccessToken,
  getRefreshToken,
  setAccessToken,
  setRefreshToken,
} from "@/services/auth-storage";

export const http = axios.create({
  baseURL: resolveApiBaseUrl(),
  timeout: 10000,
});

export function attachBearerToken(config: InternalAxiosRequestConfig) {
  const token = getAccessToken();

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
}

/* ------------------------------------------------------------------ */
/*  Refresh-token interceptor                                         */
/*  On 401: try POST /auth/refresh → retry original request once.     */
/*  If refresh also fails → clear auth → redirect to /login.          */
/* ------------------------------------------------------------------ */
let isRefreshing = false;
let pendingRefresh: Promise<string | null> | null = null;

async function tryRefresh(): Promise<string | null> {
  if (pendingRefresh) return pendingRefresh;

  const refreshToken = getRefreshToken();
  if (!refreshToken) return null;

  isRefreshing = true;
  pendingRefresh = (async () => {
    try {
      const { data } = await axios.post<{
        access_token: string;
        refresh_token: string;
      }>(`${resolveApiBaseUrl()}/api/auth/refresh`, {
        refresh_token: refreshToken,
      });
      setAccessToken(data.access_token);
      setRefreshToken(data.refresh_token);
      return data.access_token;
    } catch {
      clearAuth();
      return null;
    } finally {
      isRefreshing = false;
      pendingRefresh = null;
    }
  })();

  return pendingRefresh;
}

function redirectToLogin() {
  if (window.location.pathname !== "/login") {
    window.location.href = "/login";
  }
}

http.interceptors.request.use(attachBearerToken);

http.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
    };

    if (error.response?.status === 401 && !originalRequest._retry) {
      // Skip refresh for the refresh endpoint itself
      if (originalRequest.url?.endsWith("/auth/refresh")) {
        clearAuth();
        redirectToLogin();
        return Promise.reject(error);
      }

      originalRequest._retry = true;
      const newToken = await tryRefresh();
      if (newToken) {
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return http(originalRequest);
      }

      redirectToLogin();
    }

    return Promise.reject(error);
  },
);
