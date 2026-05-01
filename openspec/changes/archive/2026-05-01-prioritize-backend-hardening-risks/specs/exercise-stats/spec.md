## MODIFIED Requirements

### Requirement: Authenticated users can fetch weekly statistics
The system SHALL return daily aggregated statistics for the authenticated active user for the recent seven-day window from `GET /api/stats/weekly`, and day-bucket calculation SHALL be stable across supported database backends through normalized timestamp semantics.

#### Scenario: Successful weekly stats fetch
- **WHEN** an authenticated active user requests `GET /api/stats/weekly`
- **THEN** the system returns a list of daily statistics entries

#### Scenario: Weekly stats use normalized day boundaries
- **WHEN** the same stored exercise records are aggregated through supported database backends
- **THEN** the system groups them into the same calendar-day buckets for the recent seven-day window

#### Scenario: Authentication is required for weekly stats
- **WHEN** a request to `GET /api/stats/weekly` does not include valid authentication
- **THEN** the system returns `401 Unauthorized`

#### Scenario: Inactive account requests weekly stats
- **WHEN** an authenticated inactive user requests `GET /api/stats/weekly`
- **THEN** the system returns `403 Forbidden`
