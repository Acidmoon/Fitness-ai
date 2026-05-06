## ADDED Requirements

### Requirement: Android app supports authenticated API video media
The Android app SHALL upload and access backend record videos through authenticated API mode services.

#### Scenario: API video upload sends bearer token
- **WHEN** API mode uploads a video for a backend training record after login
- **THEN** the upload request includes the current bearer token
- **THEN** the request targets the configured backend video endpoint

#### Scenario: Relative backend video URL is resolved
- **WHEN** a backend record or upload response returns a relative `video_url`
- **THEN** the Android API layer resolves it against the configured backend base URL before playback

#### Scenario: API video failure is recoverable
- **WHEN** upload, delete, or playback setup fails because of backend or network errors
- **THEN** the data layer returns a recoverable failure state
- **THEN** the authenticated session remains active
