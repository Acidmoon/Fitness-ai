## Context

Username validation now rejects all-digit usernames to avoid future token-subject ambiguity. That is correct for new registrations and actual username changes, but the current profile update request validation also rejects a legacy account that simply submits its existing numeric username unchanged as part of an update payload.

## Goals / Non-Goals

**Goals:**
- Preserve existing numeric-only usernames when the user is not changing them.
- Continue rejecting newly introduced numeric-only usernames.
- Keep the compatibility logic scoped to profile updates only.

**Non-Goals:**
- Re-allow numeric-only usernames for registration.
- Remove the token-subject ambiguity protections added previously.
- Migrate legacy numeric usernames to a new format.

## Decisions

Handle legacy preservation inside the profile update flow rather than weakening the shared schema validator globally.
This keeps registration strict while allowing the single compatibility exception needed for existing users.
Alternative considered: relax `_validate_username()` everywhere. Rejected because it would reopen numeric-only username creation for new users.

Treat an unchanged username as a no-op for validation purposes.
If the submitted username exactly matches the current stored username, the endpoint can safely accept it regardless of the legacy numeric restriction.
Alternative considered: special-case numeric usernames in the validator via extra context. Rejected because the current request schema does not carry the authenticated user context.

## Risks / Trade-offs

- [Profile update logic gains a small special case] → Keep the exception narrow and cover it with tests.
- [Clients may still try to change legacy numeric usernames to another numeric username] → Continue returning `422` for any new numeric-only username value.

## Migration Plan

No migration is required.
Deploy together with regression tests for unchanged and changed numeric username update behavior.

## Open Questions

- Whether legacy numeric usernames should eventually be migrated proactively to non-numeric identifiers.
