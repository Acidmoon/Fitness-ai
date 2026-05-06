## ADDED Requirements

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
