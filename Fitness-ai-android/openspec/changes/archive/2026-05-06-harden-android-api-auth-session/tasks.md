## 1. Token Store and Interceptor

- [x] 1.1 Refactor the token store to maintain an in-memory cached access token synchronized with persistent storage saves and clears.
- [x] 1.2 Update the authorization interceptor to read the cached token without a per-request DataStore read.
- [x] 1.3 Add unit tests for cached token save, first-load, clear, and authorization header behavior.

## 2. API Session Bootstrap

- [x] 2.1 Add API auth repository bootstrap behavior that reads a stored token and fetches backend profile data.
- [x] 2.2 Wire API-mode repository or ViewModel startup to trigger bootstrap without changing mock mode.
- [x] 2.3 Restore `UserSession` from profile data when bootstrap succeeds.
- [x] 2.4 Clear stored and cached tokens when bootstrap receives 401 or 403.

## 3. Login and Profile Failure Handling

- [x] 3.1 Make API login profile-fetch behavior explicit for authentication/authorization failures versus transient network/server failures.
- [x] 3.2 Ensure 401 or 403 during post-login profile fetch fails login and clears the token from the attempted login.
- [x] 3.3 Preserve role simulation behavior after API login and after restored API sessions.
- [x] 3.4 Ensure API logout clears both persisted and cached token state.

## 4. Verification

- [x] 4.1 Add unit tests for valid stored-token session restoration.
- [x] 4.2 Add unit tests for stale-token clearing on bootstrap and post-login profile failure.
- [x] 4.3 Add unit tests confirming mock mode repository selection and login behavior remain unchanged.
- [x] 4.4 Run `.\gradlew.bat testDebugUnitTest assembleDebug --no-daemon`.
