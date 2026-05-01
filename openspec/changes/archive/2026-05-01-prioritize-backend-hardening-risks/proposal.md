## Why

The backend review surfaced five hardening gaps with different risk levels, but they currently sit as isolated findings. We need one execution plan that orders remediation by exploitability and data impact so implementation starts with identity and account-control risks before consistency and data-quality work.

## What Changes

- Prioritize the numeric JWT subject collision as the highest-risk remediation and require deterministic subject resolution that cannot map one token to another account.
- Treat inactive-account login as the next authentication hardening item so deactivated users cannot mint fresh bearer tokens.
- Tighten video lifecycle cleanup semantics so file deletion and database state changes are coordinated, observable, and covered by failure-path tests.
- Add explicit validation bounds for exercise metrics and payload size limits for free-form record fields to reduce bad data ingestion and oversized request pressure.
- Normalize persisted timestamp behavior and date-based query assumptions so exercise record filtering and stats aggregation remain stable across database backends and time zones.

## Capabilities

### New Capabilities

### Modified Capabilities
- `auth`: JWT subject resolution and login eligibility rules change to prevent account collisions and inactive-user token issuance
- `video-management`: stored video cleanup requirements change to define failure handling and consistency expectations
- `exercise-records`: record creation and update validation gain stricter bounds for metrics, payload sizes, and timestamp handling
- `exercise-stats`: date-scoped statistics rely on normalized timestamp semantics for cross-database consistency

## Impact

- Affected code will include `app/utils/security.py`, `app/api/auth.py`, `app/api/video.py`, `app/utils/video_files.py`, `app/api/exercise.py`, `app/schemas/exercise.py`, and the SQLAlchemy timestamp columns on users and records.
- Tests will need new regression coverage for token subject collisions, inactive-user login denial, file-cleanup failure paths, metric validation boundaries, and timezone-sensitive date filtering.
- No new external dependencies are expected, but some API error behavior will become stricter for invalid login attempts and malformed record payloads.
