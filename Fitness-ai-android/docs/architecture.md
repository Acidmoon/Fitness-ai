# Android Architecture

## Guiding Principle

The Android MVP should be built so that mock data can be replaced by real backend API calls without rewriting the UI layer.

## Proposed Layers

```text
Compose UI
  ↓
ViewModel
  ↓
Use Case / UI-facing operations
  ↓
Repository interface
  ├─ Mock repository for MVP
  └─ API repository for future backend integration
  ↓
Local storage / Remote API
```

## Navigation

Use a single-activity Compose app with Navigation Compose.

Initial route structure:

```text
auth/login
auth/role-select
main/home
main/training
main/training/create
main/training/{recordId}
main/stats
main/profile
```

## Data Model Draft

### User

- id
- displayName
- role
- avatarUrl, optional

### TrainingRecord

- id
- exerciseName
- category
- count
- score
- durationSeconds
- recordedAt
- videoUri, optional
- analysisStatus
- analysisResult, optional

### AnalysisResult

- status
- modelName
- validFrameCount
- averageConfidence
- scorePreview
- message

## Repository Boundary

The UI should depend on interfaces similar to:

```text
AuthRepository
TrainingRecordRepository
VideoRepository
AnalysisRepository
NotificationScheduler
```

For MVP, these can be backed by local in-memory data or lightweight local persistence. Later, the same contracts can be backed by Retrofit and the existing backend OpenAPI contract.

## Backend Integration Later

The existing backend exposes endpoints for:

- Authentication
- Exercise records
- Statistics
- User profile
- Video upload and protected video playback
- Asynchronous pose analysis jobs
- Pose scoring

When backend integration starts, the Android source should add:

- Retrofit service definitions
- Token storage and authorization interceptor
- Error mapping
- Multipart video upload support
- Polling for pose-analysis jobs
- Protected video playback with Authorization headers or backend-issued temporary playback URLs
