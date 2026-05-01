## MODIFIED Requirements

### Requirement: Authenticated users can fetch summary statistics
The system SHALL return aggregate exercise statistics for the authenticated active user from `GET /api/stats/summary`.

#### Scenario: Successful summary fetch
- **WHEN** an authenticated active user requests `GET /api/stats/summary`
- **THEN** the system returns `exercise_stats`, `category_stats`, and `recent_records`

#### Scenario: Authentication is required for summary fetch
- **WHEN** a request to `GET /api/stats/summary` does not include valid authentication
- **THEN** the system returns `401 Unauthorized`

#### Scenario: Inactive account requests summary stats
- **WHEN** an authenticated inactive user requests `GET /api/stats/summary`
- **THEN** the system returns `403 Forbidden`

### Requirement: Authenticated users can fetch weekly statistics
The system SHALL return daily aggregated statistics for the authenticated active user for the recent seven-day window from `GET /api/stats/weekly`.

#### Scenario: Successful weekly stats fetch
- **WHEN** an authenticated active user requests `GET /api/stats/weekly`
- **THEN** the system returns a list of daily statistics entries

#### Scenario: Authentication is required for weekly stats
- **WHEN** a request to `GET /api/stats/weekly` does not include valid authentication
- **THEN** the system returns `401 Unauthorized`

#### Scenario: Inactive account requests weekly stats
- **WHEN** an authenticated inactive user requests `GET /api/stats/weekly`
- **THEN** the system returns `403 Forbidden`

### Requirement: Authenticated users can fetch personal best statistics
The system SHALL return per-exercise personal best values for the authenticated active user from `GET /api/stats/personal-best`.

#### Scenario: Successful personal best fetch
- **WHEN** an authenticated active user requests `GET /api/stats/personal-best`
- **THEN** the system returns a list of per-exercise best score and best count values

#### Scenario: Authentication is required for personal best fetch
- **WHEN** a request to `GET /api/stats/personal-best` does not include valid authentication
- **THEN** the system returns `401 Unauthorized`

#### Scenario: Inactive account requests personal best
- **WHEN** an authenticated inactive user requests `GET /api/stats/personal-best`
- **THEN** the system returns `403 Forbidden`
