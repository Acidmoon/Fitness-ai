# Uploaded Video Lifecycle Specification

## Purpose

Define the current lifecycle guarantees for uploaded exercise videos when records are updated or removed.

## Requirements

### Requirement: Replacing a stored video removes the previous owned file
The system SHALL remove an exercise record's previously stored video file when the same record receives a new permanent uploaded video.

#### Scenario: Upload replaces an existing stored video
- **WHEN** an authenticated user uploads a new permanent video for a record that already references a stored owned video file
- **THEN** the system persists the new `video_url`
- **THEN** the system removes the previous owned file from disk

### Requirement: Record deletion removes associated stored video files
The system SHALL remove owned stored video files when deleting exercise records through single-delete or batch-delete flows.

#### Scenario: Single record deletion with stored video
- **WHEN** an authenticated user deletes a record that references a stored owned video file
- **THEN** the system deletes the record from the database
- **THEN** the system removes the associated file from disk if it exists

#### Scenario: Batch deletion includes records with stored videos
- **WHEN** an authenticated user batch-deletes records they own and one or more records reference stored owned video files
- **THEN** the system deletes only the owned records requested
- **THEN** the system removes the associated files for the deleted owned records from disk if they exist

### Requirement: Account deletion removes stored video files for owned records
The system SHALL remove owned stored video files before deleting a user account and its related exercise records.

#### Scenario: Account deletion with stored videos
- **WHEN** an authenticated user deletes their account and their exercise records reference stored owned video files
- **THEN** the system removes the associated files from disk if they exist
- **THEN** the system deletes the user account and related records from the database

### Requirement: Video cleanup guards against invalid paths
The system SHALL only delete files that resolve inside the configured upload directory.

#### Scenario: Stored path is invalid or escapes upload directory
- **WHEN** cleanup is triggered for a record whose stored `video_url` does not resolve to an owned file inside the upload directory
- **THEN** the system skips file deletion for that path
- **THEN** the system continues the database operation without deleting files outside the upload directory

### Requirement: Video lifecycle operations use the configured storage backend
The system SHALL perform upload replacement, explicit video deletion, record deletion cleanup, and account deletion cleanup through the configured video storage backend.

#### Scenario: Replacement cleanup uses storage backend
- **WHEN** an uploaded permanent video replaces an existing stored video
- **THEN** the system removes the previous owned video through the configured storage backend

#### Scenario: Record cleanup uses storage backend
- **WHEN** an exercise record with a stored video is deleted
- **THEN** the system removes the associated owned video through the configured storage backend before committing the record deletion

#### Scenario: Account cleanup uses storage backend
- **WHEN** a user account with stored videos is deleted
- **THEN** the system removes associated owned videos through the configured storage backend before committing account deletion

### Requirement: Storage cleanup failures preserve database consistency
The system SHALL avoid committing database mutations that would orphan undeleted owned videos when configured storage deletion fails.

#### Scenario: Storage deletion failure
- **WHEN** deletion of an owned stored video fails during record or account cleanup
- **THEN** the system returns a controlled server error
- **THEN** the related database deletion is not committed
