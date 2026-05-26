# tracker-creation-start Specification

## Purpose
Defines the first step of tracker creation, including the add-tracker entry option, custom goal starter form, and initial tracking method choices.
## Requirements
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
The custom goal starter form SHALL present the initial tracking method choices and continue into Habit setup when the user selects the Habit method.

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

#### Scenario: Habit selection opens Habit setup
- **WHEN** the user has entered a goal or habit name
- **AND** the user selects the `Habit` tracking method option
- **THEN** the app opens the Habit setup form
- **AND** no tracker is created before the Habit setup form is finished

#### Scenario: Non-Habit method selection remains in starter flow
- **WHEN** the user selects the `Average`, `Project`, or `Target` tracking method option
- **THEN** the app remains on the custom goal starter form
- **AND** no tracker is created
- **AND** the app communicates that setup for the selected method is coming soon

### Requirement: Custom Goal Starter Submission
The custom goal starter form SHALL NOT create a local tracker directly; tracker creation SHALL happen at the end of a method-specific setup flow.

#### Scenario: Starter create action is not displayed
- **WHEN** the custom goal starter form is shown
- **THEN** no starter-level `Create tracker` action is visible

#### Scenario: Non-Habit starter selection does not create tracker
- **WHEN** the user selects `Average`, `Project`, or `Target` from the custom goal starter form
- **THEN** no local tracker is created from the starter form

#### Scenario: Habit starter selection does not submit directly
- **WHEN** the user selects `Habit` from the custom goal starter form
- **THEN** the app opens Habit setup instead of creating a tracker from the starter form

#### Scenario: Missing goal name prevents tracker creation
- **WHEN** the user attempts to submit the custom goal starter form without a goal name
- **THEN** no local tracker is created
- **AND** the form communicates that the goal name is required

#### Scenario: Missing tracking method has no starter submit state
- **WHEN** the user has not selected a tracking method
- **THEN** no local tracker is created
- **AND** no starter-level submit action is visible

