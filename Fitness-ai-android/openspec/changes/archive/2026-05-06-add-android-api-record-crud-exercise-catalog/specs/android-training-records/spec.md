## MODIFIED Requirements

### Requirement: Android app creates local training records
The Android app SHALL allow a tester to create a training record in the selected backend mode.

#### Scenario: Valid mock record is submitted
- **WHEN** a tester enters the required record fields in mock mode and saves
- **THEN** the app creates the record in local MVP storage
- **THEN** the new record appears in the Training section

#### Scenario: Valid API record is submitted
- **WHEN** a tester selects a backend exercise, enters valid record metrics in API mode, and saves
- **THEN** the app creates the record through the backend exercise record endpoint
- **THEN** the app refreshes backend records and stats
- **THEN** the new backend record appears in the Training section

#### Scenario: Required fields are missing
- **WHEN** a tester tries to save a record without required fields
- **THEN** the app prevents saving and shows field-level or screen-level validation feedback

#### Scenario: API record creation fails
- **WHEN** API mode record creation is rejected by the backend or network
- **THEN** the app displays a recoverable save error
- **THEN** the authenticated session remains active

### Requirement: Android app displays training record details
The Android app SHALL provide a detail screen for each training record from the selected backend mode.

#### Scenario: Tester opens a mock record
- **WHEN** a tester selects a local record from the Training section in mock mode
- **THEN** the app displays the record details, video attachment state, and analysis state

#### Scenario: Tester opens an API record
- **WHEN** a tester selects a backend record from the Training section in API mode
- **THEN** the app displays the record details using backend record data and mapped exercise metadata

### Requirement: Android app edits local training records
The Android app SHALL allow a tester to update editable fields on a training record in the selected backend mode.

#### Scenario: Valid mock edit is saved
- **WHEN** a tester changes editable fields in mock mode and saves
- **THEN** the app updates the local record
- **THEN** subsequent list and detail views show the updated values

#### Scenario: Valid API edit is saved
- **WHEN** a tester changes editable record metrics in API mode and saves
- **THEN** the app updates the backend record through the backend update endpoint
- **THEN** the app refreshes backend records and stats
- **THEN** subsequent list and detail views show the updated backend values

#### Scenario: API record edit fails
- **WHEN** API mode record update is rejected by the backend or network
- **THEN** the app displays a recoverable save error
- **THEN** the previous record state remains visible

### Requirement: Android app deletes local training records
The Android app SHALL allow a tester to delete a training record in the selected backend mode.

#### Scenario: Mock delete is confirmed
- **WHEN** a tester confirms deletion for a local record in mock mode
- **THEN** the app removes the record from local MVP storage
- **THEN** the Training section no longer displays the record

#### Scenario: API delete is confirmed
- **WHEN** a tester confirms deletion for a backend record in API mode
- **THEN** the app deletes the record through the backend delete endpoint
- **THEN** the app refreshes backend records and stats
- **THEN** the Training section no longer displays the record

#### Scenario: API record delete fails
- **WHEN** API mode record deletion is rejected by the backend or network
- **THEN** the app displays a recoverable delete error
- **THEN** the record remains visible

## ADDED Requirements

### Requirement: Android app uses backend exercise catalog for API records
The Android app SHALL use backend exercise catalog data when creating or editing records in API mode.

#### Scenario: API exercise catalog loads
- **WHEN** API mode refreshes backend exercise catalog data
- **THEN** the app exposes selectable exercises with backend IDs, names, and categories

#### Scenario: Catalog is unavailable
- **WHEN** API mode cannot load the backend exercise catalog
- **THEN** the app prevents backend record creation that requires an exercise ID
- **THEN** the app displays a recoverable catalog error
