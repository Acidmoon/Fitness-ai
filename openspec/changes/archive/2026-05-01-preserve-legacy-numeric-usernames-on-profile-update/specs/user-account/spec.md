## MODIFIED Requirements

### Requirement: Active users can update profile fields
The system SHALL allow an authenticated active user to update their username and email through `PUT /api/user/profile`, and updated usernames SHALL not be only digits unless the submitted username exactly matches the user's existing legacy username.

#### Scenario: Successful profile update
- **WHEN** an authenticated active user submits a unique valid username and or email
- **THEN** the system persists the new values
- **THEN** the system returns the updated profile

#### Scenario: Username is already used by another user
- **WHEN** an authenticated active user submits a username that belongs to a different user
- **THEN** the system returns `400 Bad Request`

#### Scenario: Email is already used by another user
- **WHEN** an authenticated active user submits an email that belongs to a different user
- **THEN** the system returns `400 Bad Request`

#### Scenario: Invalid email format on update
- **WHEN** an authenticated active user submits an invalid email format
- **THEN** the system returns `422 Unprocessable Content`

#### Scenario: Inactive account updates profile
- **WHEN** an authenticated inactive user submits `PUT /api/user/profile`
- **THEN** the system returns `403 Forbidden`

#### Scenario: Numeric-only username update
- **WHEN** an authenticated active user submits a new username containing only digits
- **THEN** the system returns `422 Unprocessable Content`

#### Scenario: Legacy numeric username remains unchanged
- **WHEN** an authenticated active user whose current username is numeric-only submits that same username unchanged in a profile update
- **THEN** the system accepts the update request
- **THEN** the user's username remains unchanged
