# Fitness AI Android

Android client workspace for the Fitness AI project.

This directory is the working boundary for Android-side planning, design, and implementation. The first milestone is a minimum viable Android app for internal testing, using local/mock data first and leaving backend integration as a later step.

## MVP Direction

- Target users: students, teachers, administrators, and personal fitness users.
- Platform: Android only.
- Network: required for the final product, but MVP can run with local mock data.
- Backend integration: mock mode remains the default; API mode can be enabled for local backend authentication.
- Real-time posture correction: deferred.
- Video input: support both camera recording and selecting an existing local video.
- Notification: support local analysis-complete notifications.
- UI style: modern, simple, line-based visual design.

## Directory Layout

```text
Fitness-ai-android/
├── app/
│   └── src/
├── README.md
├── build.gradle.kts
└── docs/
    ├── architecture.md
    ├── mvp-plan.md
    └── tasks.md
```

Future Android source code should live in this directory, for example:

```text
Fitness-ai-android/
├── app/
├── build.gradle.kts
├── settings.gradle.kts
└── gradle/
```

## Recommended Stack

- Kotlin
- Jetpack Compose
- Navigation Compose
- MVVM
- Repository abstraction with mock and future API implementations
- DataStore or Room for local MVP state
- CameraX for video recording
- Media3 for video playback
- Local notifications for simulated analysis completion

## How to Open

Open `Fitness-ai-android` as an Android Studio project. The app module is `:app`.

Local command-line tooling has been installed under `E:\Android`:

- Android SDK: `E:\Android\Sdk`
- Gradle: `E:\Android\Gradle\gradle-8.10.2`
- Gradle wrapper distribution: Tencent Cloud mirror

The project includes `gradlew.bat`, so use the wrapper from this directory:

```powershell
.\gradlew.bat testDebugUnitTest assembleDebug
```

Last verified command:

```text
.\gradlew.bat testDebugUnitTest assembleDebug --no-daemon
BUILD SUCCESSFUL
```

## Backend API Mode

Mock mode is the default so internal MVP testing does not require a running backend. Debug builds include a development-only network policy that permits local HTTP backend access. To build against a local backend from the Android emulator, use:

```powershell
.\gradlew.bat assembleDebug -PFITNESS_AI_BACKEND_MODE=api -PFITNESS_AI_BACKEND_BASE_URL=http://10.0.2.2:8000/
```

Use `10.0.2.2` when the Android emulator needs to reach a backend running on the host machine. On a physical device, use an address reachable from the device, such as the host computer's LAN IP (`http://192.168.x.x:8000/`) and ensure firewall rules allow the connection.

Release builds should use HTTPS backend URLs. The debug-only cleartext policy is not intended for production API endpoints.

### Local API-Mode Verification

1. Start the Fitness AI backend locally and confirm it is reachable at `http://127.0.0.1:8000/` from the host.
2. Build the app for emulator API mode:

```powershell
.\gradlew.bat assembleDebug -PFITNESS_AI_BACKEND_MODE=api -PFITNESS_AI_BACKEND_BASE_URL=http://10.0.2.2:8000/
```

3. For a physical Android device, replace `10.0.2.2` with the host computer LAN address, for example `http://192.168.1.20:8000/`.
4. Launch the debug build, log in with a backend test account, choose a role, open Home, Training, and Stats, and use retry buttons if the backend is temporarily unavailable.
5. Exercise the full workflow: refresh records, create a training record, open the record detail, add or record a video, start analysis, run scoring when available, and return to Home/Stats to confirm refreshed totals.
6. Run the repeatable unit verification:

```powershell
.\gradlew.bat testDebugUnitTest --no-daemon
```

## Current Status

Android MVP implementation has started under `app/`. The current code includes mock login, role selection, main tab navigation, local training records, camera/video picker flows, video preview, simulated analysis, local notifications, and focused repository tests.
