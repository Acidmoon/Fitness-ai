# Android MVP Plan

## Goal

Build a minimum viable Android app for internal testing. The MVP validates the mobile user flow, video capture/selection experience, local training records, and a simulated AI analysis flow before connecting to the existing FastAPI backend.

## MVP Scope

### Included

- Simulated login and role selection.
- Home overview with training summary and recent records.
- Local training record list.
- Create, view, edit, and delete local training records.
- Record detail page.
- Record video by camera.
- Select an existing local video.
- Bind a video to a training record.
- Preview the bound video.
- Simulated pose analysis flow.
- Simulated analysis result.
- Local notification when simulated analysis completes.
- Profile page with basic user and role information.

### Deferred

- Real backend API integration.
- Real AI pose analysis.
- Real-time posture correction.
- Teacher/admin management workflows beyond role display.
- Offline sync.
- iOS support.
- Public app store release.

## Main User Flow

```text
Login / Role Selection
  ↓
Main Tabs
  ├─ Home
  ├─ Training
  │   ├─ Record List
  │   ├─ Create Record
  │   └─ Record Detail
  │       ├─ Record Video
  │       ├─ Select Video
  │       ├─ Preview Video
  │       └─ Simulated Analysis
  ├─ Stats
  └─ Profile
```

## MVP Acceptance Criteria

- A tester can open the app, log in with mock credentials, and enter the main interface.
- A tester can create at least one training record and see it in the record list.
- A tester can attach a newly recorded video to a record.
- A tester can attach an existing local video to a record.
- A tester can preview the attached video.
- A tester can start a simulated analysis and see a completed simulated result.
- The app can show a local notification when the simulated analysis completes.
- The app does not require a live backend during MVP testing.
