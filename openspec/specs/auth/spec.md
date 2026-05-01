# Authentication Specification

## Purpose

Define the current authentication behavior for user registration, login, and JWT-based identity resolution.
## Requirements
### Requirement: User registration
The system SHALL allow a new user to register with a username, email, and password that pass schema validation, and the username SHALL not be only digits.

#### Scenario: Successful registration
- **WHEN** a client submits a unique username, a unique email, and a valid password to `POST /api/auth/register`
- **THEN** the system returns the created user profile without a password hash

#### Scenario: Duplicate username
- **WHEN** a client submits a username that already exists
- **THEN** the system returns `400 Bad Request`

#### Scenario: Duplicate email
- **WHEN** a client submits an email that already exists
- **THEN** the system returns `400 Bad Request`

#### Scenario: Invalid registration data
- **WHEN** a client submits a username, email, or password that fails schema validation
- **THEN** the system returns `422 Unprocessable Content`

#### Scenario: Numeric-only username registration
- **WHEN** a client submits a username containing only digits
- **THEN** the system returns `422 Unprocessable Content`

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

### Requirement: JWT subject handling
The system SHALL issue login tokens with unambiguous current-user subject semantics and SHALL continue accepting legacy username-based `sub` values without allowing a numeric legacy subject to authenticate as a different account.

#### Scenario: New login token format resolves deterministically
- **WHEN** the system issues a token during login
- **THEN** the token carries enough subject information for authenticated requests to resolve exactly the logged-in user by id semantics

#### Scenario: Legacy token compatibility
- **WHEN** an authenticated request presents a valid legacy JWT whose `sub` claim is the user's non-numeric username
- **THEN** the system resolves the current user successfully

#### Scenario: Numeric legacy username resolves to username owner
- **WHEN** an authenticated request presents a valid legacy JWT that represents a username-based subject whose value is numeric text
- **THEN** the system resolves the user who owns that username value
- **THEN** the system does not authenticate as a different user whose numeric id happens to match the same text

#### Scenario: Unsafe ambiguous numeric subject is rejected
- **WHEN** an authenticated request presents a numeric-subject token that cannot be interpreted safely as either the current id-based format or the legacy username-based format
- **THEN** the system returns `401 Unauthorized`
