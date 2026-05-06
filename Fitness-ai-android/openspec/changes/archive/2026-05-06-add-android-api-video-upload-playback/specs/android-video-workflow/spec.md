## MODIFIED Requirements

### Requirement: Android app records video for a training record
The Android app SHALL allow a tester to capture a new video and attach it to a training record in the selected backend mode.

#### Scenario: Camera permission is granted in mock mode
- **WHEN** a tester starts recording from a record detail screen in mock mode and grants camera permission
- **THEN** the app captures a video file
- **THEN** the app binds the captured video URI to the selected local training record

#### Scenario: Camera permission is granted in API mode
- **WHEN** a tester starts recording from a backend record detail screen in API mode and grants camera permission
- **THEN** the app captures a video file
- **THEN** the app uploads the captured video to the backend record video endpoint
- **THEN** the backend video becomes attached to the selected training record

#### Scenario: Camera permission is denied
- **WHEN** a tester starts recording from a record detail screen and denies camera permission
- **THEN** the app keeps the record unchanged
- **THEN** the app displays a recoverable permission-denied state

#### Scenario: API video upload fails
- **WHEN** API mode cannot upload a captured video because the backend or network fails
- **THEN** the app displays a recoverable upload error
- **THEN** the existing record video state remains available

### Requirement: Android app selects existing local video for a training record
The Android app SHALL allow a tester to select an existing local video and attach it to a training record in the selected backend mode.

#### Scenario: Tester selects a video in mock mode
- **WHEN** a tester chooses an existing video from the system picker in mock mode
- **THEN** the app binds the selected video URI to the selected local training record

#### Scenario: Tester selects a video in API mode
- **WHEN** a tester chooses an existing video from the system picker in API mode
- **THEN** the app uploads the selected video to the selected backend training record
- **THEN** the backend video becomes attached to the selected training record

#### Scenario: Tester cancels selection
- **WHEN** a tester opens the picker and cancels without selecting a video
- **THEN** the app keeps the training record video state unchanged

### Requirement: Android app previews attached video
The Android app SHALL allow a tester to preview the video attached to a training record.

#### Scenario: Local record has video
- **WHEN** a tester opens a mock-mode record detail screen with an attached local video
- **THEN** the app provides video playback controls for that local video

#### Scenario: API record has backend video
- **WHEN** a tester opens an API-mode record detail screen with a backend `video_url`
- **THEN** the app provides video playback controls for the backend video location

#### Scenario: Record has no video
- **WHEN** a tester opens a record detail screen without an attached video
- **THEN** the app communicates that no video is attached and offers video capture or selection actions

### Requirement: Android app replaces attached video
The Android app SHALL allow a tester to replace the video attached to a training record.

#### Scenario: New mock video is attached
- **WHEN** a tester records or selects a new video for a mock-mode record that already has video
- **THEN** the app updates the record to reference the new local video
- **THEN** any stale simulated analysis result for that record is cleared

#### Scenario: New API video is attached
- **WHEN** a tester records or selects a new video for an API-mode backend record that already has video
- **THEN** the app uploads the replacement video to the backend
- **THEN** the app refreshes the backend video state for that record
- **THEN** any stale analysis result for that record is cleared
