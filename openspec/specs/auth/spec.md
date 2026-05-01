# Authentication Specification

## Purpose

Define the current authentication behavior for user registration, login, and JWT-based identity resolution.

## Requirements

### Requirement: User registration
The system SHALL allow a new user to register with a username, email, and password that pass schema validation.

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

### Requirement: User login
The system SHALL authenticate users with username and password and issue a bearer token on success.

#### Scenario: Successful login
- **WHEN** a client submits valid credentials to `POST /api/auth/login`
- **THEN** the system returns an `access_token`
- **THEN** the system returns `token_type` as `bearer`

#### Scenario: Invalid credentials
- **WHEN** a client submits an unknown username or incorrect password
- **THEN** the system returns `401 Unauthorized`

### Requirement: JWT subject handling
The system SHALL issue login tokens with `user.id` as the JWT `sub` claim and SHALL continue accepting legacy username-based `sub` values when resolving the current user.

#### Scenario: New login token format
- **WHEN** the system issues a token during login
- **THEN** the JWT `sub` claim is the authenticated user's numeric `id` serialized as a string

#### Scenario: Legacy token compatibility
- **WHEN** an authenticated request presents a valid JWT whose `sub` claim is the user's username
- **THEN** the system resolves the current user successfully
