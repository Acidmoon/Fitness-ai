## 1. Configuration Validation

- [x] 1.1 Add an `ENVIRONMENT` setting with documented accepted values.
- [x] 1.2 Add settings validation that rejects placeholder `SECRET_KEY` values in non-development environments.
- [x] 1.3 Add settings validation that rejects the default sample `DATABASE_URL` in non-development environments.
- [x] 1.4 Ensure local development can still start with explicit `.env` values from README.
- [x] 1.5 Document production `ALLOWED_ORIGINS` values for separated frontend domains.

## 2. Documentation

- [x] 2.1 Replace real-looking credentials in `.env.example` with placeholders.
- [x] 2.2 Update README environment variable guidance for development and production.
- [x] 2.3 Document how to generate `SECRET_KEY`.
- [x] 2.4 Update frontend environment guidance for `VITE_API_BASE_URL`.
- [x] 2.5 Document a separated deployment example with frontend origin, API origin, and CORS allowlist.

## 3. Verification

- [x] 3.1 Add tests for accepted development configuration.
- [x] 3.2 Add tests for rejected production placeholder secret and database URL.
- [x] 3.3 Add frontend configuration tests or build-time checks for missing production `VITE_API_BASE_URL`.
- [x] 3.4 Run `pytest`.
- [x] 3.5 Run `flake8 app/ tests/`.
- [x] 3.6 Run `cd Fitness-ai-frontend && npm run build`.
