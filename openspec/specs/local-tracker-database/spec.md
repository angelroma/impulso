# local-tracker-database Specification

## Purpose
Defines the local database foundation for persisted trackers, including initialization, Drizzle-managed schema migrations, persisted tracker records, and the repository boundary used by tracker features.

## Requirements

### Requirement: Local Database Initialization
The app SHALL initialize a local SQLite database before database-backed tracker features attempt to read or write tracker data.

#### Scenario: Database opens during startup
- **WHEN** the app provider layer starts
- **THEN** the local SQLite database is opened
- **AND** database-backed tracker features can access an initialized database client

#### Scenario: Migration failure is surfaced
- **WHEN** local database migrations fail during startup
- **THEN** the app surfaces a recoverable database initialization error instead of rendering database-backed tracker features as if persistence were available

### Requirement: Drizzle Managed Schema
The local database schema SHALL be defined through Drizzle and applied through bundled migrations.

#### Scenario: Initial tracker migration is applied
- **WHEN** the local database initializes for the first time
- **THEN** the migration system creates the table required for persisted tracker records

#### Scenario: Existing database is reused
- **WHEN** the app starts after the initial migration has already been applied
- **THEN** the migration system does not recreate or duplicate the existing tracker table

### Requirement: Persisted Tracker Records
The local database SHALL persist custom tracker records with an id, name, tracking method, creation timestamp, and update timestamp.

#### Scenario: Tracker record is saved
- **WHEN** a tracker is created with a valid name and supported tracking method
- **THEN** the local database stores a tracker record with a stable id
- **AND** the record includes the submitted name and tracking method
- **AND** the record includes created and updated timestamps

#### Scenario: Tracker records survive app restart
- **WHEN** a tracker has been saved locally
- **AND** the app is restarted
- **THEN** the saved tracker remains available from the local database

### Requirement: Tracker Repository Boundary
Tracker feature code SHALL access tracker persistence through a repository boundary instead of embedding SQL directly in screen components.

#### Scenario: Screen creates tracker through repository
- **WHEN** the custom goal starter submits a tracker
- **THEN** the screen delegates tracker persistence to tracker data access code
- **AND** the screen component does not construct raw SQL statements
