## ADDED Requirements

### Requirement: Android app supports authenticated API pose-analysis jobs
The Android app SHALL create and poll backend pose-analysis jobs through authenticated API mode services.

#### Scenario: API analysis job create sends bearer token
- **WHEN** API mode starts pose analysis for a backend record after login
- **THEN** the job creation request includes the current bearer token
- **THEN** the request targets the configured backend pose-analysis job endpoint

#### Scenario: API analysis job polling uses configured client
- **WHEN** API mode polls a pose-analysis job
- **THEN** polling uses the configured API client and bearer token
- **THEN** backend job status is mapped to Android queued, running, completed, or failed states

#### Scenario: API analysis job failure is recoverable
- **WHEN** job creation, polling, or result retrieval fails
- **THEN** the data layer returns or stores a recoverable analysis failure
- **THEN** the authenticated session remains active
