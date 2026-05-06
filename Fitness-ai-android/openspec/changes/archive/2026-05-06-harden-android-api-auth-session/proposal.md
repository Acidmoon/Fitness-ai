## Why

API authentication now stores bearer tokens, but the Android app does not restore an API session after process restart and silently treats profile fetch failures as successful logins. The auth layer should make token/session behavior explicit before more API-backed repositories depend on it.

## What Changes

- Add API session bootstrap from a stored token by fetching the backend profile when API mode starts.
- Clear stale tokens when bootstrap or authenticated profile fetch receives authentication or authorization failures.
- Define which profile fetch failures may fall back to a username-only session and which must fail login.
- Cache bearer tokens in memory for the authorization interceptor while keeping DataStore as persistent storage.
- Add tests for restart bootstrap, stale-token clearing, profile failure behavior, logout clearing, and cached authorization headers.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `android-api-foundation`: Strengthen token storage and bearer attachment requirements with startup restoration, stale-token handling, and cached token reads.
- `android-app-shell`: Clarify API mode login/session behavior after app restart and when profile retrieval fails.

## Impact

- Affected Android code: TokenStore implementation, authorization interceptor, API auth repository, app repository container/ViewModel initialization, and unit tests.
- No backend API changes.
- Mock mode behavior should remain unchanged.
