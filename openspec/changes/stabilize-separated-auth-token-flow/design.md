## Context

The backend currently issues JWT access tokens from `/api/auth/login` and protected endpoints resolve users through `Authorization: Bearer <token>`. The frontend stores the token in local storage and injects it with an Axios request interceptor. This works for separated deployments because it does not require cross-site cookies, but the behavior should be documented and tested as an intentional contract.

## Goals / Non-Goals

**Goals:**
- Preserve the existing bearer access-token flow for frontend/backend separation.
- Make `401` versus `403` behavior consistent for separated clients.
- Ensure frontend token cleanup and redirect behavior are aligned with backend statuses.
- Keep CORS support limited to explicit origins and `Authorization` headers.

**Non-Goals:**
- Add refresh tokens.
- Move authentication to httpOnly cookies.
- Add OAuth providers or third-party identity integration.
- Change JWT signing algorithm or token subject shape.

## Decisions

- Keep bearer JWT as the split-deployment auth mechanism.
  Rationale: it already works across origins through explicit request headers and avoids cross-site cookie configuration. Cookies remain a future option only after CSRF, SameSite, refresh rotation, and logout semantics are designed.

- Treat `401` as "client credentials are missing or invalid" and `403` as "identity is known but not allowed".
  Rationale: the frontend can clear stored tokens on `401` without incorrectly logging out users whose account is inactive or forbidden for a different reason.

- Keep token persistence client-side for this change.
  Rationale: changing token storage strategy has security trade-offs and should be handled in a dedicated hardening change if needed.

## Risks / Trade-offs

- Local storage tokens are accessible to injected scripts -> Mitigation: keep this change scoped, continue avoiding unsafe HTML injection, and consider httpOnly refresh cookies in a later hardening change.
- Short-lived access tokens can interrupt active users -> Mitigation: frontend handles `401` predictably; refresh-token UX can be designed separately.
- Multiple active OpenSpec auth changes may overlap -> Mitigation: keep this change focused on separated-client contract while `enforce-active-user-access` owns inactive-account enforcement.

## Migration Plan

1. Verify current backend statuses for missing, invalid, expired, inactive, and valid tokens.
2. Align frontend interceptor behavior with the status contract.
3. Add tests around token cleanup and protected route behavior.
4. Document the auth contract for separated deployment.

## Open Questions

- Should access-token expiration remain 30 minutes for production, or should deployment guidance recommend a shorter value?
- Should the next hardening change introduce refresh tokens after separation is stable?
