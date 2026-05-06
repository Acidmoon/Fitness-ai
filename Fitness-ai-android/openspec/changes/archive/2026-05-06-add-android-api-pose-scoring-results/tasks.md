## 1. Repository and API Flow

- [x] 1.1 Add API-mode pose-scoring operation using the existing backend service.
- [x] 1.2 Map scoring score, count, confidence, and feedback into Android domain state.
- [x] 1.3 Support preview-only scoring and applied scoring behavior if backend supports both.
- [x] 1.4 Preserve mock-mode simulated score preview behavior.

## 2. UI and State

- [x] 2.1 Add record detail controls for API scoring when analysis is completed.
- [x] 2.2 Display scoring score/count/confidence/feedback without hiding analysis metadata.
- [x] 2.3 Refresh backend records and stats after applied scoring updates.
- [x] 2.4 Show recoverable scoring errors without clearing analysis or video state.

## 3. Verification

- [x] 3.1 Add MockWebServer tests for pose-scoring request paths and response mapping.
- [x] 3.2 Add tests that applied scoring refreshes record and stats state.
- [x] 3.3 Add tests that scoring failure preserves existing analysis/video state.
- [x] 3.4 Run `.\gradlew.bat testDebugUnitTest assembleDebug --no-daemon`.
