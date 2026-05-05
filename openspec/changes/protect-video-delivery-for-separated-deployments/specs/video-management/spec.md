## ADDED Requirements

### Requirement: Video URLs remain backend-mediated
The system SHALL return video references that require backend API resolution instead of exposing local filesystem paths or unauthenticated public storage URLs.

#### Scenario: Upload returns API-mediated reference
- **WHEN** an authenticated active user uploads a permanent video successfully
- **THEN** the response contains a `video_url` value that can only be fetched through an authenticated backend video API flow

#### Scenario: Frontend previews stored video
- **WHEN** the separated frontend previews a stored video
- **THEN** it requests the video through the backend API with the user's bearer token
- **THEN** the backend verifies ownership before returning video bytes

### Requirement: Video storage backend is configurable
The system SHALL isolate video persistence behind configurable storage behavior so development can use local disk and production can use shared storage.

#### Scenario: Local filesystem storage
- **WHEN** video storage is configured for local filesystem mode
- **THEN** uploads, reads, existence checks, and deletes operate under the configured upload directory

#### Scenario: Production shared storage
- **WHEN** the API runs in a multi-instance production deployment
- **THEN** video storage is configured so every API instance can read and delete videos referenced by the database

#### Scenario: Storage backend unavailable
- **WHEN** the configured video storage backend cannot persist or read a requested video
- **THEN** the API returns a controlled error without exposing storage credentials or internal paths

### Requirement: Public static video mounting is not required
The system SHALL NOT require the upload directory to be mounted as unauthenticated public static content for separated frontend access.

#### Scenario: Direct public upload path
- **WHEN** a browser attempts to fetch an uploaded video without using the authenticated backend video endpoint
- **THEN** the system does not rely on that path for supported video preview behavior
