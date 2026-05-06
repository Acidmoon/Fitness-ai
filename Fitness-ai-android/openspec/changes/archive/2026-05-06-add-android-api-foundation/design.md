## Context

The Android MVP is a Kotlin/Jetpack Compose app with local repository interfaces and in-memory implementations. The backend already exposes FastAPI endpoints under `/api/auth`, `/api/user`, `/api/exercise`, `/api/stats`, `/api/video`, and `/api/ai`, with OAuth2 form login returning a bearer token. This change adds the Android-side foundation needed to call those APIs while keeping the MVP mock flow available for internal testing without a server.

## Goals / Non-Goals

**Goals:**
- Add a shared Retrofit/OkHttp network stack with configurable backend base URL.
- Store bearer tokens securely enough for internal Android builds and attach them to authenticated API calls.
- Define Android DTOs and mappers for the existing backend contract areas the app will integrate over time.
- Introduce one repository selection point so ViewModels can use mock or API implementations without hard-coded in-memory construction.
- Extend login so API mode can authenticate against the backend and mock mode still works offline.

**Non-Goals:**
- Full remote training-record sync.
- Multipart video upload and protected video playback implementation.
- Pose-analysis job polling and real scoring UI replacement.
- Backend endpoint or schema changes.
- Production-grade account management, refresh-token rotation, or biometric unlock.

## Decisions

### Use Retrofit, OkHttp, and kotlinx.serialization

The app will add Retrofit with an OkHttp client and Kotlin serialization converter. Retrofit keeps endpoint definitions explicit and testable, while OkHttp provides interceptors for authorization and logging. Hand-written `HttpURLConnection` code was considered, but it would spread request construction and error handling across repositories. Ktor client was also considered, but Retrofit/OkHttp is a conservative Android default and fits the current Gradle setup.

### Configure backend mode at build/runtime boundary

The app will expose a single `BackendMode` or equivalent configuration value with at least `Mock` and `Api` modes, plus a backend base URL. Debug builds can default to mock mode and allow API mode through a simple configuration path. This avoids removing the internal tester workflow while making API-backed repositories easy to enable.

### Store access tokens behind a TokenStore abstraction

The API foundation will add a `TokenStore` abstraction backed by DataStore or encrypted preferences where available. The OkHttp authorization interceptor will read the current access token and add `Authorization: Bearer <token>` for authenticated endpoints. Keeping token reads behind a small abstraction lets tests use an in-memory store and avoids binding repositories directly to Android storage APIs.

### Keep API DTOs separate from domain models

Backend response/request shapes will live in API DTO classes and map into existing domain models such as `UserSession`, `TrainingRecord`, `StatsSummary`, and analysis result concepts. This preserves the MVP UI model while allowing backend fields such as `exercise_id`, `video_url`, `keypoints_data`, and pose-analysis summaries to evolve independently. Directly reusing DTOs in Compose state was considered, but that would couple screens to backend naming and optionality.

### Limit this change to foundation plus authentication

This change will implement real backend login/profile retrieval and repository wiring, but leave full record sync, video upload/playback, and pose-analysis polling as follow-up changes. The API DTOs and service interfaces can include those endpoint contracts now, but broad behavior changes should remain out of scope to keep verification focused.

## Risks / Trade-offs

- Backend schema drift -> Keep DTO names and tests close to current FastAPI schemas and verify against generated OpenAPI or route/schema files during implementation.
- Token storage complexity -> Start with a small `TokenStore` interface and one Android-backed implementation; defer refresh-token behavior because the backend currently returns only an access token.
- Emulator/device networking differences -> Document base URL expectations, including host machine access through `10.0.2.2` for the Android emulator.
- Mock and API modes diverge -> Route both modes through the same repository interfaces and keep mapper tests for API responses.
- Protected video playback may require authenticated media requests -> Defer playback implementation details to the later video integration change while preserving the DTO field mapping for `video_url`.

## Migration Plan

1. Add network, serialization, and token-store dependencies.
2. Add API service interfaces, DTOs, error mapping, and token interceptor.
3. Add an application repository factory that selects mock or API implementations.
4. Replace direct ViewModel construction of in-memory repositories with injected or factory-provided repositories.
5. Enable API login/profile retrieval in API mode and keep mock login behavior in mock mode.
6. Add unit tests for token handling, mapper behavior, repository selection, and auth success/error flows.

Rollback is straightforward: switch the app configuration back to mock mode or remove the API repository factory wiring without changing existing mock repository behavior.

## Open Questions

- Should debug builds expose API mode through a developer-only settings screen or through build config only?
- Should token storage use AndroidX Security encrypted preferences immediately, or start with DataStore and upgrade before external testing?
