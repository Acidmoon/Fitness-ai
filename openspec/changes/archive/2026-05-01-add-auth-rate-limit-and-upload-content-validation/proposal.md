## Why

The backend now has stronger identity and file-lifecycle guarantees, but it still accepts unlimited login attempts and trusts video uploads based mainly on filename extension. That leaves two practical abuse paths open: credential stuffing against `POST /api/auth/login` and non-video payloads masquerading as allowed uploads.

## What Changes

- Add login rate limiting so repeated failed authentication attempts from the same client identity are throttled within a defined time window.
- Define the scope key for auth throttling so normal users can still log in while bursty or abusive retries are blocked predictably.
- Strengthen video upload validation by checking claimed media type and file signature, not only filename extension.
- Reject uploads whose extension, MIME type, and detected content do not agree with the supported video formats policy.
- Add focused regression coverage for throttled login behavior and upload rejection of disguised non-video files.

## Capabilities

### New Capabilities

### Modified Capabilities
- `auth`: login behavior gains rate-limit enforcement and retry-throttling semantics
- `video-management`: upload validation gains content-aware media checks in addition to extension filtering

## Impact

- Affected code will likely include `app/api/auth.py`, shared auth utilities or middleware, request metadata handling, and `app/api/video.py`.
- Tests will need new cases for repeated failed logins, rate-limit reset behavior, valid login while under unrelated limits, and upload rejection for mismatched MIME/signature combinations.
- This may introduce a small in-process throttling state store unless the implementation deliberately uses an external backend later.
