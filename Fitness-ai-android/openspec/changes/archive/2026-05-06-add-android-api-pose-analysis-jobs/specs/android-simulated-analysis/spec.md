## MODIFIED Requirements

### Requirement: Android app starts simulated pose analysis
The Android app SHALL allow a tester to start a pose-analysis workflow for a record with an attached video in the selected backend mode.

#### Scenario: Mock record has attached video
- **WHEN** a tester starts analysis from a mock-mode record detail screen with an attached local video
- **THEN** the app sets the analysis state to queued or running
- **THEN** the app prevents duplicate analysis starts while analysis is active

#### Scenario: API record has backend video
- **WHEN** a tester starts analysis from an API-mode record detail screen with an attached backend video
- **THEN** the app creates a backend pose-analysis job for the selected record
- **THEN** the app sets the analysis state to queued or running
- **THEN** the app prevents duplicate analysis starts while analysis is active

#### Scenario: Record has no attached video
- **WHEN** a tester opens a record detail screen without an attached video
- **THEN** the app does not allow analysis to start
- **THEN** the app communicates that video is required

### Requirement: Android app completes simulated analysis
The Android app SHALL produce a pose-analysis result after the selected backend mode's analysis flow completes.

#### Scenario: Mock simulated analysis succeeds
- **WHEN** the mock-mode simulated analysis completes successfully
- **THEN** the app displays a completed state with model name, valid frame count, average confidence, score preview, and message

#### Scenario: API pose-analysis job succeeds
- **WHEN** the backend pose-analysis job reaches a successful terminal state
- **THEN** the app maps the backend pose-analysis result into the record analysis state
- **THEN** the app displays a completed state with available model name, valid frame count, average confidence, and message

#### Scenario: Mock simulated analysis fails
- **WHEN** the simulated analysis is configured or triggered to fail
- **THEN** the app displays a failed state with a recoverable message
- **THEN** the attached video remains available

#### Scenario: API pose-analysis job fails
- **WHEN** the backend pose-analysis job fails or cannot be polled to completion
- **THEN** the app displays a failed state with a recoverable message
- **THEN** the attached backend video remains available
- **THEN** the authenticated session remains active

### Requirement: Android app notifies on simulated analysis completion
The Android app SHALL show a local notification when analysis completes if notification permission is available.

#### Scenario: Notification permission is granted for mock analysis
- **WHEN** mock-mode simulated analysis reaches a terminal completed state
- **THEN** the app posts a local completion notification

#### Scenario: Notification permission is granted for API analysis
- **WHEN** API-mode pose analysis reaches a terminal completed state while notifications are available
- **THEN** the app posts a local completion notification

#### Scenario: Notification permission is denied
- **WHEN** analysis reaches a terminal completed state and notification permission is denied
- **THEN** the app does not post a notification
- **THEN** the in-app completed state remains visible
