## Context

The current backend stores uploaded videos under `uploads/videos` and returns API-style `video_url` values such as `/videos/<filename>`. Frontend preview code extracts the filename and calls `/api/video/videos/{filename}`, which requires authentication and verifies record ownership. This is the right security boundary, but separated deployments need explicit storage and lifecycle rules.

## Goals / Non-Goals

**Goals:**
- Preserve authenticated, ownership-scoped video delivery through the backend.
- Support local disk for development and a production-ready storage abstraction for shared volume or object storage.
- Keep cleanup behavior consistent when records, videos, or accounts are deleted.
- Document deployment constraints for multi-instance API services.

**Non-Goals:**
- Make uploaded videos publicly readable.
- Replace all storage with a specific cloud provider in this change.
- Add video transcoding or CDN streaming.
- Change upload size limits or accepted file signatures unless required by the storage abstraction.

## Decisions

- Keep `video_url` as an opaque backend-mediated reference.
  Rationale: clients should not depend on disk paths or public bucket URLs because access requires authentication and ownership checks.

- Introduce or formalize a storage adapter boundary.
  Rationale: local disk is adequate for development, but multi-instance deployments require shared storage. A small interface for save, open, delete, and exists keeps API logic independent of the storage backend.

- Do not mount `uploads/videos` as public static files.
  Rationale: static mounting would bypass per-user ownership checks unless every generated URL is separately signed and time-limited.

## Risks / Trade-offs

- Backend-mediated video delivery consumes API bandwidth -> Mitigation: defer signed URL/CDN support until storage provider and access requirements are known.
- Storage abstraction may add implementation work before production needs it -> Mitigation: start with a local filesystem adapter and only add object storage configuration when deploying.
- Existing `video_url` values may assume `/videos/` prefix -> Mitigation: keep the prefix stable and interpret it through the backend storage resolver.

## Migration Plan

1. Preserve existing stored `video_url` values.
2. Introduce storage configuration and local filesystem adapter without changing API responses.
3. Move upload, read, exists, and delete operations behind the adapter.
4. Add tests proving direct path traversal and cross-user video access remain blocked.
5. Document how single-instance local disk, shared volume, and object storage deployments differ.

## Open Questions

- Which production storage target should be supported first: shared volume, S3-compatible object storage, or both?
- Should future object-storage delivery use backend streaming or short-lived signed URLs after ownership verification?
