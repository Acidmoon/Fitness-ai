## ADDED Requirements

### Requirement: Authenticated users can create pose analysis jobs
The system SHALL allow an authenticated active user to create an asynchronous pose-analysis job for an owned exercise record with a stored video.

#### Scenario: Successful job creation
- **WHEN** an authenticated active user creates a pose-analysis job for an owned record with a stored video
- **THEN** the backend creates a job associated with that record and user
- **THEN** the backend returns a job identifier and non-terminal status without waiting for analysis completion

#### Scenario: Record has no stored video
- **WHEN** an authenticated active user creates a pose-analysis job for an owned record without a stored video
- **THEN** the backend returns `400 Bad Request`

#### Scenario: Other user's record
- **WHEN** an authenticated user creates a pose-analysis job for a record they do not own
- **THEN** the backend returns `404 Not Found`

### Requirement: Users can poll pose analysis job status
The system SHALL allow authenticated active users to retrieve status for their own pose-analysis jobs.

#### Scenario: Job is queued or running
- **WHEN** an authenticated active user requests a job they own that has not completed
- **THEN** the backend returns the current job status and does not return another user's data

#### Scenario: Job succeeds
- **WHEN** an authenticated active user requests a completed successful job
- **THEN** the backend returns succeeded status and the record has the latest pose analysis result available through the analysis result API

#### Scenario: Job fails
- **WHEN** an authenticated active user requests a failed job
- **THEN** the backend returns failed status and a sanitized error message

#### Scenario: Other user's job
- **WHEN** an authenticated user requests a job owned by another user
- **THEN** the backend returns `404 Not Found`

### Requirement: Pose analysis jobs have terminal states
The system SHALL record whether each pose-analysis job is queued, running, succeeded, or failed.

#### Scenario: Successful analysis processing
- **WHEN** a queued pose-analysis job is processed successfully
- **THEN** the job status becomes succeeded
- **THEN** the compact analysis result is stored for the associated exercise record

#### Scenario: Analysis processing error
- **WHEN** pose-analysis processing fails for a job
- **THEN** the job status becomes failed
- **THEN** the error stored for client display is sanitized
