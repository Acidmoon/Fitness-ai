## 1. Backend Job Model

- [x] 1.1 Add a persisted pose-analysis job model with record id, user id, status, error, timestamps, and optional result metadata.
- [x] 1.2 Import the model through `app/models/__init__.py` for metadata-driven table creation.
- [x] 1.3 Add Pydantic schemas for job creation and status responses.

## 2. Backend API

- [x] 2.1 Add an endpoint to create pose-analysis jobs for owned records with stored videos.
- [x] 2.2 Add an endpoint to fetch job status for jobs owned by the current user.
- [x] 2.3 Implement initial job execution using the selected background mechanism.
- [x] 2.4 Store successful analysis results on the exercise record.
- [x] 2.5 Store sanitized failure messages on failed jobs.

## 3. Frontend Flow

- [x] 3.1 Add API client functions for creating and polling pose-analysis jobs.
- [x] 3.2 Update record detail pose-analysis UI to use job creation and polling.
- [x] 3.3 Stop polling when jobs reach succeeded or failed status.
- [x] 3.4 Refresh record and analysis queries after success.

## 4. Verification

- [x] 4.1 Add backend tests for job creation, ownership checks, status polling, success, and failure.
- [x] 4.2 Add frontend tests for queued/running/succeeded/failed UI states.
- [x] 4.3 Run `pytest tests/test_ai_pose_analysis.py`.
- [x] 4.4 Run `cd Fitness-ai-frontend && npm run test`.
- [x] 4.5 Run `pytest`.
