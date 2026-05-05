## Why

The project is moving toward separated frontend and backend deployments, so the authentication contract must be explicit across origins. The current bearer-token flow is usable, but the intended production behavior and client failure handling need to be specified before deployment work starts.

## What Changes

- Stabilize the existing `/api/auth/login` bearer JWT contract for separated browser clients.
- Keep access tokens in the `Authorization: Bearer <token>` header for protected API requests.
- Define client behavior for `401` and `403` responses so expired, invalid, and inactive-account states are handled predictably.
- Defer refresh-token cookies and cross-site cookie sessions until a separate security design justifies the added CSRF and SameSite complexity.
- No routes are removed.

## Capabilities

### New Capabilities

- None

### Modified Capabilities

- `authentication`: separated frontend clients must use the stable bearer-token contract and receive actionable authentication status responses.

## Impact

- Affected backend code: `app/api/auth.py`, `app/utils/security.py`, protected routers using `get_current_user`.
- Affected frontend code: `Fitness-ai-frontend/src/services/http.ts`, `Fitness-ai-frontend/src/services/auth-storage.ts`, protected route behavior.
- API impact: existing `/api/auth/login` and protected `/api/*` routes remain, but response handling expectations become part of the contract.
- Security impact: avoids accidental introduction of cross-site cookie auth before CSRF and refresh-token rotation are designed.
