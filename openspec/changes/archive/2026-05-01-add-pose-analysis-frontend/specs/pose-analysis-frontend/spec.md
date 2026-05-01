## ADDED Requirements

### Requirement: Record detail page can trigger pose analysis
The frontend SHALL allow a user to trigger pose analysis from the record detail page when the record has a stored video.

#### Scenario: Video available
- **WHEN** the record detail page displays a record with a stored video
- **THEN** the page shows a control to start pose analysis

#### Scenario: No video available
- **WHEN** the record detail page displays a record without a stored video
- **THEN** the page does not offer pose analysis execution
- **THEN** the page communicates that video is required for analysis

#### Scenario: Trigger in progress
- **WHEN** the user starts pose analysis
- **THEN** the trigger control enters a pending state
- **THEN** the page prevents duplicate trigger submissions until the request completes

### Requirement: Record detail page displays pose analysis status
The frontend SHALL display the latest pose analysis status and summary for the current record.

#### Scenario: Analysis not started
- **WHEN** the backend returns no stored analysis result
- **THEN** the page shows an idle analysis state

#### Scenario: Analysis complete
- **WHEN** the backend returns a completed analysis result
- **THEN** the page shows summary metrics including model, valid frame count, and average confidence

#### Scenario: Analysis failed
- **WHEN** the backend returns or the trigger request encounters an analysis failure
- **THEN** the page shows an error message without removing the associated video state

### Requirement: Pose analysis UI refreshes record context
The frontend SHALL refresh relevant record and analysis data after analysis completes.

#### Scenario: Trigger succeeds
- **WHEN** pose analysis trigger succeeds
- **THEN** the page refreshes the record detail and analysis query data
