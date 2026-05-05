## Why

The project has an `is_active` account flag, but only profile and password routes currently check it. Any protected endpoint that uses a valid token should consistently reject inactive accounts.

## What Changes

- Enforce active-account status in the shared authenticated-user dependency or an equivalent common dependency.
- Ensure exercise records, statistics, video management, and user profile routes all reject inactive accounts consistently.
- Add tests proving inactive accounts cannot use protected domain APIs.

## Capabilities

### New Capabilities

- None

### Modified Capabilities

- `authentication`: protected endpoint user resolution must require an active user, not only an existing user.

## Impact

- Affected code: `app/utils/security.py` and protected routers using `get_current_user`.
- Affected tests: authentication, user, exercise, stats, and video tests for inactive-account behavior.
- Security impact: prevents deactivated accounts from continuing to access data with previously issued tokens.
