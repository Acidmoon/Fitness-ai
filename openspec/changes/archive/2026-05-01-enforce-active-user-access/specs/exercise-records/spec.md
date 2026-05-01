## MODIFIED Requirements

### Requirement: Authenticated users can create exercise records
The system SHALL allow an authenticated active user to create an exercise record for an existing exercise.

#### Scenario: Successful record creation
- **WHEN** an authenticated active user submits valid record data with an existing `exercise_id` to `POST /api/exercise/records`
- **THEN** the system creates the record owned by the authenticated user
- **THEN** the system returns the created record

#### Scenario: Exercise does not exist
- **WHEN** an authenticated active user submits a record with a non-existent `exercise_id`
- **THEN** the system returns `404 Not Found`

#### Scenario: Authentication is required for record creation
- **WHEN** a request to `POST /api/exercise/records` does not include valid authentication
- **THEN** the system returns `401 Unauthorized`

#### Scenario: Inactive account creates record
- **WHEN** an authenticated inactive user submits `POST /api/exercise/records`
- **THEN** the system returns `403 Forbidden`

### Requirement: Users can list their own exercise records
The system SHALL return only the authenticated active user's exercise records from `GET /api/exercise/records`, with optional date range, exercise filter, and pagination parameters.

#### Scenario: List owned records
- **WHEN** an authenticated active user requests `GET /api/exercise/records`
- **THEN** the system returns only records owned by that user

#### Scenario: Date range filtering
- **WHEN** an authenticated active user requests `GET /api/exercise/records` with `start_date` and or `end_date`
- **THEN** the system filters records by `created_at` within the requested range

#### Scenario: Exercise filter
- **WHEN** an authenticated active user requests `GET /api/exercise/records` with `exercise_id`
- **THEN** the system returns only records matching that exercise identifier

#### Scenario: Inactive account lists records
- **WHEN** an authenticated inactive user requests `GET /api/exercise/records`
- **THEN** the system returns `403 Forbidden`

### Requirement: Users can view record details they own
The system SHALL return a record's details only when the authenticated active user owns that record.

#### Scenario: Successful detail fetch
- **WHEN** an authenticated active user requests `GET /api/exercise/records/{record_id}` for a record they own
- **THEN** the system returns the record details

#### Scenario: Record not found for detail fetch
- **WHEN** an authenticated active user requests a record identifier they do not own or that does not exist
- **THEN** the system returns `404 Not Found`

#### Scenario: Inactive account fetches detail
- **WHEN** an authenticated inactive user requests `GET /api/exercise/records/{record_id}`
- **THEN** the system returns `403 Forbidden`

### Requirement: Users can update records they own
The system SHALL allow an authenticated active user to update only the fields they provide for a record they own.

#### Scenario: Successful record update
- **WHEN** an authenticated active user submits a partial update to `PUT /api/exercise/records/{record_id}` for a record they own
- **THEN** the system updates only the provided fields
- **THEN** the system returns the updated record

#### Scenario: Record not found for update
- **WHEN** an authenticated active user requests to update a record they do not own or that does not exist
- **THEN** the system returns `404 Not Found`

#### Scenario: Inactive account updates record
- **WHEN** an authenticated inactive user submits `PUT /api/exercise/records/{record_id}`
- **THEN** the system returns `403 Forbidden`

### Requirement: Users can delete records they own
The system SHALL allow an authenticated active user to delete a single owned record or batch-delete multiple owned records.

#### Scenario: Successful single delete
- **WHEN** an authenticated active user sends `DELETE /api/exercise/records/{record_id}` for a record they own
- **THEN** the system deletes the record
- **THEN** the system returns a success message

#### Scenario: Single delete record not found
- **WHEN** an authenticated active user sends `DELETE /api/exercise/records/{record_id}` for a record they do not own or that does not exist
- **THEN** the system returns `404 Not Found`

#### Scenario: Successful batch delete
- **WHEN** an authenticated active user sends `DELETE /api/exercise/records` with `record_ids` that belong to them
- **THEN** the system deletes the owned matching records
- **THEN** the system returns the number of deleted records

#### Scenario: Batch delete ignores records owned by others
- **WHEN** an authenticated active user includes record identifiers they do not own in a batch delete request
- **THEN** the system deletes only the records they own

#### Scenario: Inactive account deletes records
- **WHEN** an authenticated inactive user submits single-delete or batch-delete requests for exercise records
- **THEN** the system returns `403 Forbidden`
