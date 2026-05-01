## 1. API Contracts

- [x] 1.1 Add request and response schemas for pose analysis trigger and retrieval
- [x] 1.2 Add an authenticated router for `POST /api/ai/records/{record_id}/pose-analysis`
- [x] 1.3 Add an authenticated router for `GET /api/ai/records/{record_id}/pose-analysis`
- [x] 1.4 Register the new router in the FastAPI app

## 2. Analysis Flow

- [x] 2.1 Enforce active-user and record ownership checks before analysis
- [x] 2.2 Resolve `record.video_url` using existing safe video path helpers
- [x] 2.3 Run sampled video analysis through the MoveNet runtime service
- [x] 2.4 Persist compact analysis data to `record.keypoints_data`
- [x] 2.5 Return summary status, model metadata, frame counts, and confidence metrics

## 3. Tests

- [x] 3.1 Add API tests for missing auth, inactive user, missing record, and missing video
- [x] 3.2 Add API tests for successful analysis storage using a mocked runtime service
- [x] 3.3 Add API tests for analysis failure without corrupting video or record ownership state
- [x] 3.4 Run focused backend tests and `openspec validate`
