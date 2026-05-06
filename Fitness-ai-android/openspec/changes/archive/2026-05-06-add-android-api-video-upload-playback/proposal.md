## Why

Android API mode can now work with backend records, but video attachment still stores only a local URI. Backend AI analysis requires videos to be uploaded against backend record IDs, so API video upload and playback must come before real pose-analysis integration.

## What Changes

- Upload selected or recorded videos to the backend video endpoint in API mode.
- Map backend `video_url` data into Android record video preview state.
- Keep mock mode local URI video attachment and playback unchanged.
- Clear stale analysis state when a video is replaced.
- Surface upload, delete, or playback failures as recoverable UI/data-layer errors.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `android-video-workflow`: Video record/select/preview/replace behavior becomes selected-backend aware.
- `android-api-foundation`: API mode gains authenticated video media upload and backend video URL handling.

## Impact

- Affected Android code: video repository contract, API video repository, record mapper, ViewModel video attach flow, record detail UI, and video tests.
- No backend changes.
- Depends on API-mode backend record IDs from `add-android-api-record-crud-exercise-catalog`.
