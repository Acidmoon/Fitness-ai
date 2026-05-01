# Exercise Statistics Specification

## Purpose

Define the current authenticated statistics endpoints for exercise summaries, recent trends, and personal bests.

## Requirements

### Requirement: Authenticated users can fetch summary statistics
The system SHALL return aggregate exercise statistics for the authenticated user from `GET /api/stats/summary`.

#### Scenario: Successful summary fetch
- **WHEN** an authenticated user requests `GET /api/stats/summary`
- **THEN** the system returns `exercise_stats`, `category_stats`, and `recent_records`

#### Scenario: Authentication is required for summary fetch
- **WHEN** a request to `GET /api/stats/summary` does not include valid authentication
- **THEN** the system returns `401 Unauthorized`

### Requirement: Authenticated users can fetch weekly statistics
The system SHALL return daily aggregated statistics for the authenticated user for the recent seven-day window from `GET /api/stats/weekly`.

#### Scenario: Successful weekly stats fetch
- **WHEN** an authenticated user requests `GET /api/stats/weekly`
- **THEN** the system returns a list of daily statistics entries

#### Scenario: Authentication is required for weekly stats
- **WHEN** a request to `GET /api/stats/weekly` does not include valid authentication
- **THEN** the system returns `401 Unauthorized`

### Requirement: Authenticated users can fetch personal best statistics
The system SHALL return per-exercise personal best values for the authenticated user from `GET /api/stats/personal-best`.

#### Scenario: Successful personal best fetch
- **WHEN** an authenticated user requests `GET /api/stats/personal-best`
- **THEN** the system returns a list of per-exercise best score and best count values

#### Scenario: Authentication is required for personal best fetch
- **WHEN** a request to `GET /api/stats/personal-best` does not include valid authentication
- **THEN** the system returns `401 Unauthorized`
