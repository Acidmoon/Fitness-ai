## Why

The application currently has placeholder runtime defaults for sensitive settings, so a missing or incomplete `.env` can still produce a running service with predictable JWT signing behavior. The example environment file also contains a concrete-looking database username and password, which makes unsafe local values easy to copy forward.

## What Changes

- Add startup validation for production-like environments so unsafe placeholder secrets and default database URLs are rejected before serving requests.
- Add explicit environment mode handling so local development can remain convenient while production becomes fail-fast.
- Add separated-deployment configuration guidance so the backend CORS allowlist and frontend API base URL are explicit in production.
- Require frontend production builds to provide an API base URL instead of silently falling back to a localhost backend.
- Replace concrete-looking example credentials with non-secret placeholders.
- Keep existing `.env` loading and pydantic-settings configuration style.

## Capabilities

### New Capabilities

- None

### Modified Capabilities

- `platform-operations`: runtime configuration must reject unsafe production defaults and keep example files free of real-looking secrets.

## Impact

- Affected code: `app/config.py`, `.env.example`, possibly `README.md`.
- Affected frontend code: `Fitness-ai-frontend/.env.example`, `Fitness-ai-frontend/src/services/http.ts`, deployment documentation.
- Affected systems: application startup, deployment configuration, JWT signing safety.
- Security impact: prevents production from accidentally using placeholder `SECRET_KEY`, sample database credentials, or unintended cross-origin API access.
