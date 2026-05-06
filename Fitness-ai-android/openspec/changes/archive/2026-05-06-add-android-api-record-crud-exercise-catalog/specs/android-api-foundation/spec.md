## ADDED Requirements

### Requirement: Android app supports authenticated API record mutations
The Android app SHALL use authenticated backend exercise record endpoints for create, update, and delete operations while API mode is active.

#### Scenario: Authenticated API record create sends bearer token
- **WHEN** API mode creates a backend training record after login
- **THEN** the request uses the configured API client
- **THEN** the request includes the current bearer token

#### Scenario: Authenticated API record update sends bearer token
- **WHEN** API mode updates a backend training record after login
- **THEN** the request uses the backend update endpoint
- **THEN** the request includes the current bearer token

#### Scenario: Authenticated API record delete sends bearer token
- **WHEN** API mode deletes a backend training record after login
- **THEN** the request uses the backend delete endpoint
- **THEN** the request includes the current bearer token

#### Scenario: API record mutation failure is recoverable
- **WHEN** backend record mutation fails because of validation, authorization, server, or network errors
- **THEN** the data layer returns a recoverable failure state
- **THEN** the authenticated session is not cleared unless the auth repository explicitly rejects the token
