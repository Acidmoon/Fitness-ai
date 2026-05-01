## Context

The backend already has baseline auth, record, stats, and video safeguards, but the latest review found five gaps that are not equally urgent. Two issues sit directly on the identity boundary: numeric legacy JWT subjects can resolve to the wrong account, and inactive users can still mint fresh tokens. The remaining issues affect file/database consistency, data-shape validation, and cross-database timestamp behavior.

This change is intentionally cross-cutting. It touches shared authentication helpers, the login endpoint, video file lifecycle helpers, record validation schemas, and timestamp usage in both records and stats. Because the work spans multiple modules and includes security-sensitive behavior changes, the change needs an explicit severity-ordered design before implementation.

## Goals / Non-Goals

**Goals:**
- Establish a remediation order that starts with the highest-risk identity issues.
- Make JWT subject resolution deterministic so one token can never authenticate as the wrong account.
- Prevent inactive accounts from receiving new bearer tokens.
- Define safer file-cleanup semantics for video lifecycle operations, including failure behavior.
- Bound exercise record metrics and unstructured payload sizes with API-level validation.
- Normalize timestamp persistence and query behavior so date filters and aggregates remain stable across SQLite and PostgreSQL.

**Non-Goals:**
- Redesign the auth model beyond the current username/password plus JWT flow.
- Introduce async background cleanup workers or object storage for videos.
- Rework the exercise stats API shape beyond timestamp normalization side effects.
- Perform a one-off production data migration for legacy numeric usernames unless implementation later proves it necessary.

## Decisions

Implement the change in three severity tiers: P0 for identity integrity, P1 for consistency and ingestion hardening, and P2 for timestamp normalization.
This keeps the first implementation slice aligned with exploitability rather than code locality. The numeric-subject collision and inactive-login gap affect authentication trust directly, so they ship first. Video cleanup consistency and payload validation come next because they threaten integrity and operational safety but are less immediately exploitable. Timestamp normalization follows because it is primarily correctness and cross-environment rigor.
Alternative considered: implement by module (`auth`, `video`, `exercise`) in repository order. Rejected because it would mix high-risk and low-risk work and weaken rollout discipline.

Use explicit subject interpretation rules instead of heuristic fallback alone.
New id-based tokens remain the canonical format, but the shared resolver must distinguish “current id token” from “legacy username token” without allowing a numeric legacy subject to authenticate as another user. The implementation can satisfy this either by embedding an explicit subject type claim for newly issued tokens or by otherwise making id-token parsing unambiguous while preserving a safe legacy compatibility branch.
Alternative considered: keep the current `isdigit()` heuristic and rely on fallback only when id lookup misses. Rejected because a numeric legacy username can still collide with an existing user id and resolve to the wrong principal.

Block inactive users at login before token issuance.
Inactive state should be enforced at both authentication time and protected-route access time. This closes the current gap where a deactivated user can still obtain a fresh token even though later requests are rejected.
Alternative considered: leave login unchanged because downstream requests already return `403 Forbidden`. Rejected because token issuance itself is an authentication success signal and creates avoidable session noise.

Treat video cleanup as a coordinated state transition with explicit failure handling.
Record updates and deletions that affect stored video files should define what happens when disk deletion fails, when database commit fails, and when the stored path is invalid. The implementation should prefer preserving a recoverable state over silently masking cleanup failures.
Alternative considered: keep best-effort deletion with boolean return values only. Rejected because silent failure makes orphaned files and state divergence hard to detect and audit.

Centralize validation bounds for exercise metrics and payload sizes in schemas.
Heart rate fields need numeric ranges, and free-form fields such as `feedback` and `keypoints_data` need size constraints or normalized limits at request-validation boundaries. This keeps bad data out before it reaches persistence and stats.
Alternative considered: trust clients and rely on database column sizes or operational monitoring. Rejected because current models do not provide meaningful guardrails for JSON and text payloads.

Standardize on timezone-aware persisted timestamps and UTC-based query boundaries.
The record and stats flows should define their comparisons against a normalized timezone baseline so the same request behaves consistently across supported databases. API-level date filters remain date-based, but internal persistence and aggregation should not depend on implicit local timezone behavior.
Alternative considered: keep naive datetimes and accept backend-specific differences. Rejected because it leaves correctness dependent on the active database adapter and deployment timezone.

## Risks / Trade-offs

- [Changing JWT subject interpretation may affect legacy tokens in production] → Add explicit regression tests for id tokens, non-numeric legacy usernames, numeric legacy usernames, and collision scenarios before rollout.
- [Blocking inactive login changes observable auth behavior] → Return the same permission-oriented error family used elsewhere and document the stricter login rule in tests.
- [Making file cleanup stricter can surface previously hidden operational errors] → Define deterministic failure handling and log actionable cleanup failures instead of silently ignoring them.
- [Payload limits can reject data that some clients currently submit] → Choose documented limits, add validation tests, and treat the tighter schema as a backward-incompatible input hardening change if necessary.
- [Timestamp normalization can shift edge-case date buckets] → Anchor comparisons to UTC and add tests around boundary dates rather than relying on implicit local time.

## Migration Plan

Implement and ship P0 first: auth subject disambiguation and inactive-login denial, plus regression tests.

Implement P1 next: video lifecycle consistency and record payload validation. Roll out with focused failure-path tests and verify no owned-file cleanup regressions.

Implement P2 last: timestamp normalization for persistence, record filtering, and stats aggregation. Validate date-boundary behavior in both record listing and weekly stats tests.

Rollback remains possible per tier because the work is grouped by module boundaries and test coverage. If a later tier introduces operational issues, the earlier auth hardening tier can remain in place.

## Open Questions

- Whether new JWTs should carry an explicit subject-type claim or use another compatibility-safe discriminator.
- What concrete maximum sizes should be imposed for `feedback` text and `keypoints_data` JSON payloads.
- Whether existing persisted timestamps require normalization handling during reads, or whether the change can safely apply only to newly written values.
