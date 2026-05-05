## MODIFIED Requirements

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
