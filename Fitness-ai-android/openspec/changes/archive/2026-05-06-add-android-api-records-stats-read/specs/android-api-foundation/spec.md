## ADDED Requirements

### Requirement: Android app refreshes API-backed read data after authentication
The Android app SHALL refresh API-backed training records and stats after API login or stored-token session restoration succeeds.

#### Scenario: API login refreshes read data
- **WHEN** backend API login succeeds and the session is established
- **THEN** the app refreshes backend training records
- **THEN** the app refreshes backend stats summary

#### Scenario: Stored token restoration refreshes read data
- **WHEN** API mode restores a session from a valid stored token
- **THEN** the app refreshes backend training records
- **THEN** the app refreshes backend stats summary

#### Scenario: Mock mode does not require backend read refresh
- **WHEN** mock mode login succeeds
- **THEN** the app continues to use mock/local records and locally derived stats without requiring a backend

#### Scenario: API read refresh reports recoverable errors
- **WHEN** authenticated API read refresh fails for records or stats
- **THEN** the data layer returns or stores a recoverable error without clearing the authenticated session
