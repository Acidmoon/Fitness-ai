## MODIFIED Requirements

### Requirement: User login
The system SHALL authenticate only active users with username and password and SHALL issue a bearer token on success.

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
