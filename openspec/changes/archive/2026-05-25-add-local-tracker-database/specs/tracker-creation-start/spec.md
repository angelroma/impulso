## ADDED Requirements

### Requirement: Custom Goal Starter Submission
The custom goal starter form SHALL allow the user to create a local tracker after providing a goal name and selecting a tracking method.

#### Scenario: Submit action is displayed after starter fields are ready
- **WHEN** the custom goal starter form has a goal name
- **AND** a tracking method is selected
- **THEN** a submit action for creating the tracker is available

#### Scenario: Tracker is created from valid starter fields
- **WHEN** the user submits the custom goal starter form with a valid goal name
- **AND** a tracking method is selected
- **THEN** the app creates a local tracker with that name and tracking method

#### Scenario: Missing goal name prevents tracker creation
- **WHEN** the user attempts to submit the custom goal starter form without a goal name
- **THEN** no local tracker is created
- **AND** the form communicates that the goal name is required

#### Scenario: Missing tracking method prevents tracker creation
- **WHEN** the user attempts to submit the custom goal starter form without selecting a tracking method
- **THEN** no local tracker is created
- **AND** the form communicates that the tracking method is required
