## ADDED Requirements

### Requirement: Persisted Habit Setup Records
The local database SHALL persist Habit-specific setup values for trackers whose tracking method is `habit`.

#### Scenario: Habit setup record is saved
- **WHEN** a Habit tracker is created from the Habit setup form
- **THEN** the local database stores the Habit setup values associated with the created tracker id
- **AND** the stored values include goal count, time period, start date, selected weekdays, routine, Bad Habit setting, Set Goal Streak setting, and Log with Notes setting

#### Scenario: Habit setup records survive app restart
- **WHEN** a Habit tracker and its Habit setup values have been saved locally
- **AND** the app is restarted
- **THEN** the saved Habit setup values remain available from the local database

#### Scenario: Habit setup is accessed through repository boundary
- **WHEN** the Habit setup form creates a tracker
- **THEN** the screen delegates tracker and Habit setup persistence to tracker data access code
- **AND** the screen component does not construct raw SQL statements
