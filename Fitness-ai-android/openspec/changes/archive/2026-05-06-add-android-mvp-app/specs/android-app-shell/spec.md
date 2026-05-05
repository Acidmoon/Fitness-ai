## ADDED Requirements

### Requirement: Android app starts with mock authentication
The Android app SHALL allow an internal tester to enter the MVP without requiring a live backend.

#### Scenario: Mock login succeeds
- **WHEN** a tester submits the mock login flow with accepted local credentials
- **THEN** the app navigates to role selection or the main app shell

#### Scenario: Mock login fails
- **WHEN** a tester submits invalid local credentials
- **THEN** the app remains on the login screen and displays a recoverable error state

### Requirement: Android app supports role simulation
The Android app SHALL let internal testers simulate student, teacher, administrator, and personal fitness user roles.

#### Scenario: Tester selects a role
- **WHEN** a tester selects one of the supported roles
- **THEN** the app stores the selected role in session state
- **THEN** the main app shell reflects the selected role in profile or contextual display

### Requirement: Android app provides main navigation
The Android app SHALL provide Home, Training, Stats, and Profile sections from the authenticated app shell.

#### Scenario: Main tabs are available
- **WHEN** a tester reaches the authenticated app shell
- **THEN** the app shows navigation entries for Home, Training, Stats, and Profile

#### Scenario: Tester switches tabs
- **WHEN** a tester selects a different main navigation entry
- **THEN** the app displays the corresponding section without requiring re-authentication

### Requirement: Android app uses a consistent visual shell
The Android app SHALL use a modern minimalist line-based visual style across MVP screens.

#### Scenario: Shared styling is applied
- **WHEN** a tester navigates between MVP screens
- **THEN** typography, spacing, colors, icons, and dividers remain visually consistent
