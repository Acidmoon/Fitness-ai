# User Account Specification

## Purpose

Define the current behavior for authenticated user profile access, profile updates, password changes, and account deletion.

## Requirements

### Requirement: Authenticated users can view their profile
The system SHALL return the current authenticated user's profile from `GET /api/user/profile`.

#### Scenario: Successful profile fetch
- **WHEN** an authenticated active user requests `GET /api/user/profile`
- **THEN** the system returns the user's profile fields including `username`, `email`, and timestamps

#### Scenario: Authentication is required for profile fetch
- **WHEN** a request to `GET /api/user/profile` does not include valid authentication
- **THEN** the system returns `401 Unauthorized`

### Requirement: Active users can update profile fields
The system SHALL allow an authenticated active user to update their username and email through `PUT /api/user/profile`.

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

### Requirement: Active users can change password
The system SHALL allow an authenticated active user to change their password through `PUT /api/user/password`.

#### Scenario: Successful password change
- **WHEN** an authenticated active user submits the correct old password and a valid new password
- **THEN** the system updates the stored password hash
- **THEN** the system returns a success message

#### Scenario: Wrong old password
- **WHEN** an authenticated active user submits an incorrect old password
- **THEN** the system returns `400 Bad Request`

#### Scenario: Weak new password
- **WHEN** an authenticated active user submits a new password that fails schema validation
- **THEN** the system returns `422 Unprocessable Content`

### Requirement: Users can delete their account with password confirmation
The system SHALL allow an authenticated user to delete their account through `DELETE /api/user/account` when the provided password is correct.

#### Scenario: Successful account deletion
- **WHEN** an authenticated user submits the correct password to `DELETE /api/user/account`
- **THEN** the system deletes the user account
- **THEN** the system returns a success message

#### Scenario: Wrong password on account deletion
- **WHEN** an authenticated user submits an incorrect password to `DELETE /api/user/account`
- **THEN** the system returns `400 Bad Request`

#### Scenario: Authentication is required for account deletion
- **WHEN** a request to `DELETE /api/user/account` does not include valid authentication
- **THEN** the system returns `401 Unauthorized`
