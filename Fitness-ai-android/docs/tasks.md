# Android MVP Tasks

## 1. Project Setup

- [ ] Create Android project under `Fitness-ai-android`.
- [ ] Configure Kotlin and Jetpack Compose.
- [ ] Add app theme for modern minimalist line-based UI.
- [ ] Add Navigation Compose.
- [ ] Add baseline package structure.

## 2. App Shell

- [ ] Create single-activity app shell.
- [ ] Add login flow.
- [ ] Add role selection or role simulation.
- [ ] Add bottom navigation tabs: Home, Training, Stats, Profile.
- [ ] Add empty, loading, and error states.

## 3. Local Data MVP

- [ ] Define local models for user, training record, video attachment, and analysis result.
- [ ] Create repository interfaces.
- [ ] Implement mock repositories.
- [ ] Optionally persist MVP data with DataStore or Room.

## 4. Training Records

- [ ] Build training record list page.
- [ ] Build create record page.
- [ ] Build record detail page.
- [ ] Support editing records.
- [ ] Support deleting records.

## 5. Video

- [ ] Add camera permission flow.
- [ ] Add CameraX video recording.
- [ ] Add local video picker.
- [ ] Bind video URI to a training record.
- [ ] Add Media3 video preview.

## 6. Simulated Analysis

- [ ] Add start analysis action from record detail.
- [ ] Show queued/running/completed/failed states.
- [ ] Generate simulated analysis result.
- [ ] Clear stale simulated result when the record video changes.
- [ ] Add local notification when simulated analysis completes.

## 7. Internal Test Polish

- [ ] Check common Android permission denial paths.
- [ ] Check behavior after app restart.
- [ ] Check small-screen layout.
- [ ] Add basic unit tests for repositories or ViewModels.
- [ ] Prepare internal testing notes.

## 8. Deferred Backend Integration

- [ ] Add Retrofit API client.
- [ ] Add token storage and OkHttp authorization interceptor.
- [ ] Map existing OpenAPI schemas to Android models.
- [ ] Connect login/register endpoints.
- [ ] Connect exercise record endpoints.
- [ ] Connect stats endpoints.
- [ ] Connect video upload and playback.
- [ ] Connect pose-analysis job polling.
- [ ] Connect pose scoring.
