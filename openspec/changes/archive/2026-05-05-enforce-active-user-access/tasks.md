## 1. Shared Access Control

- [x] 1.1 Update authenticated-user resolution to reject inactive users with status `403`.
- [x] 1.2 Preserve status `401` for invalid, expired, missing, or unknown-user tokens.
- [x] 1.3 Preserve support for both numeric user id and legacy username token subjects.

## 2. Route Cleanup

- [x] 2.1 Review user routes for duplicated active-account checks.
- [x] 2.2 Keep or remove duplicated checks based on clarity and test coverage.

## 3. Verification

- [x] 3.1 Add tests for inactive accounts on profile, exercise records, stats, and video routes.
- [x] 3.2 Add regression tests for valid active-user tokens.
- [x] 3.3 Run `pytest tests/test_auth.py tests/test_user.py tests/test_exercise.py tests/test_stats.py tests/test_video.py`.
- [x] 3.4 Run `pytest`.
