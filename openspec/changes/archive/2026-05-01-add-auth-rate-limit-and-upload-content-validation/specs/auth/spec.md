## MODIFIED Requirements

### Requirement: User login
The system SHALL authenticate only active users with username and password, SHALL issue a bearer token on success, and SHALL throttle repeated failed login attempts for the same client scope within the configured retry window.

#### Scenario: Successful login
- **WHEN** an active user submits valid credentials to `POST /api/auth/login`
- **THEN** the system returns an `access_token`
- **THEN** the system returns `token_type` as `bearer`

#### Scenario: Invalid credentials
- **WHEN** a client submits an unknown username or incorrect password
- **THEN** the system returns `401 Unauthorized`

#### Scenario: Inactive user attempts login
- **WHEN** an inactive user submits otherwise valid credentials to `POST /api/auth/login`
- **THEN** the system returns `403 Forbidden`
- **THEN** the system does not issue a new bearer token

#### Scenario: Repeated failed logins are throttled
- **WHEN** the same client scope exceeds the configured failed-login threshold within the active retry window
- **THEN** the system returns `429 Too Many Requests`
- **THEN** the system does not attempt further password verification for that request

#### Scenario: Successful login clears failure pressure
- **WHEN** a client scope has accumulated failed login attempts and then submits valid credentials before being throttled
- **THEN** the system authenticates successfully
- **THEN** the system resets or clears the tracked failed-attempt state for that client scope

#### Scenario: Different client scope is not throttled by unrelated failures
- **WHEN** one client scope exceeds the failed-login threshold
- **THEN** another client scope submitting the same username with valid credentials is evaluated independently
