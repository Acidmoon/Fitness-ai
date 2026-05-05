## ADDED Requirements

### Requirement: Android app shows a home overview
The Android app SHALL show a Home section summarizing MVP training activity.

#### Scenario: Home data is available
- **WHEN** a tester opens the Home section
- **THEN** the app displays summary metrics and recent training records based on local MVP data

#### Scenario: No activity exists
- **WHEN** a tester opens the Home section before creating records
- **THEN** the app displays an empty or zero-data overview state

### Requirement: Android app shows basic statistics
The Android app SHALL show a Stats section derived from local MVP training records.

#### Scenario: Records exist
- **WHEN** a tester opens the Stats section and local records exist
- **THEN** the app displays aggregate metrics such as total records, total count or duration, and best score when available

#### Scenario: No records exist
- **WHEN** a tester opens the Stats section and no local records exist
- **THEN** the app displays a zero-data statistics state

### Requirement: Android app shows profile information
The Android app SHALL show basic mock user and role information in the Profile section.

#### Scenario: Profile is opened
- **WHEN** a tester opens the Profile section after mock login
- **THEN** the app displays the mock user identity and selected role

### Requirement: Android app supports logout
The Android app SHALL allow a tester to leave the authenticated MVP session.

#### Scenario: Tester logs out
- **WHEN** a tester confirms logout from the Profile section
- **THEN** the app clears the current mock session
- **THEN** the app returns to the login flow
