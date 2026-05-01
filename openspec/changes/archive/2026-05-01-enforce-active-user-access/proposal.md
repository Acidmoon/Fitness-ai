## Why

The backend currently blocks inactive users on some user endpoints but still allows them to access other authenticated business endpoints through shared token resolution. This creates inconsistent authorization behavior and leaves disabled accounts with more access than intended.

## What Changes

- Enforce active-account checks in the shared authenticated user dependency used by protected business endpoints.
- Preserve the current response contract for inactive account access by returning a consistent forbidden response.
- Add regression tests covering inactive users across user, exercise, stats, and video endpoints.

## Capabilities

### New Capabilities

### Modified Capabilities
- `user-account`: inactive-account restrictions become part of the shared authenticated access contract
- `exercise-records`: inactive users can no longer access authenticated record management endpoints
- `exercise-stats`: inactive users can no longer access authenticated stats endpoints
- `video-management`: inactive users can no longer access authenticated video endpoints

## Impact

- Affected code will primarily be in `app/utils/security.py` plus test modules for user, exercise, stats, and video APIs.
- This is an authorization behavior change for inactive accounts but does not change token format or public endpoints.
