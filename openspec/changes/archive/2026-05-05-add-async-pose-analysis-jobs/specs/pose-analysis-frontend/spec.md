## ADDED Requirements

### Requirement: Frontend can start asynchronous pose analysis
The frontend SHALL start pose analysis through the asynchronous job API when a record has a stored video.

#### Scenario: Start analysis job
- **WHEN** the user starts pose analysis from a record detail page with a stored video
- **THEN** the frontend creates a pose-analysis job
- **THEN** the page shows the returned queued or running status

### Requirement: Frontend polls pose analysis job status
The frontend SHALL poll the backend for job status until the job reaches a terminal state.

#### Scenario: Job still running
- **WHEN** a pose-analysis job is queued or running
- **THEN** the frontend keeps the analysis controls in a pending state and continues polling at a bounded interval

#### Scenario: Job succeeded
- **WHEN** a pose-analysis job succeeds
- **THEN** the frontend stops polling
- **THEN** the frontend refreshes the pose-analysis result and record detail data

#### Scenario: Job failed
- **WHEN** a pose-analysis job fails
- **THEN** the frontend stops polling
- **THEN** the frontend shows the sanitized failure message without removing the stored video state
