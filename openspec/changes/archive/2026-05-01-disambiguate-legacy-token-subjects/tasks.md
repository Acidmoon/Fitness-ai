## 1. Subject Disambiguation

- [x] 1.1 Update shared JWT subject resolution to fall back from numeric id lookup to username lookup when no matching id exists
- [x] 1.2 Reject numeric-only usernames in shared username validation

## 2. Regression Coverage

- [x] 2.1 Add auth tests for numeric-only username rejection and numeric legacy subject fallback
- [x] 2.2 Add user profile update tests for numeric-only username rejection

## 3. Verification

- [x] 3.1 Run backend tests for the updated auth and user validation behavior
- [x] 3.2 Validate the OpenSpec change before syncing and archiving
