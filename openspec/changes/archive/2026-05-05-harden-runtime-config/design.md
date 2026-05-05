## Context

`Settings` currently supplies defaults for `DATABASE_URL` and `SECRET_KEY`. This is useful for early scaffolding, but it means a process can start even when secure configuration was not provided. The project already uses `pydantic-settings`, so validation can stay centralized in `app/config.py`.

## Goals / Non-Goals

**Goals:**
- Fail fast when production-like runtime configuration uses placeholder secrets or default database URLs.
- Keep the README development setup usable with a local `.env`.
- Make `.env.example` safe to commit and copy.
- Make frontend/backend split deployment explicit by documenting backend `ALLOWED_ORIGINS` and frontend `VITE_API_BASE_URL`.
- Prevent production frontend bundles from silently targeting a localhost backend.

**Non-Goals:**
- Replace pydantic-settings.
- Introduce a secret manager.
- Change JWT algorithms or token payload shape.
- Introduce API gateway or reverse-proxy-specific configuration.

## Decisions

- Add an explicit environment setting such as `ENVIRONMENT=development`.
  Rationale: strict production checks need a clear switch, while local setup should remain simple.

- Validate sensitive settings in the settings layer.
  Rationale: `app/config.py` is imported by database, security, CORS, and logging code, so invalid configuration is caught before dependent modules use it.

- Reject known placeholder values in non-development environments.
  Rationale: deployments should not run with `your-secret-key-change-in-production`, `your-random-secret-key-here-use-openssl-rand-hex-32`, or the default database URL.

- Keep `.env.example` as a placeholder template only.
  Rationale: example files should document shape, not resemble real credentials.

- Treat frontend API base URL as a required production build input.
  Rationale: the frontend already calls the backend through `VITE_API_BASE_URL`, but a localhost fallback is unsafe for production bundles because a missing environment variable can produce a build that cannot reach the deployed API.

- Keep CORS allowlisting on the backend instead of depending on a proxy to hide cross-origin traffic.
  Rationale: separate deployments may use different origins, and the FastAPI service must still reject unapproved browser origins when accessed directly.

## Risks / Trade-offs

- Existing deployments without `ENVIRONMENT` may continue in development mode until configured. Mitigation: document production values in README and deployment notes.
- Too-strict validation can break local tests. Mitigation: scope fail-fast checks to non-development modes and keep test overrides simple.
- Frontend builds may fail in environments that currently omit `VITE_API_BASE_URL`. Mitigation: document required production values and keep local development defaults available only in development mode.

## Migration Plan

1. Add `ENVIRONMENT` to `.env.example` with `development`.
2. Add production validation to `Settings`.
3. Add frontend environment guidance for `VITE_API_BASE_URL`.
4. Update README configuration notes for split deployment.
5. Verify startup with development values and failure with production placeholder values.
6. Verify frontend production build fails or reports a clear configuration error when `VITE_API_BASE_URL` is missing.

## Open Questions

- Should CI run with `ENVIRONMENT=test` or continue to rely on default development behavior?
- Should the production frontend build use the public API origin directly or a same-origin reverse proxy path such as `/api`?
