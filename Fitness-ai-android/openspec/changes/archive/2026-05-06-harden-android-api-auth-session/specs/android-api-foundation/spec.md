## MODIFIED Requirements

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
