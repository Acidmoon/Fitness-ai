# Fitness AI Android

Android client workspace for the Fitness AI project.

This directory is the working boundary for Android-side planning, design, and implementation. The first milestone is a minimum viable Android app for internal testing, using local/mock data first and leaving backend integration as a later step.

## MVP Direction

- Target users: students, teachers, administrators, and personal fitness users.
- Platform: Android only.
- Network: required for the final product, but MVP can run with local mock data.
- Backend integration: deferred.
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

## Current Status

Android MVP implementation has started under `app/`. The current code includes mock login, role selection, main tab navigation, local training records, camera/video picker flows, video preview, simulated analysis, local notifications, and focused repository tests.
