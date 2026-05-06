## Context

The current API auth repository stores access tokens after login and attaches them to requests through an OkHttp interceptor. Session state itself is in memory, so an app restart with a valid stored token returns to the login screen. The authorization interceptor also reads DataStore synchronously for every request, and profile fetch failures after token login are currently swallowed as a username-only session.

## Goals / Non-Goals

**Goals:**
- Restore API sessions from stored tokens on app startup when the token is still valid.
- Clear invalid or unauthorized stored tokens deterministically.
- Make profile retrieval behavior explicit during login and bootstrap.
- Avoid blocking DataStore reads on every authenticated request by caching the current token in memory.
- Preserve mock mode behavior and role simulation.

**Non-Goals:**
- Add refresh tokens or token rotation.
- Add biometric unlock or production-grade secure storage changes.
- Persist selected simulated role across app restarts.
- Convert training records, stats, video, or analysis repositories to API-backed implementations.

## Decisions

### Add a bootstrap step to the API auth repository

The API auth repository should expose or perform an initialization step that reads the stored token and calls `/api/user/profile`. A successful profile response restores `UserSession`. A 401 or 403 clears the token and leaves the session unauthenticated. Network failures should leave the user unauthenticated with a recoverable state rather than crashing.

### Distinguish login token success from profile success

After `/api/auth/login` returns a token, profile retrieval should be treated as part of API login completion for authentication/authorization failures. If profile returns 401/403, login should fail and clear the token. If profile is unavailable due to a transient network/server failure after token issuance, the implementation may either fail login with a recoverable error or use an explicitly tested fallback session; it must not silently hide contract/auth errors.

### Cache tokens in memory behind TokenStore

The token store should keep an in-memory copy of the current token after first load, save, and clear operations. The interceptor can read the cached token without blocking on DataStore for every request. DataStore remains the persistent source for process restarts. A purely synchronous DataStore read in the interceptor was considered acceptable for the foundation, but it becomes a performance risk as API usage grows.

### Keep bootstrap independent of Compose UI

Bootstrap should live in repository/container/ViewModel wiring, not in individual screens. The login screen should not know whether a session came from mock login, API login, or stored-token restoration.

## Risks / Trade-offs

- Startup profile call delays app entry -> Keep bootstrap bounded and expose unauthenticated state on failure.
- Token cache and persistent store can drift -> Update both on save/clear and test ordering.
- Fallback profile behavior can hide backend regressions -> Add tests that 401/403 cannot fallback.
- Mock mode regression -> Keep mock repository path unchanged and cover repository mode selection.

## Migration Plan

1. Introduce cached token store behavior without changing public login UI.
2. Add API auth bootstrap and call it during API-mode repository initialization or ViewModel startup.
3. Tighten login/profile error handling and tests.
4. Verify logout clears both cached and persisted token.
5. Rollback by disabling bootstrap call while retaining existing login behavior if needed.

## Open Questions

- Should transient profile failures after successful token login fail login, or should they create a clearly marked degraded session until profile can be retried?
