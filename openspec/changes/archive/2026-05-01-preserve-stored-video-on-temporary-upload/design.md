## Context

The upload endpoint supports two modes:
- `keep_video=true`: persist the newly uploaded file and replace any existing stored file
- `keep_video=false`: use the uploaded file temporarily and delete it immediately

The current implementation uses the record's post-upload `video_url` state to decide whether to delete the previous file. In temporary mode, the record is set to `None`, so the cleanup logic also deletes the older stored file even though the user did not ask to replace it.

## Goals / Non-Goals

**Goals:**
- Make temporary uploads non-destructive to an existing stored video.
- Preserve the current replacement behavior for permanent uploads.
- Keep the fix small and localized to upload flow state handling.

**Non-Goals:**
- Change video deletion behavior in explicit delete endpoints.
- Introduce a new video versioning model.
- Change upload response payloads.

## Decisions

Track whether the upload should replace the stored video before mutating record state.
Only permanent uploads should be treated as replacements of the prior stored file.
Alternative considered: always keep previous files whenever `video_url` changes to `None`. Rejected because explicit delete operations should still remove the stored file.

Retain the previous `video_url` on the record during temporary uploads.
This avoids destructive side effects and keeps the record aligned with the already stored permanent video.
Alternative considered: restore the previous `video_url` after clearing it. Rejected because it adds unnecessary transient mutation and makes the commit flow harder to reason about.

## Risks / Trade-offs

- [Temporary uploads for records with stored videos keep the old reference] → This is the intended behavior, but tests need to verify the record and file remain intact.
- [Cleanup conditions become more stateful] → Keep the branching narrow and cover both permanent and temporary paths.

## Migration Plan

No data migration is required.
Deploy together with regression tests for temporary uploads on records that already have stored videos.

## Open Questions

- Whether future product behavior should expose the distinction between temporary analysis uploads and stored record videos more explicitly in the API.
