## 1. Dependencies and Configuration

- [x] 1.1 Add Retrofit, OkHttp, Kotlin serialization converter, DataStore or token-storage dependencies, and required Kotlin serialization plugin configuration.
- [x] 1.2 Add backend mode and base URL configuration, with mock mode remaining the default for local internal testing.
- [x] 1.3 Document emulator and device backend URL expectations, including `10.0.2.2` for Android emulator access to the host backend.

## 2. Network Core

- [x] 2.1 Create API client construction code for Retrofit, OkHttp, JSON serialization, and common service registration.
- [x] 2.2 Implement a token store abstraction with Android-backed and in-memory test implementations.
- [x] 2.3 Implement an authorization interceptor that attaches bearer tokens to authenticated requests.
- [x] 2.4 Implement API error mapping for backend 4xx/5xx responses and network failures.

## 3. Backend Contract Layer

- [x] 3.1 Add Retrofit service interfaces for auth, user profile, exercise records, stats, video, pose-analysis, and pose-scoring endpoints.
- [x] 3.2 Add DTOs for token, user profile, exercise records, exercises, stats summary, video upload response, pose-analysis jobs, pose-analysis result, and pose-scoring result.
- [x] 3.3 Add mapper functions from DTOs into existing Android domain models used by Compose screens.
- [x] 3.4 Add focused mapper tests using representative backend JSON-shaped data.

## 4. Repository Selection and Authentication

- [x] 4.1 Add an app-level repository factory or container that selects mock or API-backed repositories from the configured backend mode.
- [x] 4.2 Refactor the ViewModel to receive repositories from the factory instead of constructing in-memory repositories directly.
- [x] 4.3 Implement API-backed auth repository login using the backend OAuth2 form login endpoint.
- [x] 4.4 Fetch or map backend profile data after API login where available, while preserving role simulation behavior.
- [x] 4.5 Clear the stored token on logout in API mode.

## 5. Compatibility and Fallbacks

- [x] 5.1 Keep existing mock login, mock records, local video attachment, simulated analysis, and local notification flows working in mock mode.
- [x] 5.2 In API mode, keep capabilities not implemented by this change on their existing mock/local repository implementations.
- [x] 5.3 Ensure API connection and authentication failures surface as recoverable login or data-layer errors.

## 6. Verification

- [x] 6.1 Add unit tests for token storage, authorization header injection, and error mapping.
- [x] 6.2 Add unit tests for repository mode selection.
- [x] 6.3 Verify mock mode still passes existing focused tests and local app flows.
- [x] 6.4 Verify API mode can authenticate against a running local backend with valid credentials.
- [x] 6.5 Run `.\gradlew.bat testDebugUnitTest assembleDebug --no-daemon`.
