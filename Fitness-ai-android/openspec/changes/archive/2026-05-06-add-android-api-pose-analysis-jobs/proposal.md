## Why

Android still uses simulated analysis even when API mode is enabled. Once backend records and videos exist, API mode should start real backend pose-analysis jobs and surface their progress/results through the same record detail experience.

## What Changes

- Add API-mode pose-analysis repository behavior using backend job endpoints.
- Start backend analysis jobs for records with uploaded videos.
- Poll job status until terminal success/failure and map backend results into `AnalysisResult`.
- Preserve mock-mode simulated analysis and local notification behavior.
- Keep failures recoverable without deleting the video or clearing the authenticated session.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `android-simulated-analysis`: Analysis behavior becomes selected-backend aware while mock mode remains simulated.
- `android-api-foundation`: API mode gains authenticated pose-analysis job handling.

## Impact

- Affected Android code: analysis repository contract/implementation, API pose-analysis repository, ViewModel start-analysis flow, record detail UI states, and tests.
- No backend changes.
- Depends on backend record IDs and uploaded backend videos from earlier API record/video changes.
