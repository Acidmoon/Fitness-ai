## 1. Frontend API Layer

- [x] 1.1 Add pose analysis service methods for trigger and retrieval
- [x] 1.2 Add TypeScript types for pose analysis status, summary, model metadata, and errors
- [x] 1.3 Wire React Query keys and invalidation behavior for record-level analysis

## 2. Record Detail UI

- [x] 2.1 Add analysis state loading to `RecordDetailPage`
- [x] 2.2 Show start-analysis control only when a record has a stored video
- [x] 2.3 Show idle, processing, done, failed, and unavailable states in the AI result area
- [x] 2.4 Render summary metrics and feedback from the backend analysis result

## 3. Tests

- [x] 3.1 Add frontend service tests for analysis API calls
- [x] 3.2 Add component tests for record detail analysis states
- [x] 3.3 Run focused frontend tests and production build
- [x] 3.4 Run `openspec validate`
