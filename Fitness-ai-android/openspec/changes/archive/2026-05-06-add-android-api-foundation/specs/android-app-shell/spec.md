## MODIFIED Requirements

### Requirement: Android app starts with mock authentication
The Android app SHALL allow an internal tester to enter the MVP without requiring a live backend in mock mode, and SHALL allow backend API login when API mode is enabled.

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
- **THEN** the app navigates to role selection or the main app shell

#### Scenario: Backend login fails
- **WHEN** a tester submits invalid backend credentials or the backend rejects the login while API mode is active
- **THEN** the app remains on the login screen
- **THEN** the app displays a recoverable authentication error
