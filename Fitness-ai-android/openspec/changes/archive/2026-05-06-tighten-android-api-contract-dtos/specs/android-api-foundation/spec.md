## MODIFIED Requirements

### Requirement: Android app defines backend DTOs and mappers
The Android app SHALL define precise API DTOs and mappers for backend authentication, profile, exercise records, statistics, video, pose-analysis, and pose-scoring contracts needed by Android features.

#### Scenario: Auth and profile DTOs are mapped
- **WHEN** the backend returns token or profile responses
- **THEN** the API layer maps them into Android session and profile domain models

#### Scenario: Record and stats DTOs are mapped
- **WHEN** the backend returns exercise record or statistics responses
- **THEN** the API layer maps them into Android training record and stats domain models without exposing raw DTOs to Compose screens

#### Scenario: Weekly stats DTO parses numeric backend fields
- **WHEN** the backend returns weekly statistics containing date, session count, and average score values
- **THEN** the Android API layer parses those fields into typed DTO properties using numeric Kotlin types for numeric JSON values

#### Scenario: Personal-best DTO parses numeric backend fields
- **WHEN** the backend returns personal-best statistics containing exercise name, best score, and best count values
- **THEN** the Android API layer parses those fields into typed DTO properties using numeric Kotlin types for numeric JSON values

#### Scenario: Stats DTO tests use backend-shaped JSON
- **WHEN** Android API DTO tests decode representative stats JSON from current backend response shapes
- **THEN** the tests fail if numeric fields are modeled as incompatible string-only values

#### Scenario: Video and analysis DTOs are available
- **WHEN** later changes add video upload, playback, pose-analysis jobs, or scoring repositories
- **THEN** those repositories can reuse typed DTOs that match the current backend response shapes
