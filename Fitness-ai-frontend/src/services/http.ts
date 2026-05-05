import axios from "axios";
import type { AxiosError, InternalAxiosRequestConfig } from "axios";

import { resolveApiBaseUrl } from "@/services/api-base-url";
import { clearAccessToken, getAccessToken } from "@/services/auth-storage";

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

export function handleAuthError(error: AxiosError) {
  if (error.response?.status === 401) {
    clearAccessToken();
  }

  return Promise.reject(error);
}

http.interceptors.request.use(attachBearerToken);
http.interceptors.response.use((response) => response, handleAuthError);
