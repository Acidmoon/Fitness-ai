## 1. P0 Identity Integrity

- [x] 1.1 Update login behavior to reject inactive users before issuing tokens
- [x] 1.2 Replace ambiguous JWT subject parsing with deterministic current-token and legacy-token resolution logic
- [x] 1.3 Add auth regression tests for inactive-user login denial, id-token resolution, legacy username resolution, and numeric collision handling

## 2. P1 File Lifecycle And Payload Hardening

- [x] 2.1 Refine video cleanup helpers so owned-file deletion errors are surfaced explicitly while invalid or missing paths are handled safely
- [x] 2.2 Update upload replacement, video delete, record delete, batch delete, and account delete flows to follow the new cleanup consistency rules
- [x] 2.3 Add schema validation bounds for heart-rate metrics and configured size limits for `feedback` and `keypoints_data`
- [x] 2.4 Add regression tests for video cleanup failure paths and record validation boundary cases

## 3. P2 Timestamp Normalization

- [x] 3.1 Normalize persisted timestamp definitions and shared query helpers around UTC-aware semantics
- [x] 3.2 Update record date filtering and weekly stats aggregation to use the normalized timestamp rules across supported databases
- [x] 3.3 Add tests covering date-boundary stability for record listing and weekly stats aggregation

## 4. Verification

- [x] 4.1 Run the backend pytest suite after each completed severity tier
- [x] 4.2 Validate the OpenSpec change before applying or archiving it
