## Context

The API layer defines a pose-scoring endpoint and DTO mapper, but API mode does not call it. The current domain `AnalysisResult` can carry a score preview and message, while `TrainingRecord` carries applied score/count values displayed in list/detail/stats.

## Goals / Non-Goals

**Goals:**
- Request backend pose scoring for API-mode records after analysis.
- Map backend score/count/confidence/feedback into Android analysis result state.
- Optionally apply scoring results to the backend record through the scoring endpoint.
- Refresh records and stats after applied scoring.
- Preserve mock-mode simulated score preview behavior.

**Non-Goals:**
- Replacing backend scoring logic.
- Real-time posture correction.
- Editing scoring metrics manually beyond existing record edit behavior.
- Long-term history of multiple scoring attempts.

## Decisions

### Keep scoring separate from analysis completion

Pose analysis and pose scoring are separate backend operations. The app should allow scoring only when an API record has a completed analysis result, so failures in scoring do not invalidate the analysis result or video.

### Use backend apply behavior for durable updates

When the tester applies scoring, the API scoring request should let the backend update durable record metrics. Android then refreshes records and stats instead of locally patching authoritative values.

### Reuse existing analysis UI surface for feedback

The scoring feedback can be shown in the record detail analysis section using `AnalysisResult.scorePreview`, confidence, and message fields. If this becomes too dense, a later UI refinement can split analysis and scoring panels.

## Risks / Trade-offs

- Backend scoring may return score without applying it -> Clearly distinguish preview from applied record score.
- Feedback can be multi-line or long -> Clamp/wrap text in record detail and test layout.
- Stats can look stale after scoring -> Always refresh records and stats after applied scoring.

## Migration Plan

1. Add API scoring operation to analysis/scoring repository layer.
2. Add ViewModel action for score preview/apply.
3. Update record detail UI to show score feedback and applied state.
4. Add tests for scoring preview, applied scoring refresh, and failure behavior.

## Open Questions

- Should scoring be automatic after analysis completion, or a separate tester-triggered action?
