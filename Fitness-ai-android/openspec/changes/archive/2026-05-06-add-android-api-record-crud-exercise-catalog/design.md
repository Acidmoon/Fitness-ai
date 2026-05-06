## Context

API mode currently fetches backend records and stats after authentication, but record writes are synchronous local mutations on `TrainingRecordRepository`. Backend record create/update/delete endpoints and exercise DTOs already exist in the Android API layer.

## Goals / Non-Goals

**Goals:**
- Make API-mode record create, update, and delete call the backend.
- Use backend exercise IDs when creating or updating API records.
- Keep mock mode behavior unchanged.
- Refresh API records and stats after successful writes.
- Keep mutation failures recoverable and visible to callers.

**Non-Goals:**
- Video upload or playback.
- Pose-analysis job integration.
- Offline queued writes.
- Full exercise management or custom exercise creation.

## Decisions

### Make record mutations result-bearing

The repository contract should support suspendable, result-bearing create/update/delete operations because API writes can fail. Mock mode can return successful results immediately while API mode wraps backend failures through the existing API error mapping.

### Preserve backend record identity

API records need stable backend IDs for later video and analysis endpoints. The domain model should continue exposing string IDs to the UI, but API repositories must treat numeric string IDs as backend IDs and fail gracefully when an API-mode mutation receives a non-backend ID.

### Add exercise catalog support at the data boundary

Record creation in API mode must choose a backend `exercise_id`; free-form exercise names are not enough. The smallest useful design is an exercise catalog flow or repository exposed to the ViewModel so the editor can present backend exercises in API mode while mock mode keeps free-form inputs.

### Refresh after writes

After create/update/delete succeeds in API mode, refresh records and stats rather than trying to hand-maintain all derived state. This keeps dashboard state consistent and reduces mapper duplication.

## Risks / Trade-offs

- Repository signature changes touch several screens and tests -> Update the ViewModel and tests in one change.
- Existing free-form editor does not map naturally to backend exercises -> Add API-mode catalog selection while keeping mock-mode fields.
- Backend validation can reject fields the mock app accepts -> Surface validation messages as recoverable errors.

## Migration Plan

1. Update repository contracts and mock implementations.
2. Add exercise catalog state and API record mutation methods.
3. Update ViewModel/UI save and delete flows.
4. Refresh records/stats after successful API mutations.
5. Add MockWebServer tests and preserve existing mock tests.

## Open Questions

- Should API mode allow editing exercise selection after a record exists, or only score/count/duration fields?
