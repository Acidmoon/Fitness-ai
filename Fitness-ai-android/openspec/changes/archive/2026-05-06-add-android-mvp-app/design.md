## Context

The repository currently has a FastAPI backend and React frontend, while Android work is isolated under `Fitness-ai-android`. The first Android milestone is an internal-test MVP that validates the mobile experience with local/mock data before connecting to backend APIs. The app must support all target user categories at the UX level, but teacher and administrator management workflows are not part of the first release.

## Goals / Non-Goals

**Goals:**

- Build a native Android MVP using Kotlin and Jetpack Compose.
- Provide a single-activity app with mock login, role selection, bottom-tab navigation, and modern minimalist UI styling.
- Support local training records with create, list, detail, edit, and delete flows.
- Support both camera-recorded videos and existing local videos as record attachments.
- Support video preview from record detail.
- Support simulated pose-analysis states, simulated result display, and local completion notification.
- Keep UI and ViewModel code independent from the eventual backend API client through repository interfaces.

**Non-Goals:**

- Real backend API integration.
- Real MoveNet or server-side pose analysis.
- Real-time posture correction.
- Full teacher/admin management features.
- Offline sync.
- iOS support.
- Public app store release.

## Decisions

### Use Kotlin + Jetpack Compose for UI

The Android app will use Kotlin and Jetpack Compose because the MVP needs fast iteration, concise state-driven UI, and a clean path to future screen additions. XML views were considered, but Compose better matches a new Android app with modern UI requirements and reduces layout boilerplate.

### Use a single-activity MVVM structure

The app will use one activity, Navigation Compose, screen-level ViewModels, and repository interfaces. This keeps navigation centralized and makes screen state testable. A multi-activity approach was considered, but it would add unnecessary lifecycle and navigation complexity for this MVP.

### Use repository interfaces from the first implementation

The MVP will depend on interfaces such as `AuthRepository`, `TrainingRecordRepository`, `VideoRepository`, `AnalysisRepository`, and `NotificationScheduler`. Mock/local implementations will back the MVP, while Retrofit-backed implementations can be added later. Directly calling mock data from ViewModels was considered, but that would make backend integration more invasive.

### Use local persistence only where it improves internal testing

The MVP can start with in-memory repositories, but should prefer DataStore or Room if testers need data to survive app restart. DataStore is enough for session and simple preferences; Room is more appropriate for multiple training records with query/edit/delete behavior. The implementation can start simple and introduce Room when record persistence becomes necessary.

### Use platform media components

CameraX will handle video recording, the system picker will handle selecting existing videos, and Media3 will handle video preview. Hand-rolled camera or playback code was considered too risky for the MVP because permissions, lifecycle, and codec behavior are easy to get wrong.

### Simulate analysis instead of connecting AI services

The app will expose the intended analysis lifecycle using local queued, running, completed, and failed states. This validates UX and notification behavior before backend integration. Real analysis is deferred because it depends on backend connection and model/runtime decisions outside the Android MVP.

## Risks / Trade-offs

- Mock data can hide API contract issues -> Keep repository interfaces close to current backend concepts and reserve a later backend-integration task.
- Local video URI access can break after process death if permissions are not persisted -> Use persistable URI permissions for picked videos where supported and copy/capture app-owned videos when appropriate.
- Camera and notification permissions vary by Android version -> Implement explicit permission-denied states and test on recent Android versions.
- Simulated analysis can mislead testers about real processing time -> Label states as internal-test simulation in implementation notes and avoid promising real AI behavior in UI copy.
- Room may be overkill for the earliest prototype -> Start with repository abstraction so persistence can be upgraded without changing screens.

## Migration Plan

1. Keep all Android source and OpenSpec artifacts under `Fitness-ai-android`.
2. Create the Android app skeleton and mock data layer.
3. Implement MVP screens and media workflows.
4. Run internal tests without requiring the backend.
5. In a later change, add Retrofit, token handling, multipart upload, job polling, and protected video playback.

Rollback is simple during MVP: remove or ignore `Fitness-ai-android` without affecting the backend or React frontend.

## Open Questions

- Should MVP training records persist across app restarts with Room, or is in-memory data enough for the first internal demo?
- Which Android minimum SDK should the project target?
- Should role selection happen after mock login, or should the login page expose separate mock users per role?
