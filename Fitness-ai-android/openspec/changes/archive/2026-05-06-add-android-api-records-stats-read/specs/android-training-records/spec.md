## MODIFIED Requirements

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
