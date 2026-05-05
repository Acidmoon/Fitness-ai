## ADDED Requirements

### Requirement: Separated clients authenticate with bearer access tokens
The system SHALL support separated frontend clients by accepting JWT access tokens in the `Authorization: Bearer <token>` header for protected API requests.

#### Scenario: Protected API request from separated frontend
- **WHEN** a frontend client calls a protected `/api/*` endpoint from an allowed origin with a valid bearer access token
- **THEN** the backend resolves the current user and processes the protected operation

#### Scenario: Protected API request without bearer token
- **WHEN** a separated frontend client calls a protected `/api/*` endpoint without an `Authorization` bearer token
- **THEN** the backend returns `401 Unauthorized`

### Requirement: Authentication failures are client-actionable
The system SHALL return authentication and authorization statuses that allow separated clients to respond predictably.

#### Scenario: Invalid or expired token
- **WHEN** a protected API request includes an invalid, expired, or unverifiable bearer token
- **THEN** the backend returns `401 Unauthorized`
- **THEN** the frontend clears the stored access token before requiring the user to log in again

#### Scenario: Known inactive account
- **WHEN** a protected API request resolves to an existing inactive user
- **THEN** the backend returns `403 Forbidden`
- **THEN** the frontend shows an account-state error instead of treating the token as merely missing

### Requirement: Refresh cookies are not required for separated deployment
The system SHALL NOT require cross-site refresh cookies or browser cookie sessions for the initial separated frontend/backend deployment.

#### Scenario: Login response
- **WHEN** a user logs in successfully through `/api/auth/login`
- **THEN** the backend returns the bearer access token in the response body
- **THEN** the backend does not require the browser to store an authentication cookie for protected API access
