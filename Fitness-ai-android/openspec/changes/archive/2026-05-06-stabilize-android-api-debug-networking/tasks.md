## 1. Debug Network Policy

- [x] 1.1 Add debug-scoped Android network security configuration for emulator host and local development HTTP access.
- [x] 1.2 Wire the debug manifest/build variant to use the debug network security configuration.
- [x] 1.3 Verify release build configuration does not include a broad arbitrary cleartext allowance.

## 2. Documentation

- [x] 2.1 Update Android README backend API mode documentation with debug cleartext behavior, emulator `10.0.2.2`, physical device LAN URL, and release HTTPS expectations.

## 3. Verification

- [x] 3.1 Run an API mode debug build with `-PFITNESS_AI_BACKEND_MODE=api -PFITNESS_AI_BACKEND_BASE_URL=http://10.0.2.2:8000/`.
- [x] 3.2 Run release or manifest/resource inspection sufficient to confirm the debug network policy is not applied broadly to release.
- [x] 3.3 Run `.\gradlew.bat testDebugUnitTest assembleDebug --no-daemon`.
