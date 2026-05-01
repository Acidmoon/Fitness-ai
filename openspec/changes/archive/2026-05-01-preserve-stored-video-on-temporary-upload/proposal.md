## Why

The temporary video upload mode (`keep_video=false`) is intended to analyze a newly uploaded file without permanently storing it. Today, if a record already has a stored video, that temporary upload flow also clears the existing `video_url` and deletes the previously saved file. That causes unintended data loss from a request that should be non-destructive to existing stored videos.

## What Changes

- Preserve the existing stored `video_url` and file when a temporary upload is performed with `keep_video=false`.
- Keep permanent replacement behavior unchanged when `keep_video=true`.
- Add regression tests covering temporary uploads for records that already have stored videos.

## Capabilities

### New Capabilities

### Modified Capabilities
- `video-management`: temporary uploads no longer remove an already stored owned video for the same record

## Impact

- Affected backend code is limited to `app/api/video.py` and `tests/test_video.py`.
- Existing API response fields remain unchanged.
