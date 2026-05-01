## MODIFIED Requirements

### Requirement: Authenticated users can upload videos for owned records
The system SHALL allow an authenticated active user to upload a video for an exercise record they own through `POST /api/video/records/{record_id}/video` using streamed writes to disk, and replacement cleanup SHALL be observable when an old stored file cannot be removed after the new reference is persisted.

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

#### Scenario: Temporary upload preserves existing stored video
- **WHEN** an authenticated active user uploads a supported video file with `keep_video=false` for a record that already references a stored owned video
- **THEN** the system deletes only the newly uploaded temporary file
- **THEN** the system keeps the existing stored `video_url` on the record
- **THEN** the system keeps the previously stored owned file on disk

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

#### Scenario: Replacement cleanup failure after commit
- **WHEN** an authenticated active user successfully persists a new permanent video for a record and removal of the previous owned file fails afterward
- **THEN** the new `video_url` remains stored on the record
- **THEN** the system records the cleanup failure for operational follow-up

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

### Requirement: Users can delete videos from owned records
The system SHALL allow an authenticated active user to delete the video associated with a record they own through `DELETE /api/video/records/{record_id}/video`, and the database reference SHALL only be cleared when file cleanup is either complete, safely skipped, or already unnecessary.

#### Scenario: Successful video deletion
- **WHEN** an authenticated active user deletes a video for a record they own that has an associated `video_url`
- **THEN** the system removes the file if it exists
- **THEN** the system clears `video_url`
- **THEN** the system returns a success message

#### Scenario: Missing owned file during deletion
- **WHEN** an authenticated active user deletes a video for a record they own whose `video_url` points to a missing file inside the upload directory
- **THEN** the system clears `video_url`
- **THEN** the system returns a success message

#### Scenario: No associated video
- **WHEN** an authenticated active user deletes video for a record they own that has no `video_url`
- **THEN** the system returns `404 Not Found`

#### Scenario: Record not found for deletion
- **WHEN** an authenticated active user deletes video for a record they do not own or that does not exist
- **THEN** the system returns `404 Not Found`

#### Scenario: File deletion fails
- **WHEN** an authenticated active user deletes a video for a record they own and filesystem deletion of an owned stored file raises an error
- **THEN** the system returns `500 Internal Server Error`
- **THEN** the system keeps the existing `video_url` on the record

#### Scenario: Inactive account deletes video
- **WHEN** an authenticated inactive user submits `DELETE /api/video/records/{record_id}/video`
- **THEN** the system returns `403 Forbidden`

### Requirement: Record and account cleanup remove owned stored video files
The system SHALL remove owned stored video files when deleting exercise records or deleting a user account, and it SHALL abort the database mutation when owned-file deletion fails with a filesystem error.

#### Scenario: Single record deletion with stored video
- **WHEN** an authenticated user deletes a record that references a stored owned video file
- **THEN** the system deletes the record from the database
- **THEN** the system removes the associated file from disk if it exists

#### Scenario: Batch deletion includes records with stored videos
- **WHEN** an authenticated user batch-deletes records they own and one or more records reference stored owned video files
- **THEN** the system deletes only the owned records requested
- **THEN** the system removes the associated files for the deleted owned records from disk if they exist

#### Scenario: Account deletion with stored videos
- **WHEN** an authenticated user deletes their account and their exercise records reference stored owned video files
- **THEN** the system removes the associated files from disk if they exist
- **THEN** the system deletes the user account and related records from the database

#### Scenario: Owned file deletion fails during record cleanup
- **WHEN** single-delete, batch-delete, or account deletion encounters a filesystem error while removing an owned stored video file
- **THEN** the system returns `500 Internal Server Error`
- **THEN** the system does not commit the related database deletion

#### Scenario: Stored path is invalid or escapes upload directory
- **WHEN** cleanup is triggered for a record whose stored `video_url` does not resolve to an owned file inside the upload directory
- **THEN** the system skips file deletion for that path
- **THEN** the system continues the database operation without deleting files outside the upload directory
