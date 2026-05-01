## 1. Shared Access Enforcement

- [x] 1.1 Enforce inactive-account blocking in the shared authenticated user dependency
- [x] 1.2 Remove redundant route-local inactive checks that become dead code after centralizing enforcement

## 2. Regression Coverage

- [x] 2.1 Add user endpoint tests for inactive account access
- [x] 2.2 Add exercise, stats, and video endpoint tests for inactive account access

## 3. Verification

- [x] 3.1 Run backend tests for the updated authorization behavior
- [x] 3.2 Validate the OpenSpec change before applying it to main specs
