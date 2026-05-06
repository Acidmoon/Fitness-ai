## 1. Repository Contracts

- [x] 1.1 Add refresh support for training records while preserving existing local sync write methods.
- [x] 1.2 Add a stats repository contract with `StateFlow<StatsSummary>` and refresh behavior.
- [x] 1.3 Add local/mock stats repository implementation derived from local records.

## 2. API Read Implementations

- [x] 2.1 Implement API-backed training record refresh using exercises and records endpoints.
- [x] 2.2 Map backend records to Android `TrainingRecord` with exercise catalog names/categories and fallback labels.
- [x] 2.3 Implement API-backed stats summary refresh using the stats summary endpoint.
- [x] 2.4 Ensure records/stats refresh failures are recoverable and do not clear authenticated session.

## 3. App Wiring

- [x] 3.1 Update the app repository container to select API read implementations in API mode and local implementations in mock mode.
- [x] 3.2 Update the ViewModel to collect stats from the stats repository instead of deriving all stats inline.
- [x] 3.3 Refresh records and stats after successful login and after stored-token bootstrap.
- [x] 3.4 Preserve mock mode login, records, stats, local video, and simulated analysis behavior.

## 4. Verification

- [x] 4.1 Add unit tests for API record refresh and exercise catalog mapping, including unknown exercise fallback.
- [x] 4.2 Add unit tests for API stats refresh and local stats derivation.
- [x] 4.3 Add unit tests for repository mode selection and refresh-after-auth behavior.
- [x] 4.4 Run `.\gradlew.bat testDebugUnitTest assembleDebug --no-daemon`.
