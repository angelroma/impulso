## MODIFIED Requirements

### Requirement: Goal Settings Section
The drawer SHALL include a `Goal settings` section with an `Add tracker` submenu item that opens the tracker creation starting point.

#### Scenario: Goal settings section is displayed
- **WHEN** the drawer content is rendered
- **THEN** a `Goal settings` section label is visible

#### Scenario: Add tracker item is displayed
- **WHEN** the `Goal settings` section is visible
- **THEN** an `Add tracker` submenu item with a tracker-style icon is visible

#### Scenario: Add tracker item navigates
- **WHEN** the user activates the `Add tracker` submenu item
- **THEN** the app navigates to the add-tracker route
- **AND** the route presents the tracker creation starting point
