## Why

Tracker setup currently stops before persistence, so users cannot keep the goals they begin creating. A local database gives Impulso an offline-first foundation for saved trackers, history, and future analytics before any backend is introduced.

## What Changes

- Add a local SQLite database layer backed by Expo SQLite.
- Include Drizzle ORM for typed schema definitions, typed queries, and migration management.
- Add an initial persisted tracker model for custom goals with name, tracking method, and timestamps.
- Update the custom goal starter flow so a valid name and selected tracking method can create a local tracker.
- Keep persistence local-only; no sync, auth, or remote API behavior is added in this change.

## Capabilities

### New Capabilities
- `local-tracker-database`: Defines the local database foundation, migrations, and persisted tracker record behavior.

### Modified Capabilities
- `tracker-creation-start`: Changes the starter flow from method selection only to creating a local tracker after required starter fields are submitted.

## Impact

- Adds app dependencies for `expo-sqlite`, `drizzle-orm`, and Drizzle migration tooling.
- Adds shared database infrastructure under the Expo app source tree.
- Adds tracker data access code owned by the tracker feature.
- Updates the add-tracker screen and tests to cover local tracker creation behavior.
