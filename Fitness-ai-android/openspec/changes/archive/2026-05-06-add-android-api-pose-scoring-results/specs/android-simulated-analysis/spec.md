## ADDED Requirements

### Requirement: Android app applies API pose scoring results
The Android app SHALL allow API-mode testers to request backend pose scoring for a record with completed pose analysis and display the scoring result.

#### Scenario: API scoring preview succeeds
- **WHEN** a tester requests pose scoring for an API-mode record with completed pose analysis
- **THEN** the app sends a backend pose-scoring request for the selected record
- **THEN** the app displays returned score, count, confidence, and feedback when available

#### Scenario: API scoring is applied to record
- **WHEN** a tester applies a successful API pose-scoring result to the record
- **THEN** the backend scoring operation updates durable record metrics
- **THEN** the app refreshes backend records and stats

#### Scenario: API scoring fails
- **WHEN** the backend scoring request fails or returns an unsuccessful scoring state
- **THEN** the app displays a recoverable scoring error
- **THEN** the existing analysis result and attached video remain available

#### Scenario: Mock scoring remains simulated
- **WHEN** mock mode simulated analysis completes
- **THEN** the app continues to display the simulated score preview without requiring backend scoring
