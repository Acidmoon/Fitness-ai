## Why

Pose analysis can be slow and CPU/native-runtime heavy, which is risky for request/response API workers after frontend and backend are deployed separately. The service needs an asynchronous job flow so users can start analysis, leave the request quickly, and poll progress.

## What Changes

- Add an asynchronous pose-analysis job API for stored record videos.
- Keep ownership and active-user checks for creating and reading jobs.
- Store job status, error, and result linkage so the frontend can poll until completion.
- Update frontend pose-analysis UX to show queued/running/succeeded/failed states.
- Keep the current synchronous endpoint only as a compatibility path unless implementation chooses to deprecate it in a later change.

## Capabilities

### New Capabilities

- None

### Modified Capabilities

- `video-pose-analysis-api`: pose analysis gains an asynchronous job flow.
- `pose-analysis-frontend`: frontend can trigger and monitor asynchronous analysis jobs.

## Impact

- Affected backend code: `app/api/ai.py`, pose analysis services, database models/schemas, tests.
- Affected frontend code: `pose-analysis-api.ts`, record detail page, query polling behavior.
- Possible dependencies: background task mechanism, worker queue, or database-backed job runner.
- Security impact: job creation and status reads must be scoped to the authenticated owner of the exercise record.
