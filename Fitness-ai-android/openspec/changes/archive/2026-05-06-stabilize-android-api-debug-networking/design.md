## Context

The Android app now has API mode with a default local backend URL of `http://10.0.2.2:8000/`. The app targets SDK 35, so Android platform defaults block cleartext HTTP unless the app explicitly permits it. Local API validation needs HTTP for emulator and LAN testing, but release builds should not relax production network security.

## Goals / Non-Goals

**Goals:**
- Make API mode debug builds able to reach local HTTP backends on emulator and physical devices.
- Keep cleartext allowance scoped to debug/development hosts.
- Preserve release-build expectation that production API URLs use HTTPS.
- Document the behavior so testers know when to use `10.0.2.2`, LAN IPs, or HTTPS.

**Non-Goals:**
- Add an in-app developer settings screen.
- Change backend deployment or CORS configuration.
- Support arbitrary cleartext production endpoints.
- Implement API repositories beyond authentication.

## Decisions

### Use debug-only Network Security Config

Debug builds should reference a `network_security_config` resource that permits cleartext for local development hosts such as `10.0.2.2`, `localhost`, `127.0.0.1`, and private LAN ranges needed for device testing. Release builds should omit this debug policy so the platform default remains strict. A global `usesCleartextTraffic=true` flag was considered, but it is too broad and would weaken release behavior if accidentally shared.

### Keep base URL configuration unchanged

The existing Gradle properties remain the entry point for API mode and base URL selection. This change only ensures the Android runtime policy matches the documented local URLs. Moving base URL selection into a runtime settings screen is deferred because it is a product/design decision outside this stabilization.

### Verify by build artifacts and API smoke path

Unit tests cannot fully validate Android platform network security behavior. Verification should include debug and release manifest/resource checks where feasible, plus an API mode debug build using the documented `10.0.2.2` base URL. Manual emulator login remains useful after this change but should not be the only signal.

## Risks / Trade-offs

- Debug policy accidentally included in release -> Keep resource/manifest wiring build-type scoped and verify release packaging.
- Physical device LAN IPs vary -> Document expected `http://<host-lan-ip>:8000/` usage and keep the policy broad enough for private network testing only.
- Network security config domain matching can be subtle -> Prefer explicit host entries for emulator loopback plus clear docs for LAN testing.

## Migration Plan

1. Add debug-scoped network security XML and manifest/build-type wiring.
2. Update README backend API mode documentation with debug/release cleartext expectations.
3. Build debug API mode and release variants to confirm packaging.
4. Rollback by removing the debug manifest/resource override if it causes unexpected packaging behavior.

## Open Questions

- Should future production API URLs be enforced by a release build validation task that rejects `http://` base URLs?
