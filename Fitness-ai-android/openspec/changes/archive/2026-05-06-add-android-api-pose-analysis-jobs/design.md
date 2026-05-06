## Context

The existing `SimulatedAnalysisRepository` updates local record state after delays. The API layer already defines pose-analysis trigger, job creation, job status, and result endpoints, but app mode selection still always wires the simulated repository.

## Goals / Non-Goals

**Goals:**
- Use backend pose-analysis jobs in API mode.
- Keep mock-mode simulated analysis behavior.
- Map backend job and result states into existing `AnalysisStatus`/`AnalysisResult`.
- Prevent duplicate starts while analysis is active.
- Surface failed jobs as recoverable analysis failures.

**Non-Goals:**
- Pose scoring or applying score updates.
- Background service execution when the app is killed.
- Complex progress percentages beyond queued/running/completed/failed states.
- Real-time posture correction.

## Decisions

### Add an API analysis repository selected by backend mode

The repository container should choose `SimulatedAnalysisRepository` in mock mode and an API implementation in API mode. This keeps UI code mostly mode-agnostic and matches the existing repository selection pattern.

### Poll jobs inside repository scope

The API repository should create a job, set local record analysis state to queued/running, poll until terminal status, then fetch or map the final result. Polling belongs in the repository because it understands backend DTOs and error mapping.

### Keep notification behavior mode-aware

Mock mode already posts a local notification when simulation completes. API mode may reuse the same notification scheduler when the final backend analysis result is mapped to completed, but notification failure must not fail analysis.

### Treat job failures as record analysis state

Backend job failures should update the record with `AnalysisStatus.Failed` and a recoverable message. They should not remove videos or clear auth state.

## Risks / Trade-offs

- Polling can outlive the visible screen -> Use ViewModel/repository coroutine scope carefully and keep state in flows.
- Backend job status names may differ -> Normalize known terminal/running states and test representative values.
- Long-running jobs may make tests slow -> Inject poll interval/attempt limits for tests.

## Migration Plan

1. Add API analysis repository implementation.
2. Wire repository container by backend mode.
3. Map backend job/result states to domain analysis state.
4. Update record detail actions and tests.

## Open Questions

- What maximum polling duration should API mode use before surfacing a timeout failure?
