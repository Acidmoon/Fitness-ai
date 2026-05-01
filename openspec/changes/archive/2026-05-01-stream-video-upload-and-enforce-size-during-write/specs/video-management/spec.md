## MODIFIED Requirements

### Requirement: Authenticated users can upload videos for owned records
The system SHALL allow an authenticated active user to upload a video for an exercise record they own through `POST /api/video/records/{record_id}/video` using streamed writes to disk.

#### Scenario: Successful permanent video upload
- **WHEN** an authenticated active user uploads a supported video file within the size limit for a record they own
- **THEN** the system streams the upload to disk
- **THEN** the system persists `video_url` for the record
- **THEN** the system returns `video_deleted` as `false`

#### Scenario: Temporary upload mode
- **WHEN** an authenticated active user uploads a supported video file with `keep_video=false`
- **THEN** the system streams the upload to disk
- **THEN** the system deletes the uploaded file immediately
- **THEN** the system does not persist a `video_url`
- **THEN** the system returns `video_deleted` as `true`

#### Scenario: Unsupported video format
- **WHEN** an authenticated active user uploads a file whose extension is not one of `.mp4`, `.avi`, `.mov`, or `.mkv`
- **THEN** the system returns `400 Bad Request`

#### Scenario: Record not found for upload
- **WHEN** an authenticated active user uploads a video for a record they do not own or that does not exist
- **THEN** the system returns `404 Not Found`

#### Scenario: Upload replaces an existing stored video
- **WHEN** an authenticated active user uploads a new permanent video for a record that already references a stored owned video file
- **THEN** the system persists the new `video_url`
- **THEN** the system removes the previous owned file from disk

#### Scenario: Inactive account uploads video
- **WHEN** an authenticated inactive user uploads a video to `POST /api/video/records/{record_id}/video`
- **THEN** the system returns `403 Forbidden`

#### Scenario: Upload exceeds size limit during write
- **WHEN** an authenticated active user uploads a video whose streamed content exceeds 50 MB during persistence
- **THEN** the system returns `400 Bad Request`
- **THEN** the system removes any partial uploaded file

#### Scenario: Upload write fails mid-stream
- **WHEN** an upload write fails after writing part of the file to disk
- **THEN** the system removes any partial uploaded file
- **THEN** the system does not persist a new `video_url`
