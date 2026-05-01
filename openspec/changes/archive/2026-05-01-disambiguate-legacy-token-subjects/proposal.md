## Why

Legacy username-based token compatibility currently treats any numeric `sub` as a user id, which makes old tokens ambiguous for accounts whose username is only digits. This can resolve the wrong user and creates an avoidable identity collision risk.

## What Changes

- Disambiguate JWT `sub` resolution so numeric subjects prefer id lookup but can still fall back to legacy username lookup when no matching id exists.
- Reject all-digit usernames in registration and profile updates so new ambiguous usernames cannot be created.
- Add regression tests for numeric legacy username compatibility and numeric-only username validation.

## Capabilities

### New Capabilities

### Modified Capabilities
- `auth`: legacy subject parsing and username validation rules are tightened to avoid collisions between ids and usernames
- `user-account`: username update validation rejects all-digit usernames

## Impact

- Affected code will be in `app/utils/security.py`, `app/schemas/user.py`, and auth/user tests.
- Login token format remains unchanged; this is a compatibility and validation hardening change.
