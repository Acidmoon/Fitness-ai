## Why

The backend can now generate pose-derived score, repetition count, and feedback, but users cannot access that scoring flow from the record detail page. The frontend needs an explicit preview/apply experience so AI-generated values are visible before they overwrite record fields.

## What Changes

- Add frontend API methods and types for pose scoring preview and application.
- Extend the record detail AI area to request score previews after pose analysis exists.
- Add an explicit apply action that updates score, count, and feedback only after user confirmation.
- Surface unsupported, missing-analysis, and low-confidence scoring states without breaking video or pose-analysis UI.
- Add frontend service and component tests for preview/apply behavior.

## Capabilities

### New Capabilities

- `pose-scoring-frontend`: Defines frontend behavior for previewing and explicitly applying backend pose scoring results.

### Modified Capabilities

- `pose-analysis-frontend`: Record detail analysis UI gains a follow-up scoring action after pose analysis completes.

## Impact

- Affected frontend areas: `RecordDetailPage`, pose analysis services/types, React Query invalidation, and tests.
- Depends on backend `POST /api/ai/records/{record_id}/pose-scoring`.
- Root Git still ignores `Fitness-ai-frontend/`; implementation files remain local unless repository tracking policy changes.
