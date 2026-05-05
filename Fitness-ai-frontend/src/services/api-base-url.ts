type ViteEnv = ImportMetaEnv & {
  readonly DEV?: boolean;
  readonly PROD?: boolean;
};

const DEVELOPMENT_API_BASE_URL = "http://127.0.0.1:8000";

export function resolveApiBaseUrl(env: ViteEnv = import.meta.env) {
  const configuredBaseUrl = env.VITE_API_BASE_URL?.trim();

  if (configuredBaseUrl) {
    return configuredBaseUrl;
  }

  if (env.PROD) {
    throw new Error(
      "VITE_API_BASE_URL must be set for production frontend builds"
    );
  }

  return DEVELOPMENT_API_BASE_URL;
}
