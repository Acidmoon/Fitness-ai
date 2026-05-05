## ADDED Requirements

### Requirement: Production runtime rejects unsafe configuration defaults
The system MUST fail configuration initialization in non-development environments when sensitive settings use known placeholder or sample defaults.

#### Scenario: Placeholder JWT secret in production
- **WHEN** `ENVIRONMENT` is production-like and `SECRET_KEY` equals a documented placeholder value
- **THEN** the system fails startup before serving requests

#### Scenario: Default database URL in production
- **WHEN** `ENVIRONMENT` is production-like and `DATABASE_URL` equals the built-in sample database URL
- **THEN** the system fails startup before creating the SQLAlchemy engine

#### Scenario: Development configuration remains usable
- **WHEN** `ENVIRONMENT` is development
- **THEN** the system loads settings through `.env` and environment variables without applying production-only fail-fast checks

### Requirement: Example environment files contain placeholders only
The system MUST keep committed environment examples free of real-looking credentials and production secrets.

#### Scenario: Example database URL
- **WHEN** a developer opens `.env.example`
- **THEN** the database URL uses placeholder username, password, host, and database values rather than project-specific credentials

#### Scenario: Example JWT secret
- **WHEN** a developer opens `.env.example`
- **THEN** the JWT secret value communicates that a generated secret is required and is not usable as a production secret

### Requirement: Separated deployment origins are explicit
The system SHALL require explicit frontend and backend origin configuration when frontend and backend are deployed separately.

#### Scenario: Backend CORS allowlist contains frontend origin
- **WHEN** the backend starts for a separated production deployment
- **THEN** `ALLOWED_ORIGINS` includes the exact public frontend origin allowed to call the API

#### Scenario: Frontend API base URL points to backend origin
- **WHEN** the frontend is built for production
- **THEN** `VITE_API_BASE_URL` is set to the public backend API origin or the documented same-origin API proxy path

#### Scenario: Missing production frontend API base URL
- **WHEN** a production frontend build lacks `VITE_API_BASE_URL`
- **THEN** the build or runtime configuration fails with a clear configuration error instead of silently using a localhost API URL
