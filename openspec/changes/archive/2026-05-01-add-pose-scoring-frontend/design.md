## Context

The record detail page already fetches record data, pose analysis status, and video state. The backend now exposes `POST /api/ai/records/{record_id}/pose-scoring` with an `apply` flag, so the frontend can add scoring without changing record CRUD APIs.

## Goals / Non-Goals

**Goals:**

- Add a typed frontend service for pose scoring preview and application.
- Display score, count, confidence, metrics, and feedback in the record detail AI area.
- Require explicit user action before AI-generated score/count/feedback overwrite record values.
- Refresh record detail after successful application so visible values match persisted data.

**Non-Goals:**

- No new backend endpoints or scoring rules in this change.
- No frontend repository tracking policy changes; `Fitness-ai-frontend/` remains ignored by root Git.
- No multi-record batch scoring UI.
- No visual keypoint overlay or timeline chart.

## Decisions

- Reuse the existing `pose-analysis-api.ts` service area instead of introducing a separate AI service. This keeps all record-level AI calls in one frontend module.
- Use React Query mutations for preview and apply. Preview stores the returned scoring result in component state; apply invalidates record detail and pose scoring context after the backend persists changes.
- Gate scoring UI behind completed pose analysis. This matches backend behavior and avoids presenting a scoring action when keypoints are not available.
- Treat unsupported exercises as a valid non-error result. The backend returns `unsupported`; the UI should show that status without overwriting user-entered values.

## Risks / Trade-offs

- Frontend files are ignored by root Git -> The implementation is local until tracking policy changes or the frontend is committed separately.
- Rule-based scores can be imperfect -> The UI presents preview first and requires explicit apply.
- Pose analysis and record detail can drift after re-analysis -> Successful pose analysis and scoring application both invalidate relevant queries.
- Error messages come from backend strings -> The UI falls back to generic messages when backend details are unavailable.
