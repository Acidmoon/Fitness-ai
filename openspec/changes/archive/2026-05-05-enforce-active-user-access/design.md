## Context

`get_current_user` decodes bearer tokens and returns a matching user by id or legacy username. User routes then check `is_active`, but exercise, stats, and video routes trust the returned user directly.

## Goals / Non-Goals

**Goals:**
- Make active-account enforcement consistent across all protected endpoints.
- Preserve legacy token subject compatibility.
- Keep route code simple.

**Non-Goals:**
- Add token revocation storage.
- Change login token payloads.
- Introduce role-based authorization.

## Decisions

- Enforce `is_active` inside the shared authenticated-user dependency.
  Rationale: every protected endpoint already depends on it, so this produces consistent behavior with the smallest API surface change.

- Return status `403` for inactive users.
  Rationale: the token can be valid while the account is not allowed to act.

- Keep `401` for missing, invalid, expired, or unresolvable tokens.
  Rationale: authentication failures should remain distinct from inactive-account authorization failures.

## Risks / Trade-offs

- Tests that create inactive users with tokens may need updates. Mitigation: add explicit inactive-account fixtures and expected `403` assertions.
- Login currently does not check `is_active`. Mitigation: decide whether to reject inactive login in this change or explicitly document it as follow-up.

## Migration Plan

1. Update the shared dependency.
2. Add focused tests across representative protected routes.
3. Remove duplicated route-level active checks only if tests prove behavior remains unchanged.

## Open Questions

- Should inactive users be blocked from login as part of this change, or only from protected resource access?
