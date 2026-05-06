## ADDED Requirements

### Requirement: Android app verifies API mode end-to-end workflow
The Android project SHALL include repeatable verification for the primary API-mode workflow from login through records, video, analysis, scoring, and stats refresh.

#### Scenario: API happy path is verified
- **WHEN** the API-mode workflow test runs against controlled backend responses
- **THEN** it verifies login, bearer token attachment, records refresh, stats refresh, record mutation, video upload, analysis completion, scoring, and final refresh behavior

#### Scenario: API failure paths are verified
- **WHEN** controlled backend responses simulate data, mutation, upload, analysis, or scoring failures
- **THEN** tests verify the app reports recoverable failures without clearing the authenticated session

#### Scenario: Local API mode is documented
- **WHEN** a developer wants to manually test API mode
- **THEN** project documentation explains backend URL configuration, emulator host URL usage, physical device LAN usage, and the expected workflow to exercise
