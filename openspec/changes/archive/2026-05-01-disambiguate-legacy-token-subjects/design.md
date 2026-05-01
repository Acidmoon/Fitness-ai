## Context

The backend issues new JWTs with `user.id` as the `sub` claim while still accepting legacy username-based subjects. Current resolution logic uses `sub.isdigit()` to decide whether to query by id or username. That breaks if a historical username is itself numeric, because the system will only try id lookup and can resolve the wrong account or reject a valid legacy token.

## Goals / Non-Goals

**Goals:**
- Preserve id-based JWTs as the canonical current format.
- Keep legacy username-subject compatibility without numeric ambiguity.
- Prevent future creation of usernames that are entirely numeric.

**Non-Goals:**
- Change login token payload format.
- Remove legacy username-subject compatibility entirely.
- Introduce broader username normalization rules beyond this ambiguity fix.

## Decisions

Numeric `sub` values will try id lookup first and then fall back to username lookup if no user exists with that id.
This preserves the modern id-based token format while still honoring historical username-based tokens for numeric usernames.
Alternative considered: add a new prefixed subject format immediately for all tokens. Rejected because current tokens already work and the narrower fallback change solves the collision risk with minimal disruption.

Disallow all-digit usernames in validation for both registration and profile updates.
This prevents creation of new ambiguous usernames while remaining compatible with existing mixed alphanumeric usernames.
Alternative considered: allow numeric usernames and rely only on token fallback logic. Rejected because it preserves a class of avoidable ambiguity.

Keep legacy numeric-username compatibility only as a backward-compatibility path.
Existing accounts and tokens should continue to work, but the system should no longer accept new ambiguous usernames.
Alternative considered: invalidate numeric legacy usernames entirely. Rejected because it would create a breaking auth change for existing users.

## Risks / Trade-offs

- [Fallback lookup changes auth behavior for malformed numeric subjects] → Restrict fallback to the case where id lookup fails entirely and cover it with tests.
- [Rejecting numeric-only usernames is a validation change] → Limit the rule to all-digit usernames and cover both registration and profile update flows.

## Migration Plan

No data migration is required.
Deploy the validation and lookup changes together with regression tests.
Existing numeric usernames continue to authenticate through the fallback path until separately migrated.

## Open Questions

- Whether the project should later add an explicit migration path for any existing numeric-only usernames in production data.
