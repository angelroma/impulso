## ADDED Requirements

### Requirement: Habit Setup Entry
The app SHALL present a Habit setup form after the user selects the `Habit` tracking method from the custom goal starter form.

#### Scenario: Habit setup opens with starter name
- **WHEN** the user enters a goal or habit name in the custom goal starter form
- **AND** the user selects the `Habit` tracking method
- **THEN** the app shows the Habit setup form
- **AND** the Habit setup form title uses the entered goal or habit name

#### Scenario: Habit setup shows final action at the end
- **WHEN** the Habit setup form reaches the final wizard step
- **THEN** a bottom `Finish` action is available

### Requirement: Habit Setup Wizard
The Habit setup form SHALL guide the user through Habit configuration as a wizard instead of presenting every configuration field at once.

#### Scenario: Basics step is displayed first
- **WHEN** the Habit setup form is opened
- **THEN** the app shows the basics step
- **AND** the basics step includes goal, time period, and start date configuration

#### Scenario: Preferences step follows basics
- **WHEN** the user completes valid basics values
- **AND** the user continues from the basics step
- **THEN** the app shows the preferences step
- **AND** the preferences step includes schedule and logging configuration

#### Scenario: Basics step uses bottom next action
- **WHEN** the Habit setup form shows the basics step
- **THEN** a bottom `Next` action is available
- **AND** no tracker creation action is shown on the starter form

### Requirement: Habit Goal And Period
The Habit setup form SHALL allow the user to configure how many times the habit should be completed within a selected time period.

#### Scenario: Goal count is displayed
- **WHEN** the Habit setup form is shown
- **THEN** a `Goal` field is visible
- **AND** the goal can represent a number of times

#### Scenario: Time period choices are displayed
- **WHEN** the Habit setup form is shown
- **THEN** a `Time Period` field is visible
- **AND** the available choices include `Day`, `Week`, `Month`, `Quarter`, and `Year`

### Requirement: Habit Start Date
The Habit setup form SHALL allow the user to choose a start date for the habit using a platform-native date control where available.

#### Scenario: Start date is displayed
- **WHEN** the Habit setup form is shown
- **THEN** a `Start Date` field is visible
- **AND** the field has a selected date value

#### Scenario: Native date control is used
- **WHEN** the user configures the start date
- **THEN** the app presents a native date picker on native platforms
- **AND** the app presents a native browser date input on web

### Requirement: Habit Due Schedule
The Habit setup form SHALL allow the user to configure when the habit is due through a modal due schedule subflow.

#### Scenario: Due row opens schedule modal
- **WHEN** the Habit setup form is shown
- **AND** the user activates the `Due` row
- **THEN** the app shows due schedule settings for the habit in a modal surface

#### Scenario: Weekday frequency options are displayed
- **WHEN** the due schedule settings are shown
- **THEN** weekday frequency options for `Su`, `M`, `T`, `W`, `Th`, `F`, and `S` are visible

#### Scenario: Routine options are displayed
- **WHEN** the due schedule settings are shown
- **THEN** routine options for `Any Time`, `Morning`, `Afternoon`, and `Evening` are visible

#### Scenario: Due summary updates
- **WHEN** the user changes weekday frequency or routine in the due schedule settings
- **AND** the user returns to the Habit setup form
- **THEN** the `Due` row summarizes the selected due schedule

### Requirement: Habit Coming Soon Rows
The Habit setup form SHALL show placeholders for unsupported Reminders and Tags features.

#### Scenario: Reminders placeholder is displayed
- **WHEN** the Habit setup form is shown
- **THEN** a `Reminders` row is visible
- **AND** the row communicates `Soon`
- **AND** the row does not open reminder configuration

#### Scenario: Tags placeholder is displayed
- **WHEN** the Habit setup form is shown
- **THEN** a `Tags` row is visible
- **AND** the row communicates `Coming soon`
- **AND** the row does not open tag configuration

### Requirement: Habit Behavior Toggles
The Habit setup form SHALL provide toggles for Bad Habit, Set Goal Streak, and Log with Notes.

#### Scenario: Bad Habit toggle is displayed
- **WHEN** the Habit setup form is shown
- **THEN** a `Bad Habit` toggle is visible

#### Scenario: Set Goal Streak toggle is displayed
- **WHEN** the Habit setup form is shown
- **THEN** a `Set Goal Streak` toggle is visible

#### Scenario: Log with Notes toggle is displayed
- **WHEN** the Habit setup form is shown
- **THEN** a `Log with Notes` toggle is visible

### Requirement: Habit Help Text
The Habit setup form SHALL show contextual help text for Bad Habit, Set Goal Streak, and Log with Notes.

#### Scenario: Bad Habit help is displayed
- **WHEN** the user activates help for `Bad Habit`
- **THEN** the app displays `Turning this ON reverses colors for logs and charts for habits you want to break, setting your goal as the limit (e.g. Do the habit 5 times per week, or less).`

#### Scenario: Set Goal Streak help is displayed
- **WHEN** the user activates help for `Set Goal Streak`
- **THEN** the app displays `Turning this ON lets you set a goal for your streak to stay motivated while you build the habit.`

#### Scenario: Log with Notes help is displayed
- **WHEN** the user activates help for `Log with Notes`
- **THEN** the app displays `Automatically show the Notes field when logging so you don't have to swipe left to add a note after.`

### Requirement: Habit Finish
The Habit setup form SHALL create a local Habit tracker when the user finishes valid setup.

#### Scenario: Habit tracker is created from setup
- **WHEN** the user completes the Habit setup form with valid values
- **AND** the user activates `Finish`
- **THEN** the app creates a local tracker with method `habit`
- **AND** the app persists the Habit setup values for that tracker

#### Scenario: Invalid habit setup prevents creation
- **WHEN** the user activates `Finish` with invalid Habit setup values
- **THEN** no local tracker is created
- **AND** the form communicates what must be corrected
