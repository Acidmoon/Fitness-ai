## MODIFIED Requirements

### Requirement: Android app shows Home overview
The Android app SHALL show a Home overview with summary metrics and recent training records from the selected backend mode.

#### Scenario: Mock home data exists
- **WHEN** a tester opens Home in mock mode and local MVP data exists
- **THEN** the app displays summary metrics and recent training records based on local MVP data

#### Scenario: API home data exists
- **WHEN** a tester opens Home in API mode after backend records and stats refresh succeeds
- **THEN** the app displays backend summary metrics and recent backend training records

#### Scenario: Empty home data
- **WHEN** a tester opens Home before records are available for the selected backend mode
- **THEN** the app displays an empty or zero-state summary without crashing

### Requirement: Android app shows Stats summary
The Android app SHALL show a Stats section derived from local MVP training records in mock mode and backend stats responses in API mode.

#### Scenario: Mock stats exist
- **WHEN** a tester opens the Stats section in mock mode and local records exist
- **THEN** the app displays aggregate metrics such as total records, total count or duration, and best score when available

#### Scenario: API stats exist
- **WHEN** a tester opens the Stats section in API mode after backend stats refresh succeeds
- **THEN** the app displays aggregate metrics from the backend stats summary response

#### Scenario: No stats exist
- **WHEN** a tester opens the Stats section and no records exist for the selected backend mode
- **THEN** the app displays a zero-state summary without crashing

#### Scenario: Stats refresh fails
- **WHEN** API mode cannot refresh backend stats because the server or network is unavailable
- **THEN** the app keeps running and exposes a recoverable data-layer error
