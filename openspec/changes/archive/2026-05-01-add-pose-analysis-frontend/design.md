## Context

`RecordDetailPage` currently shows video upload and an "AI result reserved area." It can already determine whether a record has a video. The missing piece is a user action to start analysis and a compact display of the resulting summary.

## Goals / Non-Goals

**Goals:**
- Add a direct "start analysis" workflow on record details.
- Show clear status based on record video availability and backend analysis state.
- Keep the first UI compact: summary metrics and feedback, not full skeleton playback.
- Reuse existing React Query and API service patterns.

**Non-Goals:**
- No canvas skeleton player in this change.
- No live camera analysis.
- No frontend-side MoveNet inference.
- No redesign of records list or dashboard.

## Decisions

- Trigger analysis from the record detail page because it already owns video maintenance and AI result layout.
- Use React Query mutations and invalidation matching existing upload/delete behavior.
- Show summary-level data first: status, valid frames, average confidence, model, and recommendation text.
- Defer frame-by-frame visualization until the stored data format and performance are proven.

## Risks / Trade-offs

- Synchronous backend calls may take time -> Use disabled button and pending text, and preserve current page state.
- Analysis results may be absent for older records -> Show idle state rather than treating absence as an error.
- Large keypoint payloads can bloat the page -> Fetch and render summary first; avoid detailed playback in this change.
