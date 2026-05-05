## Context

The current pose-analysis endpoint performs analysis during the HTTP request. That is simple but fragile for production because long-running requests can hit gateway timeouts, tie up API workers, and make the frontend unable to show reliable progress. A job-oriented API gives the frontend a stable contract and lets the backend move execution to a background worker later.

## Goals / Non-Goals

**Goals:**
- Add a job lifecycle for pose analysis: queued, running, succeeded, failed.
- Return quickly when the user starts analysis.
- Allow the frontend to poll job status and fetch final analysis results.
- Keep record ownership and active-account enforcement on every job route.
- Support an initial in-process or database-backed worker path without locking the design to one queue provider.

**Non-Goals:**
- Add real-time WebSocket or SSE updates.
- Add distributed GPU scheduling.
- Replace the existing MoveNet runtime.
- Change pose scoring rules.

## Decisions

- Use a database-backed job record as the API contract.
  Rationale: job state must survive HTTP request boundaries and be visible to polling clients. A persisted job also enables future workers without changing the frontend API.

- Start with polling instead of WebSocket/SSE.
  Rationale: polling is simpler, works across standard separated deployments, and fits the current React Query architecture.

- Keep synchronous analysis available during migration.
  Rationale: tests and existing callers can continue working while the frontend migrates to the job flow.

- Store final analysis on the exercise record as today.
  Rationale: existing scoring and retrieval logic already expects completed analysis data on the record.

## Risks / Trade-offs

- In-process background tasks can be lost on process restart -> Mitigation: persisted jobs make failed/interrupted states observable; production can move execution to a real worker.
- Polling creates repeated API calls -> Mitigation: use bounded intervals and stop polling on terminal status.
- New persistence requires migration discipline -> Mitigation: add model imports, tests, and initialization coverage.

## Migration Plan

1. Add persisted pose-analysis job model and schema.
2. Add job creation and status endpoints.
3. Wire initial execution mechanism.
4. Update frontend to create jobs and poll status.
5. Keep existing synchronous endpoint until the job flow is verified.

## Open Questions

- Should the first implementation use FastAPI background tasks, a database polling worker, or an external queue?
- How long should completed and failed job rows be retained?
