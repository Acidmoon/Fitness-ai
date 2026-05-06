## Context

The Android app currently derives `records`, `stats`, and `homeState` from an in-memory training record repository. API mode only swaps authentication. Backend records can be read from `/api/exercise/records`, exercise metadata from `/api/exercise/exercises`, and stats summary from `/api/stats/summary`.

## Goals / Non-Goals

**Goals:**
- Show backend training records in API mode after login/session restore.
- Show backend stats summary in API mode when available.
- Preserve mock mode behavior exactly.
- Avoid redesigning record create/edit/delete UI in this change.
- Keep fetch failures recoverable and testable.

**Non-Goals:**
- API-backed record creation, update, or deletion.
- API video upload/playback.
- Pose-analysis polling or scoring integration.
- Offline caching or pagination UI.

## Decisions

### Add read-capable repository contracts

The current `TrainingRecordRepository` is synchronous and local-first. This change should add suspend refresh support while leaving existing sync write methods intact. API-backed record repositories can expose remote records through the existing `StateFlow<List<TrainingRecord>>` and make unsupported writes no-ops or local-only only where explicitly documented. A full async CRUD interface is deferred to avoid touching editor screens.

### Add a StatsRepository abstraction

Stats are currently computed in `FitnessAiViewModel`. API mode needs backend summary data, so a small `StatsRepository` with `StateFlow<StatsSummary>` and `refresh()` keeps the ViewModel from branching on backend mode. Mock mode can use a local stats repository derived from `TrainingRecordRepository.records`.

### Refresh after auth state changes

After API login or session bootstrap succeeds, the ViewModel should refresh remote records and stats. Mock mode refreshes should be cheap no-ops or local derivations. Fetch errors should be stored separately from auth errors so login can still succeed while data refresh reports a recoverable issue.

### Join records with exercise catalog

Backend record responses include `exercise_id` but not exercise names. The API record repository should fetch the exercise catalog and map IDs to names/categories when building Android `TrainingRecord` models. Unknown exercise IDs should still produce a stable fallback label.

## Risks / Trade-offs

- Existing UI writes are synchronous -> Keep remote writes out of scope and avoid pretending remote CRUD is complete.
- Stats and records can become temporarily inconsistent -> Refresh both after auth, but do not block app entry on perfect consistency.
- Backend pagination may hide older records -> Use current default or explicit reasonable limit, and leave pagination UI for later.
- API fetch failures after login -> Surface recoverable state and retain empty/last-known flows without crashing.

## Migration Plan

1. Add stats repository contract and local implementation.
2. Add API read repository for records and stats.
3. Wire repository container to choose API read repositories in API mode.
4. Refresh data after login/bootstrap.
5. Add tests for API record mapping, stats refresh, mode selection, and mock mode preservation.

## Open Questions

- Should API mode disable create/edit/delete buttons until remote CRUD is implemented, or continue local-only editing as a temporary internal-testing behavior?
