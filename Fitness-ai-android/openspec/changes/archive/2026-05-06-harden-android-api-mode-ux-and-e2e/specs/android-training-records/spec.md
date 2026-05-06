## ADDED Requirements

### Requirement: Android app shows API Training operation states
The Android app SHALL show distinct API-mode loading, empty, error, and retry states for Training list and record detail workflows.

#### Scenario: API Training list is loading
- **WHEN** API mode is refreshing backend training records
- **THEN** the Training section shows a loading or refreshing state

#### Scenario: API Training list is empty
- **WHEN** API mode successfully loads zero backend training records
- **THEN** the Training section shows an empty state with a way to create a record when record creation is available

#### Scenario: API Training refresh fails
- **WHEN** API mode cannot refresh backend training records
- **THEN** the Training section shows a recoverable refresh error
- **THEN** the Training section offers a retry path

#### Scenario: API record action is in flight
- **WHEN** API mode is saving, deleting, uploading video, running analysis, or scoring a record
- **THEN** the record detail screen prevents duplicate conflicting actions until the operation finishes

#### Scenario: API record action fails recoverably
- **WHEN** an API-mode record detail action fails without invalidating authentication
- **THEN** the record detail screen displays a recoverable action error
- **THEN** the tester can retry or continue using the authenticated shell
