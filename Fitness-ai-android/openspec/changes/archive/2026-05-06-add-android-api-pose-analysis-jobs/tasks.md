## 1. Analysis Repository Wiring

- [x] 1.1 Add API pose-analysis repository implementation selected only in API mode.
- [x] 1.2 Preserve simulated analysis repository selection in mock mode.
- [x] 1.3 Add configurable polling interval/attempt behavior for tests and debug use.

## 2. API Job Flow

- [x] 2.1 Start backend pose-analysis jobs for records with backend video state.
- [x] 2.2 Prevent duplicate analysis starts while queued or running.
- [x] 2.3 Poll backend job status until completed or failed.
- [x] 2.4 Fetch or map final pose-analysis result into Android `AnalysisResult`.
- [x] 2.5 Store failed job state as recoverable record analysis state.

## 3. UI and State Handling

- [x] 3.1 Keep record detail action states correct for queued/running/completed/failed API analysis.
- [x] 3.2 Show API analysis failure messages without removing attached video.
- [x] 3.3 Reuse local completion notification only after terminal completed analysis state.

## 4. Verification

- [x] 4.1 Add MockWebServer tests for job creation, polling, and completed result mapping.
- [x] 4.2 Add tests for failed job and timeout behavior.
- [x] 4.3 Add tests that mock mode still uses simulated analysis behavior.
- [x] 4.4 Run `.\gradlew.bat testDebugUnitTest assembleDebug --no-daemon`.
