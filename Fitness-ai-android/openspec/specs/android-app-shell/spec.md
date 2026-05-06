## Purpose
Define the Android app shell, authentication entry, role selection, navigation, and authenticated API operation-state behavior.
## Requirements
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

### Requirement: Android app supports role simulation
The Android app SHALL let internal testers simulate student, teacher, administrator, and personal fitness user roles.

#### Scenario: Tester selects a role
- **WHEN** a tester selects one of the supported roles
- **THEN** the app stores the selected role in session state
- **THEN** the main app shell reflects the selected role in profile or contextual display

### Requirement: Android app provides main navigation
The Android app SHALL provide Home, Training, Stats, and Profile sections from the authenticated app shell.

#### Scenario: Main tabs are available
- **WHEN** a tester reaches the authenticated app shell
- **THEN** the app shows navigation entries for Home, Training, Stats, and Profile

#### Scenario: Tester switches tabs
- **WHEN** a tester selects a different main navigation entry
- **THEN** the app displays the corresponding section without requiring re-authentication

### Requirement: Android app uses a consistent visual shell
The Android app SHALL use a modern minimalist line-based visual style across MVP screens.

#### Scenario: Shared styling is applied
- **WHEN** a tester navigates between MVP screens
- **THEN** typography, spacing, colors, icons, and dividers remain visually consistent

### Requirement: Android app communicates API operation state in the authenticated shell
The Android app SHALL distinguish API-mode loading, empty, recoverable error, retry, and unauthenticated states across authenticated screens.

#### Scenario: API operation is loading
- **WHEN** an authenticated API-mode screen is waiting for backend data or mutation completion
- **THEN** the app shows a non-terminal loading or disabled action state appropriate to that screen

#### Scenario: API operation has no data
- **WHEN** an authenticated API-mode screen successfully loads an empty backend result
- **THEN** the app shows an empty state instead of an error state

#### Scenario: API operation fails recoverably
- **WHEN** an authenticated API-mode data, video, analysis, or scoring operation fails without invalidating the token
- **THEN** the app keeps the tester in the authenticated shell
- **THEN** the app shows a recoverable error and retry path

#### Scenario: API token is rejected
- **WHEN** the backend rejects the stored or current token during an authentication validation path
- **THEN** the app clears the API token
- **THEN** the app returns to the login flow without crashing
