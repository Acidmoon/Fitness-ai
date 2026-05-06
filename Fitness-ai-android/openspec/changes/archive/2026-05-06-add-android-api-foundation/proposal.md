## Why

The Android MVP currently validates the mobile flow with local/mock data only. The next step is to add a backend API foundation so authentication and future records, video, and analysis integrations can reuse one network stack without rewriting the Compose UI.

## What Changes

- Add an Android API foundation with Retrofit, OkHttp, JSON serialization, environment-based base URL configuration, and structured API error handling.
- Add secure token storage and an OkHttp authorization interceptor for authenticated requests.
- Add backend DTOs and mappers for authentication, user profile, training records, statistics, videos, and pose-analysis concepts used by the existing app.
- Add repository wiring that lets internal builds choose mock repositories or API-backed repositories from a single configuration point.
- Extend the login flow so it can use real backend authentication when API mode is enabled while preserving mock mode for offline internal testing.
- Keep full exercise record sync, video upload/playback, pose-analysis job polling, and real scoring as later changes.

## Capabilities

### New Capabilities
- `android-api-foundation`: Covers the shared Android network layer, token management, backend DTO mapping, API error handling, and repository implementation selection.

### Modified Capabilities
- `android-app-shell`: Extends authentication requirements from mock-only MVP entry to selectable mock or backend API login.

## Impact

- Affected Android code: Gradle dependencies, app configuration, auth data layer, repository factories, ViewModel wiring, and focused tests.
- Affected backend contract: Android DTOs should match the existing FastAPI/OpenAPI authentication, profile, records, statistics, video, and pose-analysis shapes where practical.
- No backend behavior changes are intended.
- No existing MVP mock workflow should be removed.
