# Platform Operations Specification

## Purpose

Define application-level operational behavior for configuration, persistence, logging, errors, health checks, and tests.
## Requirements
### Requirement: Application exposes basic service metadata and health
The system SHALL expose a root response and a health-check endpoint for simple service probing.

#### Scenario: Root endpoint
- **WHEN** a client calls `GET /`
- **THEN** the system returns the API welcome message and version

#### Scenario: Health endpoint
- **WHEN** a client calls `GET /health`
- **THEN** the system returns status `ok`

### Requirement: Application mounts domain routers consistently
The system SHALL mount API routers under stable prefixes for each domain capability.

#### Scenario: Router prefixes
- **WHEN** the FastAPI application starts
- **THEN** it includes routers under `/api/auth`, `/api/exercise`, `/api/stats`, `/api/video`, and `/api/user`

### Requirement: Runtime configuration is environment driven
The system SHALL load runtime settings from environment variables and `.env` through pydantic-settings.

#### Scenario: Database configuration
- **WHEN** the application creates the SQLAlchemy engine
- **THEN** it uses the configured `DATABASE_URL`

#### Scenario: JWT configuration
- **WHEN** the security utilities create or validate JWTs
- **THEN** they use configured `SECRET_KEY`, `ALGORITHM`, and `ACCESS_TOKEN_EXPIRE_MINUTES`

#### Scenario: CORS configuration
- **WHEN** the application configures CORS
- **THEN** it converts comma-separated `ALLOWED_ORIGINS` into the allowed origins list

### Requirement: Database sessions are scoped per dependency use
The system SHALL provide database sessions through a FastAPI dependency that closes sessions after use.

#### Scenario: Request database session
- **WHEN** an API endpoint depends on `get_db`
- **THEN** the system yields a SQLAlchemy session and closes it after the request handling completes

### Requirement: Models are registered for table creation
The system MUST import SQLAlchemy models before metadata-driven table creation.

#### Scenario: Initialize database tables
- **WHEN** `python -m scripts.init_db` runs
- **THEN** registered models are available through `app.models` and their tables can be created from shared metadata

### Requirement: Logging captures requests and application lifecycle
The system SHALL configure loguru logging for console output and rotating log files.

#### Scenario: Logging startup
- **WHEN** the application imports and configures logging
- **THEN** it creates the configured log directory, attaches console and file sinks, and applies level, format, rotation, and retention settings

#### Scenario: Request logging
- **WHEN** an HTTP request is processed
- **THEN** the logging middleware records method, path, status or error, duration, and a sanitized client IP

#### Scenario: JSON log format
- **WHEN** `LOG_FORMAT=json`
- **THEN** the system emits structured JSON-like log entries with timestamp, level, module, function, line, and message fields

### Requirement: Sensitive values can be sanitized before logging
The system SHALL provide utility functions for masking sensitive values.

#### Scenario: Password and token masking
- **WHEN** code sanitizes a password or token value
- **THEN** the returned value hides the secret content rather than returning it verbatim

#### Scenario: Email and IP masking
- **WHEN** code sanitizes email or IPv4 address values
- **THEN** the returned value preserves enough context for diagnostics while masking identifying parts

### Requirement: Application handles known and unknown exceptions consistently
The system SHALL register exception handlers for business, system, and unhandled exceptions.

#### Scenario: Business exception
- **WHEN** a `BusinessException` is raised
- **THEN** the system logs a warning and returns a JSON response with the configured status code and detail message

#### Scenario: System exception
- **WHEN** a `SystemException` is raised
- **THEN** the system logs an error and returns status `500` with a generic internal error detail

#### Scenario: Unhandled exception
- **WHEN** an unexpected exception escapes request handling
- **THEN** the system logs the exception and returns status `500` with a generic internal error detail

### Requirement: Tests run against isolated in-memory persistence
The system SHALL support automated API tests without requiring PostgreSQL.

#### Scenario: Test database setup
- **WHEN** pytest creates the `db_session` fixture
- **THEN** it creates all tables in an in-memory SQLite database and drops them after the test

#### Scenario: Test dependency override
- **WHEN** pytest creates the FastAPI test client
- **THEN** it overrides `get_db` so API calls use the test session

### Requirement: Windows test runs avoid restricted temporary directories
The system SHALL support pytest runs on Windows environments where pytest-created `0o700` temporary directories or default user temp directories may be inaccessible.

#### Scenario: Test temporary path fixture
- **WHEN** a test requests `tmp_path`
- **THEN** the test fixture creates an isolated per-test directory under the configured pytest base temp directory or `.cowork-temp/test-tmp` using inherited filesystem ACLs

#### Scenario: Scripted Windows test run
- **WHEN** a developer runs `.\scripts\run_tests.ps1` from an activated virtual environment
- **THEN** the script runs `python -m pytest`, sets pytest base temp and cache directories to unique `.cowork-temp` paths, routes `TEMP` and `TMP` to the project-local temp path for that run, and exits with pytest's status code

### Requirement: Development virtual environments are reproducible from README
The system SHALL document and support a local development virtual environment workflow based on the README instructions.

#### Scenario: Create virtual environment
- **WHEN** a developer follows the README quick-start setup
- **THEN** they can create a project-local virtual environment with `python -m venv venv`

#### Scenario: Activate Windows virtual environment
- **WHEN** a developer uses Windows PowerShell
- **THEN** the README instructs them to activate the environment with `venv\Scripts\Activate.ps1`

#### Scenario: Install project dependencies
- **WHEN** the virtual environment is active
- **THEN** the README instructs the developer to install dependencies with `pip install -r requirements.txt`

### Requirement: Broken Windows virtual environments can be repaired
The system SHALL document the recovery path for virtual environments whose launchers reference a removed WindowsApps Python executable.

#### Scenario: Launcher points to removed Python
- **WHEN** a developer sees `did not find executable ... WindowsApps ... python.exe`
- **THEN** the README instructs them to delete `venv`, recreate it with `python -m venv venv`, activate it, and reinstall `requirements.txt`

#### Scenario: Repaired environment runs verification tools
- **WHEN** the developer has recreated the virtual environment using the README workflow
- **THEN** `pytest` and `flake8 app/ tests/` can be run from the activated environment

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
