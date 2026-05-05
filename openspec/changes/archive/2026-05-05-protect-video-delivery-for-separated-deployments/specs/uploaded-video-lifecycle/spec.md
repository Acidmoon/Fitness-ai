## ADDED Requirements

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
