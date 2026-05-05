## ADDED Requirements

### Requirement: Android app lists local training records
The Android app SHALL display locally available training records in the Training section.

#### Scenario: Records exist
- **WHEN** a tester opens the Training section and local records exist
- **THEN** the app displays the records with exercise name, date, count or duration, and score when available

#### Scenario: No records exist
- **WHEN** a tester opens the Training section and no local records exist
- **THEN** the app displays an empty state with a way to create a training record

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
