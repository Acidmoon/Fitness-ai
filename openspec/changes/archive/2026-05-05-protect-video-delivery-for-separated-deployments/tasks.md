## 1. Storage Boundary

- [x] 1.1 Inventory current video file operations in upload, preview, record deletion, batch deletion, and account deletion flows.
- [x] 1.2 Define a small video storage adapter interface for save, open, exists, delete, and URL/reference resolution.
- [x] 1.3 Implement a local filesystem adapter preserving existing `uploads/videos` behavior.
- [x] 1.4 Add configuration for storage mode and upload directory.

## 2. API Integration

- [x] 2.1 Route upload persistence through the storage adapter.
- [x] 2.2 Route video preview reads through the storage adapter while preserving ownership checks.
- [x] 2.3 Route delete and cleanup operations through the storage adapter.
- [x] 2.4 Preserve existing `video_url` response shape for stored records.

## 3. Documentation

- [x] 3.1 Document why `uploads/videos` must not be publicly mounted.
- [x] 3.2 Document single-instance local disk deployment constraints.
- [x] 3.3 Document production options for shared volume or object storage.

## 4. Verification

- [x] 4.1 Add tests for upload, preview, delete, replacement cleanup, record cleanup, and account cleanup through the storage adapter.
- [x] 4.2 Add tests proving unauthenticated and cross-user video access remains blocked.
- [x] 4.3 Run `pytest tests/test_video.py tests/test_exercise.py tests/test_user.py`.
- [x] 4.4 Run `pytest`.
