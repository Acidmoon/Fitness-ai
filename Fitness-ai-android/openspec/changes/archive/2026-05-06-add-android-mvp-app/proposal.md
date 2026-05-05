## Why

The project needs an Android client that can validate the mobile product flow before investing in full backend integration. Building a local/mock-data MVP first lets internal testers assess navigation, training record entry, video capture/selection, and simulated AI analysis on real devices.

## What Changes

- Add a native Android MVP workspace and app structure under `Fitness-ai-android`.
- Add a mock login and role-selection flow for students, teachers, administrators, and personal fitness users.
- Add a modern minimalist Compose app shell with Home, Training, Stats, and Profile sections.
- Add local training record creation, listing, detail viewing, editing, and deletion.
- Add camera video recording, local video selection, record-to-video binding, and video preview.
- Add a simulated pose-analysis workflow with queued/running/completed states and simulated results.
- Add local notification support for simulated analysis completion.
- Keep real backend API integration, real AI analysis, real-time posture correction, iOS support, and public release workflows out of this MVP.

## Capabilities

### New Capabilities

- `android-app-shell`: Android app startup, mock login, role selection, navigation, and shared visual shell.
- `android-training-records`: Local training record list, create, detail, edit, and delete behavior.
- `android-video-workflow`: Camera recording, local video selection, video binding, and preview behavior.
- `android-simulated-analysis`: Simulated pose-analysis lifecycle, result display, and local completion notification.
- `android-dashboard-profile`: Home overview, basic statistics, and profile display for internal testing.

### Modified Capabilities

- None.

## Impact

- Adds Android planning and implementation artifacts under `Fitness-ai-android`.
- Introduces Android dependencies for Kotlin, Jetpack Compose, Navigation Compose, CameraX, Media3, and local notification handling during implementation.
- Does not change existing FastAPI backend behavior.
- Does not change existing React frontend behavior.
- Creates repository boundaries so future Retrofit/OpenAPI integration can replace mock repositories without rewriting UI flows.
