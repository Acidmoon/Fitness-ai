## Context

Exercise records already own uploaded videos through `video_url`, and video access is ownership-scoped. Records also have a `keypoints_data` JSON column, making them a natural first storage location for compact pose analysis output.

The upload endpoint should not run analysis inline because inference can be slow and failure-prone. A separate endpoint gives users explicit control and allows retrying analysis without re-uploading video.

## Goals / Non-Goals

**Goals:**
- Add authenticated endpoints for triggering and reading pose analysis for a record.
- Enforce active-user and owner checks consistently with existing video endpoints.
- Store a compact, bounded result in `keypoints_data`.
- Return useful status, summary, and error details to the frontend.
- Keep tests independent of real TFLite inference by mocking the runtime service.

**Non-Goals:**
- No frontend UI in this change.
- No background queue unless synchronous processing proves untenable during implementation.
- No full-frame unbounded keypoint storage.
- No advanced exercise-specific scoring rules.

## Decisions

- Use explicit trigger endpoint `POST /api/ai/records/{record_id}/pose-analysis`. This keeps uploads fast and makes re-analysis possible.
- Use `GET /api/ai/records/{record_id}/pose-analysis` for retrieving the latest stored result from the record.
- Store compact JSON under `records.keypoints_data` with `schema_version`, `status`, `summary`, and sampled `frames`.
- Sample frames instead of storing every frame. This keeps the result within the current keypoints data size limit.
- Reuse video path safety helpers so analysis never reads files outside the upload directory.

## Risks / Trade-offs

- Synchronous analysis can time out for long videos -> Limit accepted duration/sample count initially and leave a later async-job change available.
- JSON size can exceed validation limits -> Store summary plus sampled frames and enforce size checks.
- Analysis can fail after upload succeeds -> Treat analysis as retryable and keep the uploaded video unchanged.
- CPU load can affect API latency -> Keep sampling conservative and document that production should move to worker execution.
