## ADDED Requirements

### Requirement: Android app supports local debug API networking safely
The Android app SHALL allow API mode debug builds to reach documented local HTTP backend URLs while preserving stricter release-build network security.

#### Scenario: Debug build uses emulator host URL
- **WHEN** a debug build runs in API mode with `http://10.0.2.2:8000/`
- **THEN** Android network security policy permits the request to the host backend

#### Scenario: Debug build uses a LAN backend URL
- **WHEN** a debug build runs on a physical device with a documented reachable LAN HTTP backend URL
- **THEN** Android network security policy permits the local development request

#### Scenario: Release build does not broadly allow cleartext
- **WHEN** a release build is produced
- **THEN** the app does not include a broad production cleartext allowance for arbitrary HTTP API endpoints

#### Scenario: Local networking behavior is documented
- **WHEN** a developer enables API mode for local testing
- **THEN** project documentation explains emulator `10.0.2.2`, physical device LAN URLs, and release HTTPS expectations
