## ADDED Requirements

### Requirement: Android app reflects applied API scoring on training records
The Android app SHALL reflect applied backend pose-scoring results in training record list, detail, Home, and Stats data.

#### Scenario: Applied API scoring updates record detail
- **WHEN** backend pose scoring is applied to an API-mode training record
- **THEN** the record detail screen displays the backend-applied score and count values after refresh

#### Scenario: Applied API scoring updates record list
- **WHEN** backend pose scoring is applied to an API-mode training record
- **THEN** the Training section displays the refreshed score and count values for that record

#### Scenario: Applied API scoring updates aggregates
- **WHEN** backend pose scoring is applied and stats refresh succeeds
- **THEN** Home and Stats summaries reflect the refreshed backend aggregate values

#### Scenario: Applied scoring refresh fails
- **WHEN** backend scoring succeeds but a follow-up records or stats refresh fails
- **THEN** the app displays a recoverable refresh error
- **THEN** the authenticated session remains active
