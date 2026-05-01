## ADDED Requirements

### Requirement: Record detail page can preview pose scoring
The frontend SHALL allow a user to preview pose-derived scoring for a record after pose analysis is available.

#### Scenario: Preview scoring succeeds
- **WHEN** a record has completed pose analysis and the user requests a scoring preview
- **THEN** the page sends a scoring request without applying results
- **THEN** the page displays the returned score, repetition count, confidence, metrics, and feedback

#### Scenario: Scoring unavailable
- **WHEN** the backend reports missing analysis, stale analysis, or low-confidence keypoints
- **THEN** the page shows the scoring error without modifying record score, count, or feedback

#### Scenario: Exercise unsupported
- **WHEN** the backend returns an unsupported scoring status
- **THEN** the page communicates that the current exercise does not support pose scoring
- **THEN** the page does not offer a persisted score update from that result

### Requirement: User explicitly applies pose scoring
The frontend SHALL apply AI-generated score, count, and feedback only after an explicit user action.

#### Scenario: Apply scoring succeeds
- **WHEN** the user applies a scored preview
- **THEN** the page sends a scoring request with application enabled
- **THEN** the page refreshes the record detail so persisted score, count, and feedback are visible

#### Scenario: Apply in progress
- **WHEN** a scoring application request is pending
- **THEN** the apply control is disabled to prevent duplicate submissions

### Requirement: Pose scoring service is typed
The frontend SHALL expose typed service methods and response contracts for pose scoring preview and application.

#### Scenario: Service request payload
- **WHEN** the frontend requests pose scoring
- **THEN** the service sends the backend `apply` flag explicitly
- **THEN** the service returns a typed pose scoring result
