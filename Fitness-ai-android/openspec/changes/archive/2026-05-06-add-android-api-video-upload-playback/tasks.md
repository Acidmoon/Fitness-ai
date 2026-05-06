## 1. Repository Contracts

- [x] 1.1 Convert video attachment to a suspendable result-bearing repository operation.
- [x] 1.2 Update local video repository and ViewModel callers to the new contract.
- [x] 1.3 Add API-mode video error state or event handling for upload failures.

## 2. API Video Implementation

- [x] 2.1 Implement multipart upload from selected/recorded Android `Uri` values.
- [x] 2.2 Resolve backend `video_url` values into playable Android URI state.
- [x] 2.3 Refresh backend records after successful upload or replacement.
- [x] 2.4 Clear stale analysis state when an API-mode video is replaced.

## 3. UI Wiring

- [x] 3.1 Show upload progress or disabled action state while API video upload is running.
- [x] 3.2 Show recoverable upload/playback errors on record detail without leaving the screen.
- [x] 3.3 Preserve mock-mode camera capture, picker selection, and playback behavior.

## 4. Verification

- [x] 4.1 Add unit tests for backend video URL mapping from record DTOs.
- [x] 4.2 Add repository tests for API video upload request path and multipart body.
- [x] 4.3 Add tests that upload failure does not remove existing video state or session state.
- [x] 4.4 Run `.\gradlew.bat testDebugUnitTest assembleDebug --no-daemon`.
