## Why

The backend can currently boot with insecure fallback secrets and leaves uploaded video files behind when records or accounts are removed. These are production-facing risks that are not visible in the current test suite and should be addressed before more data accumulates.

## What Changes

- Require secure runtime configuration for authentication and database connectivity instead of silently using unsafe fallback values.
- Add deterministic cleanup rules for uploaded exercise videos when users replace videos, delete records, batch-delete records, or delete their accounts.
- Add tests that cover the new configuration validation and uploaded file lifecycle behavior.

## Capabilities

### New Capabilities
- `runtime-configuration-safety`: Validate critical runtime configuration at startup so the application refuses to run with unsafe defaults.
- `uploaded-video-lifecycle`: Manage uploaded video files consistently across upload replacement and record/account deletion flows.

### Modified Capabilities

## Impact

- Affected backend modules include `app/config.py`, `app/api/video.py`, `app/api/exercise.py`, and `app/api/user.py`.
- Test coverage will expand in `tests/test_video.py` and `tests/test_user.py`, and may add focused configuration tests.
- No new external dependency is required beyond the newly installed OpenSpec tooling.
