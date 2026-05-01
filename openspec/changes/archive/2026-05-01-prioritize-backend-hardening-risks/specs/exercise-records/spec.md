## MODIFIED Requirements

### Requirement: Authenticated users can create exercise records
The system SHALL allow an authenticated active user to create an exercise record for an existing exercise, and submitted metric and payload fields SHALL satisfy explicit validation bounds before persistence.

#### Scenario: Successful record creation
- **WHEN** an authenticated active user submits valid record data with an existing `exercise_id` to `POST /api/exercise/records`
- **THEN** the system creates the record owned by the authenticated user
- **THEN** the system returns the created record

#### Scenario: Exercise does not exist
- **WHEN** an authenticated active user submits a record with a non-existent `exercise_id`
- **THEN** the system returns `404 Not Found`

#### Scenario: Heart rate metrics are out of range
- **WHEN** an authenticated active user submits `heart_rate_avg` or `heart_rate_max` outside the accepted physiological range
- **THEN** the system returns `422 Unprocessable Content`

#### Scenario: Feedback payload is too large
- **WHEN** an authenticated active user submits `feedback` text that exceeds the configured maximum length
- **THEN** the system returns `422 Unprocessable Content`

#### Scenario: Keypoints payload is too large
- **WHEN** an authenticated active user submits `keypoints_data` whose serialized size exceeds the configured maximum
- **THEN** the system returns `422 Unprocessable Content`

#### Scenario: Authentication is required for record creation
- **WHEN** a request to `POST /api/exercise/records` does not include valid authentication
- **THEN** the system returns `401 Unauthorized`

#### Scenario: Inactive account creates record
- **WHEN** an authenticated inactive user submits `POST /api/exercise/records`
- **THEN** the system returns `403 Forbidden`

### Requirement: Users can list their own exercise records
The system SHALL return only the authenticated active user's exercise records from `GET /api/exercise/records`, with optional date range, exercise filter, and pagination parameters, and date filtering SHALL evaluate against normalized UTC timestamp storage rather than backend-specific local defaults.

#### Scenario: List owned records
- **WHEN** an authenticated active user requests `GET /api/exercise/records`
- **THEN** the system returns only records owned by that user

#### Scenario: Date range filtering
- **WHEN** an authenticated active user requests `GET /api/exercise/records` with `start_date` and or `end_date`
- **THEN** the system filters records by `created_at` within the requested range

#### Scenario: Date range filtering is timezone-stable
- **WHEN** equivalent records are queried through supported database backends using the same date filter inputs
- **THEN** the system returns the same inclusion and exclusion results for normalized UTC timestamp values

#### Scenario: Exercise filter
- **WHEN** an authenticated active user requests `GET /api/exercise/records` with `exercise_id`
- **THEN** the system returns only records matching that exercise identifier

#### Scenario: Inactive account lists records
- **WHEN** an authenticated inactive user requests `GET /api/exercise/records`
- **THEN** the system returns `403 Forbidden`

### Requirement: Users can update records they own
The system SHALL allow an authenticated active user to update only the fields they provide for a record they own, and updated metric and payload fields SHALL satisfy the same validation bounds required at creation time.

#### Scenario: Successful record update
- **WHEN** an authenticated active user submits a partial update to `PUT /api/exercise/records/{record_id}` for a record they own
- **THEN** the system updates only the provided fields
- **THEN** the system returns the updated record

#### Scenario: Record not found for update
- **WHEN** an authenticated active user requests to update a record they do not own or that does not exist
- **THEN** the system returns `404 Not Found`

#### Scenario: Invalid updated heart rate metric
- **WHEN** an authenticated active user submits an updated `heart_rate_avg` or `heart_rate_max` outside the accepted physiological range
- **THEN** the system returns `422 Unprocessable Content`

#### Scenario: Oversized updated payload field
- **WHEN** an authenticated active user submits updated `feedback` or `keypoints_data` content that exceeds the configured maximum
- **THEN** the system returns `422 Unprocessable Content`

#### Scenario: Inactive account updates record
- **WHEN** an authenticated inactive user submits `PUT /api/exercise/records/{record_id}`
- **THEN** the system returns `403 Forbidden`
