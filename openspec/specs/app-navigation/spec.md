# app-navigation Specification

## Purpose
Defines the app-level drawer navigation shell, grouped drawer sections, submenu items, and route affordances.

## Requirements

### Requirement: Drawer App Shell
The app SHALL use a drawer-based navigation shell as the primary app-level navigation surface.

#### Scenario: App starts with drawer shell
- **WHEN** the Expo app starts
- **THEN** the root layout renders a drawer-capable navigation shell before rendering route content

#### Scenario: Existing home route remains available
- **WHEN** the user navigates to the app index route
- **THEN** the existing foundation home screen remains reachable from the drawer shell

### Requirement: Goal Settings Section
The drawer SHALL include a `Goal settings` section with an `Add tracker` submenu item.

#### Scenario: Goal settings section is displayed
- **WHEN** the drawer content is rendered
- **THEN** a `Goal settings` section label is visible

#### Scenario: Add tracker item is displayed
- **WHEN** the `Goal settings` section is visible
- **THEN** an `Add tracker` submenu item with a tracker-style icon is visible

#### Scenario: Add tracker item navigates
- **WHEN** the user activates the `Add tracker` submenu item
- **THEN** the app navigates to the add-tracker route

### Requirement: Options Section
The drawer SHALL include an `Options` section with a `Settings` submenu item.

#### Scenario: Options section is displayed
- **WHEN** the drawer content is rendered
- **THEN** an `Options` section label is visible

#### Scenario: Settings item is displayed
- **WHEN** the `Options` section is visible
- **THEN** a `Settings` submenu item with a settings icon is visible

#### Scenario: Settings item navigates
- **WHEN** the user activates the `Settings` submenu item
- **THEN** the app navigates to the settings route

### Requirement: Modular Drawer Presentation
The drawer presentation SHALL be implemented through reusable source modules instead of embedding grouped drawer UI directly in route files.

#### Scenario: Route files stay thin
- **WHEN** the drawer layout route is inspected
- **THEN** reusable drawer section and item presentation is delegated to modules under `src`
