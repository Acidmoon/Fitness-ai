## Why

Android API mode can authenticate and define DTOs, but the main app still shows local mock records and locally derived stats after backend login. Reading backend records and stats is the next low-risk integration step because it exercises authenticated APIs without redesigning create/edit/delete UI flows yet.

## What Changes

- Add API-backed read repositories or read paths for exercise records and stats summary in API mode.
- Load backend exercise catalog data and use it to map record `exercise_id` values into Android record names/categories.
- Refresh remote records and stats after successful API login or restored API session.
- Keep mock mode and local write/edit/video/analysis workflows unchanged.
- Surface record or stats fetch failures as recoverable data-layer errors without crashing the app.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `android-training-records`: Allow API mode to list backend training records while mock mode continues to use local records.
- `android-dashboard-profile`: Allow API mode Home and Stats summaries to use backend stats responses while mock mode continues local derivation.
- `android-api-foundation`: Extend repository selection so API mode can use API-backed read implementations for records and stats.

## Impact

- Affected Android code: repository interfaces/container, API record repository, API stats read path, ViewModel login/bootstrap refresh flow, mapper tests, and focused repository tests.
- No backend changes.
- Write operations for remote records remain out of scope for this change.
