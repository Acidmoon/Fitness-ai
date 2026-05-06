## Why

After API auth, record CRUD, video, analysis, and scoring are integrated, the Android app needs a hardened API-mode user experience. Testers should be able to distinguish loading, empty data, recoverable backend failures, and authentication failures, and the project needs an end-to-end verification path for the full API workflow.

## What Changes

- Add consistent API-mode loading, empty, error, and retry states across Home, Training, Stats, and record detail workflows.
- Keep authentication failures distinct from recoverable data/video/analysis/scoring failures.
- Add manual retry/refresh affordances for API-mode data operations.
- Document the local API-mode testing path.
- Add end-to-end style tests around the API-mode happy path and key failure states.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `android-app-shell`: Authenticated shell SHALL communicate API operation state consistently.
- `android-api-foundation`: API mode SHALL have an end-to-end verification contract.
- `android-dashboard-profile`: Home and Stats SHALL expose loading, empty, error, and retry behavior for API mode.
- `android-training-records`: Training list/detail SHALL expose loading, empty, error, and retry behavior for API mode.

## Impact

- Affected Android code: UI state models, ViewModel operation state, screen composables, tests, and README/docs.
- No backend changes.
- Should be implemented after the preceding API integration changes so E2E coverage reflects the complete flow.
