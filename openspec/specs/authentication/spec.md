# Authentication Specification

## Purpose

Define how users register, log in, receive JWT access tokens, and are resolved as the current user for protected API endpoints.

## Requirements

### Requirement: User registration validates identity and credentials
The system SHALL allow public user registration with a username, email, and password only when all fields satisfy the configured validation rules.

#### Scenario: Successful registration
- **WHEN** a client posts a username of 3 to 50 letters, digits, or underscores, a valid email, and a password with at least 8 characters containing both letters and digits to `/api/auth/register`
- **THEN** the system creates the user with a bcrypt password hash and returns the public user fields without returning the password hash

#### Scenario: Invalid registration payload
- **WHEN** registration input has an invalid username, invalid email, password shorter than 8 characters, password without letters, or password without digits
- **THEN** the system rejects the request with validation error status `422`

### Requirement: User registration rejects duplicate identities
The system MUST keep usernames and emails unique across users.

#### Scenario: Duplicate username
- **WHEN** a client registers with a username already owned by another user
- **THEN** the system rejects the request with status `400` and explains that the username already exists

#### Scenario: Duplicate email
- **WHEN** a client registers with an email already owned by another user
- **THEN** the system rejects the request with status `400` and explains that the email is already registered

### Requirement: Login issues bearer access tokens
The system SHALL authenticate users through `/api/auth/login` using OAuth2 password form fields.

#### Scenario: Successful login
- **WHEN** a client posts a valid username and password to `/api/auth/login`
- **THEN** the system returns an `access_token` and `token_type` of `bearer`

#### Scenario: Failed login
- **WHEN** a client posts an unknown username or an incorrect password to `/api/auth/login`
- **THEN** the system rejects the request with status `401` and a bearer authentication challenge

### Requirement: Access tokens identify users by stable subject
The system SHALL issue new JWT access tokens with the user id string in the `sub` claim and an expiration derived from configuration.

#### Scenario: New token subject
- **WHEN** a user logs in successfully
- **THEN** the JWT payload contains `sub` equal to the user's database id converted to a string

#### Scenario: Token expiration
- **WHEN** the system creates an access token without a custom expiration delta
- **THEN** the token includes an `exp` claim based on `ACCESS_TOKEN_EXPIRE_MINUTES`

### Requirement: Protected endpoints resolve the current user from bearer tokens
The system MUST require a valid bearer JWT on protected endpoints and resolve it to an existing active user.

#### Scenario: Missing token
- **WHEN** a client calls a protected endpoint without an Authorization bearer token
- **THEN** the system rejects the request with status `401`

#### Scenario: Invalid token
- **WHEN** a client calls a protected endpoint with an invalid, expired, or unverifiable token
- **THEN** the system rejects the request with status `401` and does not expose protected data

#### Scenario: Migration-compatible token subject
- **WHEN** a token has `sub` as either a numeric user id or a legacy username
- **THEN** the system resolves the matching active user and allows the protected operation when the user exists and is active

#### Scenario: Inactive user token
- **WHEN** a token resolves to an existing user whose `is_active` flag is false
- **THEN** the system rejects the protected operation with status `403`
