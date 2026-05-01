## Context

The current upload endpoint validates file extension, estimates file size using file seeks, and then writes the full upload to disk with a single `read()`. That means the request body can be fully materialized in memory and the implementation depends on up-front file-size introspection rather than enforcing limits during the persistence path itself.

## Goals / Non-Goals

**Goals:**
- Stream uploaded video content to disk in chunks.
- Enforce the existing 50 MB limit during the write loop.
- Remove partial files when uploads exceed the limit or fail mid-write.

**Non-Goals:**
- Change upload API contracts or response field names.
- Add background processing, object storage, or async upload orchestration.
- Change file ownership or authorization rules.

## Decisions

Add a small upload write helper that streams chunks and returns the final size.
This keeps the route handler focused on request validation and database updates while isolating the error-prone file write path.
Alternative considered: inline the chunked write logic inside the route. Rejected because it makes the route harder to test and reason about.

Raise a handled client error when the stream crosses the 50 MB limit.
The current contract already returns `400` for oversize uploads, so the streamed implementation should preserve that behavior while deleting the partial file.
Alternative considered: rely on request metadata such as content length. Rejected because write-time enforcement is more trustworthy and aligns with the actual bytes persisted.

Treat write failures and size-limit failures as cleanup points before any database state changes persist.
This keeps the upload path consistent with the existing rollback behavior and avoids orphaned partial files.
Alternative considered: leave partial-file cleanup to later housekeeping. Rejected because it creates unnecessary disk residue from failed requests.

## Risks / Trade-offs

- [Chunked writes add more control flow] → Keep the helper small and cover oversize and failure paths with focused tests.
- [Write-time enforcement may behave differently from seek-based size checks on some file objects] → Remove the dependency on full-file seeking and validate the streamed behavior directly in tests.

## Migration Plan

No data migration is required.
Deploy the new write helper together with its regression tests.
Rollback is a straightforward revert of the upload implementation if needed.

## Open Questions

- Whether future uploads should also validate content type or media signatures beyond extension and size.
