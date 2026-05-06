## ADDED Requirements

### Requirement: Android app shows API Home and Stats operation states
The Android app SHALL show distinct API-mode loading, empty, error, and retry states for Home and Stats data.

#### Scenario: API Home or Stats is loading
- **WHEN** API mode is refreshing records or stats for Home or Stats
- **THEN** the app shows a loading or refreshing state without presenting stale data as newly loaded data

#### Scenario: API Home or Stats is empty
- **WHEN** API mode successfully loads zero backend records or zero aggregate stats
- **THEN** Home and Stats show zero-state content without crashing

#### Scenario: API Home or Stats refresh fails
- **WHEN** API mode cannot refresh Home or Stats because backend data requests fail
- **THEN** the app displays a recoverable refresh error
- **THEN** the app offers a retry path
- **THEN** the authenticated session remains active
