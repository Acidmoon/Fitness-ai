## Purpose
Define Android backend API configuration, authentication, DTO, error handling, repository selection, and API verification contracts.
## Requirements
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

#### Scenario: Profile validation receives authentication failure
- **WHEN** API login or API session bootstrap receives a 401 or 403 while fetching the backend profile
- **THEN** the repository returns a recoverable authentication failure
- **THEN** any stored or cached token from that attempt is cleared

### Requirement: Android app stores and attaches bearer tokens
The Android app SHALL store backend access tokens after successful API login, cache the current token for request authorization, restore valid stored tokens on API-mode startup, and attach bearer tokens to authenticated backend requests.

#### Scenario: API login returns token
- **WHEN** backend login succeeds with an access token and token type
- **THEN** the app stores the access token through the token store
- **THEN** the current token is available to the authorization interceptor without a per-request persistent-storage read

#### Scenario: Authenticated request is sent
- **WHEN** a repository calls an endpoint that requires authentication and a token is stored or cached
- **THEN** the OkHttp client sends an `Authorization` header with the bearer token

#### Scenario: Valid stored token restores API session
- **WHEN** the app starts in API mode with a stored access token
- **THEN** the app validates the token by fetching the backend profile
- **THEN** a successful profile response restores the Android session state

#### Scenario: Stale stored token is rejected
- **WHEN** API-mode startup profile validation receives an authentication or authorization failure
- **THEN** the app clears the stored and cached access token
- **THEN** the app remains unauthenticated without crashing

#### Scenario: User logs out
- **WHEN** the user logs out while API mode is active
- **THEN** the app clears the stored access token
- **THEN** the app clears the cached access token used by the authorization interceptor

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

### Requirement: Android app supports local debug API networking safely
The Android app SHALL allow API mode debug builds to reach documented local HTTP backend URLs while preserving stricter release-build network security.

#### Scenario: Debug build uses emulator host URL
- **WHEN** a debug build runs in API mode with `http://10.0.2.2:8000/`
- **THEN** Android network security policy permits the request to the host backend

#### Scenario: Debug build uses a LAN backend URL
- **WHEN** a debug build runs on a physical device with a documented reachable LAN HTTP backend URL
- **THEN** Android network security policy permits the local development request

#### Scenario: Release build does not broadly allow cleartext
- **WHEN** a release build is produced
- **THEN** the app does not include a broad production cleartext allowance for arbitrary HTTP API endpoints

#### Scenario: Local networking behavior is documented
- **WHEN** a developer enables API mode for local testing
- **THEN** project documentation explains emulator `10.0.2.2`, physical device LAN URLs, and release HTTPS expectations

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

### Requirement: Android app refreshes API-backed read data after authentication
The Android app SHALL refresh API-backed training records and stats after API login or stored-token session restoration succeeds.

#### Scenario: API login refreshes read data
- **WHEN** backend API login succeeds and the session is established
- **THEN** the app refreshes backend training records
- **THEN** the app refreshes backend stats summary

#### Scenario: Stored token restoration refreshes read data
- **WHEN** API mode restores a session from a valid stored token
- **THEN** the app refreshes backend training records
- **THEN** the app refreshes backend stats summary

#### Scenario: Mock mode does not require backend read refresh
- **WHEN** mock mode login succeeds
- **THEN** the app continues to use mock/local records and locally derived stats without requiring a backend

#### Scenario: API read refresh reports recoverable errors
- **WHEN** authenticated API read refresh fails for records or stats
- **THEN** the data layer returns or stores a recoverable error without clearing the authenticated session

### Requirement: Android app verifies API mode end-to-end workflow
The Android project SHALL include repeatable verification for the primary API-mode workflow from login through records, video, analysis, scoring, and stats refresh.

#### Scenario: API happy path is verified
- **WHEN** the API-mode workflow test runs against controlled backend responses
- **THEN** it verifies login, bearer token attachment, records refresh, stats refresh, record mutation, video upload, analysis completion, scoring, and final refresh behavior

#### Scenario: API failure paths are verified
- **WHEN** controlled backend responses simulate data, mutation, upload, analysis, or scoring failures
- **THEN** tests verify the app reports recoverable failures without clearing the authenticated session

#### Scenario: Local API mode is documented
- **WHEN** a developer wants to manually test API mode
- **THEN** project documentation explains backend URL configuration, emulator host URL usage, physical device LAN usage, and the expected workflow to exercise
