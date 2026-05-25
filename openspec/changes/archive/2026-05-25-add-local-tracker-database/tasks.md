## 1. Dependencies and Configuration

- [x] 1.1 Install `expo-sqlite`, `drizzle-orm`, Drizzle migration tooling, and any required migration bundling dependency.
- [x] 1.2 Update Expo app Babel and Metro configuration so Drizzle migration files can be bundled.
- [x] 1.3 Add Drizzle configuration for SQLite with the Expo driver and app-local schema output paths.

## 2. Database Foundation

- [x] 2.1 Create the shared database module for opening the Expo SQLite database and initializing Drizzle.
- [x] 2.2 Define the initial Drizzle schema for persisted trackers.
- [x] 2.3 Generate and wire the initial migration for the tracker table.
- [x] 2.4 Add provider-level database initialization, loading, and error handling.

## 3. Tracker Persistence

- [x] 3.1 Add tracker data types for supported tracking methods and persisted tracker records.
- [x] 3.2 Implement a tracker repository for creating and reading tracker records.
- [x] 3.3 Ensure tracker creation assigns a stable id and created/updated timestamps.

## 4. Custom Goal Starter Flow

- [x] 4.1 Convert the custom goal starter inputs to a validated form with required goal name and tracking method.
- [x] 4.2 Add a submit action that creates a local tracker through the repository.
- [x] 4.3 Show validation feedback when the user attempts to submit without a name or tracking method.
- [x] 4.4 Add a post-create confirmation, reset, or navigation behavior consistent with the current screen flow.

## 5. Verification

- [x] 5.1 Add or update tests for database initialization and tracker repository behavior.
- [x] 5.2 Update add-tracker screen tests for successful creation and missing-field validation.
- [x] 5.3 Run typecheck, lint, tests, and Expo web startup verification; document any remaining failures.
