## Why

The recent numeric-only username restriction is correct for new values, but it also blocks existing historical numeric usernames from being resubmitted unchanged during profile updates. That creates an unnecessary compatibility regression for legacy accounts.

## What Changes

- Preserve the numeric-only username restriction for registration and username changes.
- Allow profile updates to keep an existing legacy numeric username unchanged.
- Add regression tests for legacy numeric username profile updates.

## Capabilities

### New Capabilities

### Modified Capabilities
- `user-account`: profile updates permit unchanged legacy numeric usernames while still rejecting new numeric-only usernames

## Impact

- Affected code is limited to user profile update handling and user tests.
- Registration and new username validation behavior remain hardened.
