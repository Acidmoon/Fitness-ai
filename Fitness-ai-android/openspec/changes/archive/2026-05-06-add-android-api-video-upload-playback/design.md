## Context

The app supports local camera capture, system video selection, and Media3 playback for local URIs. The Retrofit layer already defines backend video upload, delete, and streaming endpoints, but no API-mode video repository exists.

## Goals / Non-Goals

**Goals:**
- Upload selected/recorded videos to backend records in API mode.
- Preview backend videos when `video_url` exists on a backend record.
- Preserve mock-mode local URI behavior.
- Clear stale analysis when a video is replaced.
- Keep upload and playback failures recoverable.

**Non-Goals:**
- Pose-analysis or scoring integration.
- Background uploads or resumable upload support.
- Offline video queueing.
- Video transcoding or compression.

## Decisions

### Make video attachment async

API upload is network-bound and can fail, so `VideoRepository.attachVideo` should become suspendable and result-bearing. Mock mode can keep the same behavior behind the new signature.

### Use backend record IDs as the API contract

API video endpoints are keyed by backend `record_id`. API mode should upload only when the current record ID maps to a backend numeric ID and should return a recoverable error otherwise.

### Represent backend video as playable URI state

The existing `TrainingRecord.videoUri` can represent both local and backend video locations if the mapper resolves backend `video_url` into a usable Uri. If relative backend paths are returned, the API repository should resolve them against the configured base URL.

### Refresh after upload/delete

After successful upload or delete, refresh backend records so list/detail screens use backend-confirmed `video_url` state. This also avoids hand-patching differences between upload responses and record responses.

## Risks / Trade-offs

- Content URI upload requires opening Android content safely -> Use `ContentResolver` and multipart bodies without assuming filesystem paths.
- Large files can be slow in debug builds -> Keep uploads foreground and explicit for now.
- Relative video URLs can be malformed -> Resolve against configured base URL and test absolute/relative shapes.

## Migration Plan

1. Update video repository contract and local implementation.
2. Implement API video upload/delete and URL mapping.
3. Update ViewModel/UI to show upload progress and recoverable errors.
4. Add tests for multipart upload path, URL mapping, and mock preservation.

## Open Questions

- Should API mode expose explicit remove-video action now, or only support replacement through upload?
