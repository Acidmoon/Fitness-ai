## 1. Project Setup

- [x] 1.1 Create the Android project structure under `Fitness-ai-android` without modifying backend or React frontend files.
- [x] 1.2 Configure Kotlin, Gradle, Jetpack Compose, and Android application settings.
- [x] 1.3 Add Navigation Compose, lifecycle/ViewModel dependencies, CameraX, Media3, and notification support dependencies.
- [x] 1.4 Create a modern minimalist app theme with shared colors, typography, spacing, and line-based component styling.
- [x] 1.5 Create the baseline package structure for app shell, auth, records, video, analysis, stats, profile, data, and shared UI.

## 2. App Shell and Mock Authentication

- [x] 2.1 Implement the single-activity Compose entry point.
- [x] 2.2 Implement mock login screen with success and recoverable failure states.
- [x] 2.3 Implement role simulation for student, teacher, administrator, and personal fitness user.
- [x] 2.4 Implement authenticated navigation with Home, Training, Stats, and Profile tabs.
- [x] 2.5 Implement shared loading, empty, and error state components.
- [x] 2.6 Implement logout from Profile and return to the login flow.

## 3. Local Data and Repository Layer

- [x] 3.1 Define MVP models for user session, role, training record, video attachment, analysis status, and analysis result.
- [x] 3.2 Define repository interfaces for auth, training records, video attachment, analysis, and notifications.
- [x] 3.3 Implement mock/local repositories behind the interfaces.
- [x] 3.4 Decide and implement MVP persistence level: in-memory only, DataStore, or Room.
- [x] 3.5 Ensure local data updates propagate to Home, Training, Stats, and Record Detail screens.

## 4. Training Record Flow

- [x] 4.1 Implement the Training record list with populated and empty states.
- [x] 4.2 Implement create-record screen with required field validation.
- [x] 4.3 Implement record detail screen showing record fields, video state, and analysis state.
- [x] 4.4 Implement edit-record behavior and update list/detail state after saving.
- [x] 4.5 Implement delete-record behavior with confirmation and state refresh.

## 5. Video Workflow

- [x] 5.1 Implement camera permission request and permission-denied UI state.
- [x] 5.2 Implement CameraX video recording from record detail.
- [x] 5.3 Bind captured videos to the selected training record.
- [x] 5.4 Implement system picker flow for selecting existing local videos.
- [x] 5.5 Bind selected video URIs to the selected training record.
- [x] 5.6 Implement Media3 video preview for attached videos.
- [x] 5.7 Clear stale simulated analysis when an attached video is replaced.

## 6. Simulated Analysis and Notifications

- [x] 6.1 Implement start-analysis action only when a record has an attached video.
- [x] 6.2 Implement queued, running, completed, and failed simulated analysis states.
- [x] 6.3 Prevent duplicate starts while simulated analysis is active.
- [x] 6.4 Generate and display simulated model name, valid frame count, average confidence, score preview, and message.
- [x] 6.5 Implement notification permission handling where required by Android version.
- [x] 6.6 Post a local notification when simulated analysis completes and notification permission is available.

## 7. Dashboard, Stats, and Profile

- [x] 7.1 Implement Home overview using local MVP records and recent activity.
- [x] 7.2 Implement zero-data Home state.
- [x] 7.3 Implement Stats screen with aggregate metrics derived from local records.
- [x] 7.4 Implement zero-data Stats state.
- [x] 7.5 Implement Profile screen showing mock user identity and selected role.

## 8. Verification

- [ ] 8.1 Verify mock login, role selection, tab navigation, and logout.
- [ ] 8.2 Verify record create, list, detail, edit, and delete flows.
- [ ] 8.3 Verify camera recording, video picker, video replacement, and video preview.
- [ ] 8.4 Verify simulated analysis states, result display, stale-result clearing, and notification behavior.
- [ ] 8.5 Verify small-screen layouts and permission-denied paths.
- [x] 8.6 Add focused unit tests for repositories or ViewModels where practical.
