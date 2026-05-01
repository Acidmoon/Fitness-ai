## Context

The backend currently relies on permissive configuration defaults in `app/config.py` and stores uploaded videos under `uploads/videos`. The business APIs can delete records and accounts, but file cleanup is not coordinated with those database mutations. The current test suite is green, which means these issues are hidden behind missing coverage rather than blocked by failing tests.

## Goals / Non-Goals

**Goals:**
- Prevent the application from starting with insecure default secrets or placeholder configuration for critical runtime settings.
- Centralize uploaded video cleanup so all record and account deletion flows remove owned files consistently.
- Preserve existing API shapes where possible while making file lifecycle behavior deterministic and testable.

**Non-Goals:**
- Rework JWT format, token claims, or login flows beyond configuration safety.
- Introduce object storage, background jobs, or a new media service.
- Change video authorization semantics beyond the cleanup behavior covered by this change.

## Decisions

Use strict startup validation for critical settings.
Critical settings such as `SECRET_KEY` and `DATABASE_URL` will no longer rely on insecure production-like defaults. The application should fail fast during configuration loading when these values are missing or still set to placeholder content. This keeps deployment failures explicit instead of silently issuing weak JWTs.
Alternative considered: keep defaults and only log warnings. Rejected because warnings are easy to miss and still permit insecure startup.

Create a small shared video file cleanup utility and call it from all deletion paths.
Video cleanup logic should live outside individual route handlers so upload replacement, single-record deletion, batch deletion, and account deletion all use the same validation and deletion behavior. This also avoids reimplementing path handling and makes targeted testing easier.
Alternative considered: keep cleanup inline in each endpoint. Rejected because the same lifecycle rules would drift across handlers.

Delete previous owned video files on replacement before persisting the new path.
When a user uploads a new permanent video for a record that already has a stored video, the old file should be deleted after ownership/path validation so only one active file remains for that record.
Alternative considered: retain historical files. Rejected because the data model stores a single `video_url`, so retaining old files only creates orphaned disk usage.

Prefer best-effort filesystem cleanup paired with database consistency.
The API should avoid leaving database rows pointing at deleted or invalid files. When database operations fail after a new file is written, the new file should be removed in rollback handling. When deleting records, missing files should not block database deletion, but invalid file paths must not be followed.
Alternative considered: wrap filesystem and database operations in a stronger transactional abstraction. Rejected as unnecessary complexity for local disk storage.

## Risks / Trade-offs

- [Startup validation may break local development setups] → Provide clear validation messages and update `.env` expectations so developers can fix configuration quickly.
- [Filesystem cleanup can fail due to locks or missing files] → Treat missing files as non-fatal, guard path resolution, and continue database cleanup where safe.
- [Centralized cleanup touches multiple modules] → Add focused tests for upload replacement, record deletion, batch deletion, and account deletion to prevent regressions.

## Migration Plan

Deploy the code with a valid `.env` containing non-placeholder `DATABASE_URL` and `SECRET_KEY`.
Roll back by restoring the previous release and its configuration behavior if startup validation unexpectedly blocks deployment, though the preferred response is to fix configuration rather than disable the validation.
Existing orphaned files created before this change will not be automatically backfilled; they can be cleaned separately if needed.

## Open Questions

- Whether to add a one-time maintenance script for historical orphaned video cleanup after the new lifecycle rules are in place.
