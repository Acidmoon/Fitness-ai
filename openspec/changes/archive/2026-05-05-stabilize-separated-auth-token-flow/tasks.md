## 1. Backend Contract

- [x] 1.1 Review `/api/auth/login` and `get_current_user` for separated-client bearer-token behavior.
- [x] 1.2 Preserve `401` for missing, invalid, expired, or unknown-user tokens.
- [x] 1.3 Preserve `403` for known inactive users or forbidden authenticated states.
- [x] 1.4 Confirm CORS accepts `Authorization` headers only from configured allowed origins.

## 2. Frontend Behavior

- [x] 2.1 Keep Axios request interception for `Authorization: Bearer <token>`.
- [x] 2.2 Clear stored access token on `401` responses.
- [x] 2.3 Show an account-state or authorization error for `403` responses without treating it as a missing-token login state.

## 3. Documentation

- [x] 3.1 Document the separated-deployment auth flow in README or deployment notes.
- [x] 3.2 Document that refresh cookies are intentionally out of scope for this change.

## 4. Verification

- [x] 4.1 Add or update backend tests for missing, invalid, expired, inactive, and valid bearer tokens.
- [x] 4.2 Add or update frontend tests for `401` token cleanup and `403` handling.
- [x] 4.3 Run `pytest tests/test_auth.py tests/test_user.py`.
- [x] 4.4 Run `cd Fitness-ai-frontend && npm run test`.
