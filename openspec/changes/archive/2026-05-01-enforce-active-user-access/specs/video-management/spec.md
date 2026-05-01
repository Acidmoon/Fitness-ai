## MODIFIED Requirements

### Requirement: Authenticated users can upload videos for owned records
The system SHALL allow an authenticated active user to upload a video for an exercise record they own through `POST /api/video/records/{record_id}/video`.

#### Scenario: Successful permanent video upload
- **WHEN** an authenticated active user uploads a supported video file within the size limit for a record they own
- **THEN** the system stores the file
- **THEN** the system persists `video_url` for the record
- **THEN** the system returns `video_deleted` as `false`

#### Scenario: Temporary upload mode
- **WHEN** an authenticated active user uploads a supported video file with `keep_video=false`
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

### Requirement: Users can delete videos from owned records
The system SHALL allow an authenticated active user to delete the video associated with a record they own through `DELETE /api/video/records/{record_id}/video`.

#### Scenario: Successful video deletion
- **WHEN** an authenticated active user deletes a video for a record they own that has an associated `video_url`
- **THEN** the system removes the file if it exists
- **THEN** the system clears `video_url`
- **THEN** the system returns a success message

#### Scenario: No associated video
- **WHEN** an authenticated active user deletes video for a record they own that has no `video_url`
- **THEN** the system returns `404 Not Found`

#### Scenario: Record not found for deletion
- **WHEN** an authenticated active user deletes video for a record they do not own or that does not exist
- **THEN** the system returns `404 Not Found`

#### Scenario: Inactive account deletes video
- **WHEN** an authenticated inactive user submits `DELETE /api/video/records/{record_id}/video`
- **THEN** the system returns `403 Forbidden`

### Requirement: Video access is authenticated and ownership-scoped
The system SHALL require authentication and SHALL only serve video files associated with the authenticated active user's records from `GET /api/video/videos/{filename}`.

#### Scenario: Authentication is required for video access
- **WHEN** a request to `GET /api/video/videos/{filename}` does not include valid authentication
- **THEN** the system returns `401 Unauthorized`

#### Scenario: Accessing another user's video
- **WHEN** an authenticated active user requests a filename that is not associated with one of their records
- **THEN** the system returns `404 Not Found`

#### Scenario: Accessing a missing file
- **WHEN** an authenticated active user requests a filename associated with their record but the file does not exist on disk
- **THEN** the system returns `404 Not Found`

#### Scenario: Inactive account accesses video
- **WHEN** an authenticated inactive user requests `GET /api/video/videos/{filename}`
- **THEN** the system returns `403 Forbidden`
