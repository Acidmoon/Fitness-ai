## Purpose
Define Android training record list, detail, creation, editing, deletion, and API-backed training workflow behavior.
## Requirements
### Requirement: Android app lists local training records
The Android app SHALL display locally available training records in mock mode and backend training records in API mode.

#### Scenario: Mock records exist
- **WHEN** a tester opens the Training section in mock mode and local records exist
- **THEN** the app displays the records with exercise name, date, count or duration, and score when available

#### Scenario: API records exist
- **WHEN** a tester opens the Training section in API mode after authenticated backend record refresh succeeds
- **THEN** the app displays backend records with exercise name, category, date, count or duration, and score when available

#### Scenario: Backend record references unknown exercise
- **WHEN** API mode receives a backend record whose `exercise_id` is not present in the fetched exercise catalog
- **THEN** the app displays the record with a stable fallback exercise label instead of dropping the record

#### Scenario: No records exist
- **WHEN** a tester opens the Training section and no records exist for the selected backend mode
- **THEN** the app displays an empty state with a way to create a training record

#### Scenario: Record refresh fails
- **WHEN** API mode cannot refresh backend training records because the server or network is unavailable
- **THEN** the app keeps running and exposes a recoverable data-layer error

### Requirement: Android app creates local training records
The Android app SHALL allow a tester to create a local training record.

#### Scenario: Valid record is submitted
- **WHEN** a tester enters the required record fields and saves
- **THEN** the app creates the record in local MVP storage
- **THEN** the new record appears in the Training section

#### Scenario: Required fields are missing
- **WHEN** a tester tries to save a record without required fields
- **THEN** the app prevents saving and shows field-level or screen-level validation feedback

### Requirement: Android app displays training record details
The Android app SHALL provide a detail screen for each local training record.

#### Scenario: Tester opens a record
- **WHEN** a tester selects a record from the Training section
- **THEN** the app displays the record details, video attachment state, and analysis state

### Requirement: Android app edits local training records
The Android app SHALL allow a tester to update editable fields on a local training record.

#### Scenario: Valid edit is saved
- **WHEN** a tester changes editable fields and saves
- **THEN** the app updates the local record
- **THEN** subsequent list and detail views show the updated values

### Requirement: Android app deletes local training records
The Android app SHALL allow a tester to delete a local training record.

#### Scenario: Delete is confirmed
- **WHEN** a tester confirms deletion for a record
- **THEN** the app removes the record from local MVP storage
- **THEN** the Training section no longer displays the record

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
