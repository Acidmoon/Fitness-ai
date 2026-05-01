## Context

Protected endpoints currently depend on `get_current_user()` to decode JWTs and resolve users. That dependency verifies token validity and user existence, but it does not enforce `is_active`. User profile and password routes each repeat inactive-account checks locally, while exercise, stats, and video routes do not. The result is inconsistent authorization behavior for the same inactive account state.

## Goals / Non-Goals

**Goals:**
- Move inactive-account enforcement into the shared authenticated dependency so all protected business endpoints behave consistently.
- Keep the existing forbidden status and message semantics for inactive users.
- Add regression tests that prove the shared dependency now protects user, exercise, stats, and video endpoints.

**Non-Goals:**
- Introduce role-based authorization or broader permission models.
- Change JWT token structure or token migration behavior.
- Change public endpoints such as exercise catalog access.

## Decisions

Enforce `is_active` in `get_current_user()`.
This is the narrowest place to make protected endpoints consistent because all authenticated business routes already depend on this function. It avoids duplicating checks across routers and prevents future protected routes from forgetting the inactive-account guard.
Alternative considered: keep route-level checks and add the missing ones individually. Rejected because it preserves duplication and is easy to miss in future endpoints.

Return the existing forbidden response contract for inactive users.
The current user router already uses `403 Forbidden` with `账户已被注销`. Reusing that contract avoids unnecessary API churn while making behavior uniform.
Alternative considered: convert inactive users to `401 Unauthorized`. Rejected because the token is still valid; the restriction is account state, not authentication failure.

Remove redundant route-local inactive checks from user endpoints after centralizing enforcement.
Once the shared dependency guarantees active users, the repeated checks in user routes become dead logic and should be removed to keep the codepath single-sourced.
Alternative considered: leave the duplicate checks in place. Rejected because it obscures the true authorization source and invites drift.

## Risks / Trade-offs

- [Behavior change may affect clients using inactive accounts for partial access] → Keep the response code and message stable and cover the changed endpoints with tests.
- [Shared dependency changes can affect many endpoints at once] → Add focused regression coverage across all authenticated routers before finalizing.

## Migration Plan

No data migration is required.
Deploy the shared dependency change together with regression tests.
If rollback is needed, revert the shared dependency enforcement and restore route-local behavior.

## Open Questions

- Whether future soft-delete or admin-disable states should use the same response message or a more specific reason code.
