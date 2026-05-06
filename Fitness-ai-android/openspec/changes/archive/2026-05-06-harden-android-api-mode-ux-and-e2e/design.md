## Context

The app currently has basic flows and focused repository tests, but API-mode operations can fail at many stages: login, record refresh, record mutation, video upload, analysis polling, scoring, and stats refresh. Without consistent state handling, testers cannot tell whether the app is loading, empty, failed, or unauthenticated.

## Goals / Non-Goals

**Goals:**
- Add consistent API-mode operation state across user-facing screens.
- Provide retry/refresh actions for recoverable failures.
- Preserve mock-mode simplicity.
- Add test coverage for the full API-mode workflow and representative failure cases.
- Update documentation with the expected local backend test path.

**Non-Goals:**
- Visual redesign of the whole app.
- Offline caching or background sync.
- Backend contract changes.
- Production observability tooling.

## Decisions

### Centralize operation state in the ViewModel layer

Screens should receive explicit state such as loading, refreshing, empty, recoverable error, or unauthenticated rather than inferring it from empty lists. This avoids mixing "no data" with "data failed to load".

### Keep auth errors separate

Authentication failures should route to login/token-clearing flows. Data, video, analysis, and scoring failures should stay recoverable inside the authenticated shell unless the auth repository explicitly rejects the session.

### Add manual retry points

Every API-mode surface that can fail should expose a retry or refresh action. These actions should call the same repository refresh/mutation paths used by automatic post-login refresh.

### Use focused E2E-style unit tests first

MockWebServer tests can validate request order, headers, state transitions, and failure recovery without requiring a real device or backend. Full instrumented UI tests can be added later if needed.

## Risks / Trade-offs

- Extra state models can clutter simple screens -> Keep UI state small and screen-specific.
- E2E-style tests can become brittle -> Assert stable API paths and domain state, not cosmetic UI details.
- Retrying every failed operation can duplicate calls -> Route retries through ViewModel operations with clear ownership.

## Migration Plan

1. Add API operation state models and retry entry points.
2. Update Home, Training, Stats, and detail screens.
3. Add E2E-style API-mode tests using MockWebServer.
4. Update README/docs with the final local API-mode workflow.

## Open Questions

- Should the first retry implementation be pull-to-refresh, explicit buttons, or both?
