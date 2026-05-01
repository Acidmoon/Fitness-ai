## ADDED Requirements

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
