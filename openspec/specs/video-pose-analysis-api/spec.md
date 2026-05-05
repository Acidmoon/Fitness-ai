# Video Pose Analysis API Specification

## Purpose

Define backend API behavior for triggering and retrieving MoveNet pose analysis for stored exercise record videos.

## Requirements

### Requirement: Authenticated users can trigger pose analysis for owned record videos
The system SHALL allow an authenticated active user to trigger MoveNet pose analysis for an exercise record they own when that record has a stored video.

#### Scenario: Successful pose analysis trigger
- **WHEN** an authenticated active user triggers pose analysis for an owned record with a stored video
- **THEN** the system resolves the stored video path safely
- **THEN** the system analyzes sampled frames through the pose analysis runtime
- **THEN** the system stores compact pose analysis data on the record
- **THEN** the system returns the analysis summary

#### Scenario: Record not found
- **WHEN** an authenticated user triggers pose analysis for a record they do not own or that does not exist
- **THEN** the system returns `404 Not Found`

#### Scenario: Record has no stored video
- **WHEN** an authenticated user triggers pose analysis for an owned record without a stored video
- **THEN** the system returns `400 Bad Request`

#### Scenario: Stored video file missing
- **WHEN** an authenticated user triggers pose analysis for an owned record whose stored video file is missing
- **THEN** the system returns `404 Not Found`

#### Scenario: Inactive user trigger
- **WHEN** an authenticated inactive user triggers pose analysis
- **THEN** the system returns `403 Forbidden`

### Requirement: Users can retrieve stored pose analysis results
The system SHALL allow an authenticated active user to retrieve the latest stored pose analysis result for an exercise record they own.

#### Scenario: Existing analysis result
- **WHEN** an authenticated active user requests pose analysis for an owned record that has stored analysis data
- **THEN** the system returns the stored pose analysis result

#### Scenario: No analysis result
- **WHEN** an authenticated active user requests pose analysis for an owned record without stored analysis data
- **THEN** the system returns an idle or not-analyzed status

#### Scenario: Other user's analysis result
- **WHEN** an authenticated user requests pose analysis for a record they do not own
- **THEN** the system returns `404 Not Found`

### Requirement: Pose analysis storage is compact and bounded
The system SHALL store pose analysis data in a compact schema that respects the existing exercise record keypoints data size limit.

#### Scenario: Sampled result stored
- **WHEN** video analysis succeeds
- **THEN** the stored result includes schema version, status, model metadata, summary metrics, and sampled frame keypoints

#### Scenario: Analysis output too large
- **WHEN** generated analysis data exceeds the allowed keypoints data size
- **THEN** the system reduces stored frame detail or returns a controlled error without committing oversized data

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
