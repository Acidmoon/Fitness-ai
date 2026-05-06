## Purpose
Define simulated and backend-assisted training analysis behavior, analysis status, notifications, and result presentation.

## Requirements

### Requirement: Android app starts simulated pose analysis
The Android app SHALL allow a tester to start a simulated pose-analysis workflow for a record with an attached video.

#### Scenario: Record has attached video
- **WHEN** a tester starts analysis from a record detail screen with an attached video
- **THEN** the app sets the analysis state to queued or running
- **THEN** the app prevents duplicate analysis starts while analysis is active

#### Scenario: Record has no attached video
- **WHEN** a tester opens a record detail screen without an attached video
- **THEN** the app does not allow analysis to start
- **THEN** the app communicates that video is required

### Requirement: Android app completes simulated analysis
The Android app SHALL produce a simulated analysis result after the simulated analysis flow completes.

#### Scenario: Simulated analysis succeeds
- **WHEN** the simulated analysis completes successfully
- **THEN** the app displays a completed state with model name, valid frame count, average confidence, score preview, and message

#### Scenario: Simulated analysis fails
- **WHEN** the simulated analysis is configured or triggered to fail
- **THEN** the app displays a failed state with a recoverable message
- **THEN** the attached video remains available

### Requirement: Android app notifies on simulated analysis completion
The Android app SHALL show a local notification when simulated analysis completes if notification permission is available.

#### Scenario: Notification permission is granted
- **WHEN** simulated analysis reaches a terminal completed state
- **THEN** the app posts a local completion notification

#### Scenario: Notification permission is denied
- **WHEN** simulated analysis reaches a terminal completed state and notification permission is denied
- **THEN** the app does not post a notification
- **THEN** the in-app completed state remains visible
