## ADDED Requirements

### Requirement: Android app provides a configurable API client
The Android app SHALL provide a shared backend API client with a configurable base URL and consistent JSON serialization.

#### Scenario: API client is built with configured base URL
- **WHEN** the app is started in API mode with a backend base URL
- **THEN** all Retrofit services use that base URL for backend requests

#### Scenario: API client parses backend JSON
- **WHEN** the backend returns a successful JSON response using the current FastAPI contract
- **THEN** the Android API layer parses the response into typed DTOs

### Requirement: Android app maps backend errors consistently
The Android app SHALL convert backend HTTP failures and network failures into recoverable Android data-layer errors.

#### Scenario: Backend returns validation or authentication error
- **WHEN** an API request receives a 4xx response with a backend error detail
- **THEN** the repository returns a failure state that preserves a user-readable message

#### Scenario: Backend is unavailable
- **WHEN** an API request fails because the server or network is unavailable
- **THEN** the repository returns a recoverable connection failure state without crashing the app

### Requirement: Android app stores and attaches bearer tokens
The Android app SHALL store backend access tokens after successful API login and attach them to authenticated backend requests.

#### Scenario: API login returns token
- **WHEN** backend login succeeds with an access token and token type
- **THEN** the app stores the access token through the token store

#### Scenario: Authenticated request is sent
- **WHEN** a repository calls an endpoint that requires authentication and a token is stored
- **THEN** the OkHttp client sends an `Authorization` header with the bearer token

#### Scenario: User logs out
- **WHEN** the user logs out while API mode is active
- **THEN** the app clears the stored access token

### Requirement: Android app defines backend DTOs and mappers
The Android app SHALL define API DTOs and mappers for backend authentication, profile, exercise records, statistics, video, pose-analysis, and pose-scoring contracts needed by Android features.

#### Scenario: Auth and profile DTOs are mapped
- **WHEN** the backend returns token or profile responses
- **THEN** the API layer maps them into Android session and profile domain models

#### Scenario: Record and stats DTOs are mapped
- **WHEN** the backend returns exercise record or statistics responses
- **THEN** the API layer maps them into Android training record and stats domain models without exposing raw DTOs to Compose screens

#### Scenario: Video and analysis DTOs are available
- **WHEN** later changes add video upload, playback, pose-analysis jobs, or scoring repositories
- **THEN** those repositories can reuse typed DTOs that match the current backend response shapes

### Requirement: Android app selects mock or API repositories from one configuration point
The Android app SHALL choose mock-backed or API-backed repository implementations from a single app-level configuration point.

#### Scenario: Mock mode is selected
- **WHEN** the app runs in mock mode
- **THEN** existing local MVP repositories are used and the app does not require a live backend

#### Scenario: API mode is selected
- **WHEN** the app runs in API mode
- **THEN** API-backed repositories are used for capabilities implemented by this change

#### Scenario: API implementation is not available for a capability
- **WHEN** API mode is selected and a capability has not yet been integrated with backend behavior
- **THEN** the app keeps using the existing mock implementation for that capability through the same repository interface
