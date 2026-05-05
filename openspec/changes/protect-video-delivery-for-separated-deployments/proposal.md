## Why

Separated frontend/backend deployments make uploaded video delivery a production boundary instead of a local filesystem detail. The service must keep video access backend-mediated and prepare storage behavior for shared-volume or object-storage deployment without exposing raw upload directories.

## What Changes

- Keep video preview and download access behind authenticated `/api/video/videos/{filename}` routes.
- Define configurable video storage behavior so local disk remains supported while production can use a shared volume or object storage.
- Ensure returned `video_url` values remain API-mediated references, not direct filesystem or public bucket paths.
- Document multi-instance deployment constraints for `uploads/videos`.
- No existing video routes are removed.

## Capabilities

### New Capabilities

- None

### Modified Capabilities

- `video-management`: video access and storage references must remain backend-mediated in separated deployments.
- `uploaded-video-lifecycle`: cleanup semantics must apply consistently across local and production storage backends.

## Impact

- Affected backend code: `app/api/video.py`, `app/utils/video_files.py`, `app/utils/video_storage.py`, exercise/user deletion cleanup paths.
- Affected frontend code: video preview flows that call `fetchVideoBlob`.
- Affected systems: upload directory, production storage volume or object storage, deployment docs.
- Security impact: prevents direct public exposure of user videos and preserves per-user ownership checks.
