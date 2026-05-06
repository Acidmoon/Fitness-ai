## Why

Android API mode can authenticate and read backend records/stats, but create, edit, and delete actions still mutate only the local in-memory list. Remote record mutation is the next required step before video upload and AI analysis can reliably target backend `record_id` values.

## What Changes

- Add API-backed create, update, and delete behavior for training records in API mode.
- Load and expose the backend exercise catalog for API-mode record creation/editing.
- Preserve mock-mode free-form local record creation, editing, deletion, and stats derivation.
- Refresh records and stats after successful API mutations so Home, Training, and Stats stay consistent.
- Treat API mutation failures as recoverable data-layer errors without clearing the authenticated session.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `android-training-records`: Training record create, edit, delete, and detail behavior becomes selected-backend aware.
- `android-api-foundation`: API mode gains authenticated exercise catalog loading and record mutation behavior.

## Impact

- Affected Android code: repository contracts, API record repository, ViewModel record save/delete flow, record editor UI, record mapper tests, and repository tests.
- No backend changes.
- Later video and pose-analysis changes will depend on backend record IDs produced by this change.
