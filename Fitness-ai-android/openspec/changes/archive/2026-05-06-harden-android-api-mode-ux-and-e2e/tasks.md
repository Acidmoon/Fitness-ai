## 1. Operation State Model

- [x] 1.1 Add screen-level API operation states for loading, refreshing, empty, recoverable error, and unauthenticated.
- [x] 1.2 Keep authentication/token failures separate from recoverable data workflow failures.
- [x] 1.3 Add ViewModel retry/refresh entry points for records, stats, video, analysis, and scoring where applicable.

## 2. UI Hardening

- [x] 2.1 Update Home and Stats to show API loading, empty, error, and retry states.
- [x] 2.2 Update Training list and record detail to show API loading, empty, error, and retry states.
- [x] 2.3 Disable duplicate actions while API mutations/uploads/analysis/scoring are in flight.
- [x] 2.4 Preserve mock-mode UX and avoid adding unnecessary backend-only text to mock flows.

## 3. E2E-Style Verification

- [x] 3.1 Add MockWebServer workflow test for API login, records refresh, stats refresh, record create, video upload, analysis, and scoring.
- [x] 3.2 Add failure-path tests for refresh failure, mutation failure, upload failure, analysis failure, and scoring failure.
- [x] 3.3 Verify bearer token attachment across authenticated workflow requests.
- [x] 3.4 Update README/docs with local API-mode setup and full manual verification path.

## 4. Final Validation

- [x] 4.1 Run `.\gradlew.bat testDebugUnitTest assembleDebug --no-daemon`.
- [x] 4.2 Confirm mock mode remains usable without a backend.
- [x] 4.3 Confirm API mode can be built with `-PFITNESS_AI_BACKEND_MODE=api`.
