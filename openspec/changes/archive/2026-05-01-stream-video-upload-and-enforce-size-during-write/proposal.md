## Why

The video upload endpoint still reads the full request body into memory before writing it to disk, and its size enforcement happens before persistence rather than during the actual write. That leaves the upload path less resilient under large payloads and makes partial-file cleanup behavior less explicit.

## What Changes

- Stream uploaded video content to disk in chunks instead of loading the full file into memory.
- Enforce the 50 MB limit while writing and delete partial files when the size limit is exceeded.
- Ensure write failures also remove partial files and add regression tests for the new upload behavior.

## Capabilities

### New Capabilities

### Modified Capabilities
- `video-management`: video upload behavior is clarified to stream writes and clean partial files on write-time failure or size overflow

## Impact

- Affected backend code will be limited to `app/api/video.py`, related video file helpers, and `tests/test_video.py`.
- API response shapes remain the same; the change is in resource handling and failure cleanup.
