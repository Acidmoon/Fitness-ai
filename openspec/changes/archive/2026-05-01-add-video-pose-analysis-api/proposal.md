## Why

Users can upload videos for exercise records, but the backend does not yet analyze those videos into pose data. A dedicated pose analysis API will connect uploaded videos to structured keypoints and record-level AI summaries without slowing down the upload endpoint.

## What Changes

- Add authenticated backend endpoints to trigger and retrieve pose analysis for a user's own exercise record video.
- Resolve the stored `video_url` to a safe local file path and run MoveNet analysis through the runtime service.
- Store compact analysis results in `records.keypoints_data` and summary feedback fields.
- Keep video upload focused on persistence; analysis is triggered separately.
- Add tests for ownership, missing video, successful analysis storage, and failure handling.

## Capabilities

### New Capabilities
- `video-pose-analysis-api`: Defines backend API behavior for analyzing stored exercise record videos and retrieving pose analysis results.

### Modified Capabilities

## Impact

- Affected backend areas: new AI or pose-analysis router, `app/main.py`, `app/models/exercise.py` usage, `app/schemas/exercise.py`, `app/utils/video_files.py`, tests.
- Depends on the MoveNet runtime foundation.
- May introduce CPU-heavy request behavior in the first version; long-running asynchronous jobs are intentionally deferred to a later change unless needed during implementation.
