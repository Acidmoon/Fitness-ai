## Why

API mode currently documents local backend URLs such as `http://10.0.2.2:8000/`, but Android debug builds target API 35 where cleartext HTTP is blocked by default. Without an explicit debug-only network policy, emulator and device API smoke tests can fail at runtime even when the app builds and the backend is reachable.

## What Changes

- Add debug-only Android network security configuration for local backend HTTP access.
- Keep release builds aligned with HTTPS expectations and avoid broad cleartext allowance in production builds.
- Document the debug/release behavior for emulator, physical device, and production backend URLs.
- Add verification that API mode debug builds package the local-network policy and release builds do not relax production network security.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `android-api-foundation`: Clarify that configurable API clients must support local HTTP endpoints only through debug-scoped Android network policy while preserving production HTTPS expectations.

## Impact

- Affected Android code: Manifest/build type wiring, debug XML resources, README or developer documentation, and build verification.
- No backend API changes.
- No user-facing UI changes.
