## ADDED Requirements

### Requirement: Application rejects unsafe critical configuration
The system SHALL refuse to start when critical runtime configuration is missing or uses known placeholder values for authentication or database connectivity.

#### Scenario: Placeholder secret key is configured
- **WHEN** the application loads settings with `SECRET_KEY` set to a placeholder or insecure default value
- **THEN** settings validation MUST fail with an explicit error indicating that a secure secret key is required

#### Scenario: Database URL is missing or placeholder
- **WHEN** the application loads settings with `DATABASE_URL` missing or set to a placeholder connection string
- **THEN** settings validation MUST fail with an explicit error indicating that a valid database URL is required

### Requirement: Safe configuration remains compatible with environment-based startup
The system SHALL continue to load runtime configuration from environment variables and `.env` files once critical values are valid.

#### Scenario: Valid production-like configuration is supplied
- **WHEN** the application starts with non-placeholder values for `SECRET_KEY` and `DATABASE_URL`
- **THEN** settings loading MUST succeed without requiring code changes
