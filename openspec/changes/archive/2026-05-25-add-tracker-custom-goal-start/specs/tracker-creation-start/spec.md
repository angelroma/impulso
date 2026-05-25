## ADDED Requirements

### Requirement: Add Tracker Entry Option
The add-tracker screen SHALL present a selectable `Custom goal` option as the starting point for creating a custom tracker.

#### Scenario: Custom goal option is displayed
- **WHEN** the user opens the add-tracker screen
- **THEN** a `Custom goal` option is visible
- **AND** supporting text indicates it can be used for a habit, number, or project

#### Scenario: Custom goal option opens starter form
- **WHEN** the user activates the `Custom goal` option
- **THEN** the app shows the custom goal starter form

### Requirement: Custom Goal Starter Form
The custom goal starter form SHALL ask the user to name their goal or habit and choose how it will be tracked.

#### Scenario: Starter input is displayed
- **WHEN** the custom goal starter form is shown
- **THEN** an input labeled `Name your goal or habit` is visible

#### Scenario: Tracking question is displayed
- **WHEN** the custom goal starter form is shown
- **THEN** the question `How do you want to track this?` is visible

### Requirement: Tracking Method Choices
The custom goal starter form SHALL present the initial tracking method choices without continuing into type-specific setup workflows.

#### Scenario: Habit method is displayed
- **WHEN** the custom goal starter form is shown
- **THEN** a `Habit` method option with `repeating action` supporting text is visible

#### Scenario: Average method is displayed
- **WHEN** the custom goal starter form is shown
- **THEN** an `Average` method option with `repeating number` supporting text is visible

#### Scenario: Project method is displayed
- **WHEN** the custom goal starter form is shown
- **THEN** a `Project` method option with `actions by date` supporting text is visible

#### Scenario: Target method is displayed
- **WHEN** the custom goal starter form is shown
- **THEN** a `Target` method option with `number by date` supporting text is visible

#### Scenario: Method selection remains in starter flow
- **WHEN** the user selects any tracking method option
- **THEN** the app remains on the custom goal starter form
- **AND** no tracker is created
