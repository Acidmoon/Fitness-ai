## ADDED Requirements

### Requirement: Android app records video for a training record
The Android app SHALL allow a tester to capture a new video and attach it to a training record.

#### Scenario: Camera permission is granted
- **WHEN** a tester starts recording from a record detail screen and grants camera permission
- **THEN** the app captures a video file
- **THEN** the app binds the captured video to the selected training record

#### Scenario: Camera permission is denied
- **WHEN** a tester starts recording from a record detail screen and denies camera permission
- **THEN** the app keeps the record unchanged
- **THEN** the app displays a recoverable permission-denied state

### Requirement: Android app selects existing local video for a training record
The Android app SHALL allow a tester to select an existing local video and attach it to a training record.

#### Scenario: Tester selects a video
- **WHEN** a tester chooses an existing video from the system picker
- **THEN** the app binds the selected video URI to the selected training record

#### Scenario: Tester cancels selection
- **WHEN** a tester opens the picker and cancels without selecting a video
- **THEN** the app keeps the training record video state unchanged

### Requirement: Android app previews attached video
The Android app SHALL allow a tester to preview the video attached to a training record.

#### Scenario: Record has video
- **WHEN** a tester opens a record detail screen with an attached video
- **THEN** the app provides video playback controls for that video

#### Scenario: Record has no video
- **WHEN** a tester opens a record detail screen without an attached video
- **THEN** the app communicates that no video is attached and offers video capture or selection actions

### Requirement: Android app replaces attached video
The Android app SHALL allow a tester to replace the video attached to a training record.

#### Scenario: New video is attached
- **WHEN** a tester records or selects a new video for a record that already has video
- **THEN** the app updates the record to reference the new video
- **THEN** any stale simulated analysis result for that record is cleared
