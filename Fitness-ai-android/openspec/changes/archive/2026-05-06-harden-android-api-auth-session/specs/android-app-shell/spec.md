## MODIFIED Requirements

### Requirement: Android app starts with mock authentication
The Android app SHALL allow an internal tester to enter the MVP without requiring a live backend in mock mode, SHALL allow backend API login when API mode is enabled, and SHALL restore a valid stored API session when available.

#### Scenario: Mock login succeeds
- **WHEN** a tester submits the mock login flow with accepted local credentials while mock mode is active
- **THEN** the app navigates to role selection or the main app shell

#### Scenario: Mock login fails
- **WHEN** a tester submits invalid local credentials while mock mode is active
- **THEN** the app remains on the login screen and displays a recoverable error state

#### Scenario: Backend login succeeds
- **WHEN** a tester submits valid backend credentials while API mode is active
- **THEN** the app authenticates through the backend login endpoint
- **THEN** the app stores the returned bearer token
- **THEN** the app fetches or validates backend profile data for the session
- **THEN** the app navigates to role selection or the main app shell

#### Scenario: Backend login fails
- **WHEN** a tester submits invalid backend credentials or the backend rejects the login while API mode is active
- **THEN** the app remains on the login screen
- **THEN** the app displays a recoverable authentication error

#### Scenario: Stored API token restores session
- **WHEN** the app starts in API mode with a valid stored token
- **THEN** the app restores the authenticated session from backend profile data
- **THEN** the tester can continue to role selection or the main app shell without re-entering credentials

#### Scenario: Stored API token is stale
- **WHEN** the app starts in API mode with a stored token that the backend rejects
- **THEN** the app clears the token
- **THEN** the app shows the login screen without crashing
