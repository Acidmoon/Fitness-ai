## MODIFIED Requirements

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

### Requirement: JWT subject handling
The system SHALL issue login tokens with `user.id` as the JWT `sub` claim and SHALL continue accepting legacy username-based `sub` values when resolving the current user, including numeric legacy usernames when no matching id exists.

#### Scenario: New login token format
- **WHEN** the system issues a token during login
- **THEN** the JWT `sub` claim is the authenticated user's numeric `id` serialized as a string

#### Scenario: Legacy token compatibility
- **WHEN** an authenticated request presents a valid JWT whose `sub` claim is the user's username
- **THEN** the system resolves the current user successfully

#### Scenario: Numeric legacy username fallback
- **WHEN** an authenticated request presents a valid JWT whose `sub` claim is numeric text and no user exists with that id
- **THEN** the system falls back to username lookup using the same `sub` value
- **THEN** the system resolves the matching legacy username user successfully
