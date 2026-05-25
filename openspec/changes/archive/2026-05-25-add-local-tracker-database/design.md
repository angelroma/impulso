## Context

Impulso is an Expo SDK 54 app with Expo Router, Tamagui, React Hook Form, Zod, and feature-owned screen modules. The tracker creation flow currently collects the beginning of a custom goal but does not persist anything. There is no shared database layer, no migration runner, and no tracker data access boundary.

The local database should support mobile-first offline use and stay compatible with Expo development workflows. Expo SQLite is the native persistence layer, and Drizzle adds typed schema, query, and migration structure without introducing a backend service.

## Goals / Non-Goals

**Goals:**
- Add a local SQLite database opened during app startup.
- Use Drizzle ORM for the tracker schema, typed queries, and migrations.
- Provide a small tracker repository owned by the tracker feature.
- Persist custom goal starter submissions with a stable id, name, method, and timestamps.
- Keep route files thin and compose persistence through providers or feature hooks.

**Non-Goals:**
- No remote sync, cloud backup, authentication, or multi-device conflict handling.
- No tracker activity logs, statistics, reminders, or schedule tables yet.
- No import/export workflow.
- No encrypted database requirement in this iteration.

## Decisions

### Use Expo SQLite as the database engine

Expo SQLite is the official local relational database option for this Expo app and persists data across app restarts. It also works with the Expo ecosystem without requiring a separate native database service.

Alternatives considered:
- AsyncStorage: simpler, but weak for relational tracker data, migrations, filtering, and future history tables.
- Realm or WatermelonDB: powerful, but heavier than needed for the first local persistence layer.
- Remote API: out of scope because the app needs local-first behavior first.

### Use Drizzle for schema, queries, and migrations

Drizzle keeps the schema close to TypeScript and gives the app typed access to tables while still exposing the underlying SQLite model. Drizzle Kit can generate migrations that are bundled into the Expo app.

Alternatives considered:
- Raw SQL only: least dependency weight, but easier to drift as tracker tables multiply.
- Prisma: useful server-side, but heavier and less natural for this Expo SQLite use case.
- TypeORM: broad ORM surface area with more runtime machinery than this app needs.

### Keep database infrastructure shared and repositories feature-owned

The shared database layer should open the database, initialize Drizzle, and run migrations. Tracker-specific CRUD should live in the tracker feature so domain behavior remains near the screens and tests that use it.

Proposed structure:

```text
src/shared/database/
  database.ts
  migrations.ts
  schema.ts

src/features/tracker/data/
  trackerRepository.ts
  trackerTypes.ts
```

The provider layer should initialize the database before screens depend on it. If migration status is asynchronous, the app should render a minimal loading state until migrations are complete and a clear error state if migration fails.

### Start with a minimal tracker table

The first table should capture only what the current custom goal starter can truthfully provide:

```text
trackers
  id TEXT PRIMARY KEY
  name TEXT NOT NULL
  method TEXT NOT NULL
  created_at TEXT NOT NULL
  updated_at TEXT NOT NULL
```

The `method` value should be constrained in TypeScript to the existing starter choices: `habit`, `average`, `project`, and `target`. The app can add method-specific configuration tables later.

## Risks / Trade-offs

- Migration bundling configuration can break Metro if SQL files are not included correctly → Add the required Babel/Metro configuration with focused tests or startup verification.
- Database initialization can make screens harder to test → Provide a test-friendly repository boundary or mockable provider.
- Drizzle adds tooling before the schema is complex → Accept the small up-front cost because trackers will likely need logs, stats, and schedule tables soon.
- Web behavior may differ from native SQLite behavior → Verify Expo web startup and keep database access behind the shared layer.

## Migration Plan

1. Install Expo SQLite and Drizzle dependencies through Expo/NPM-compatible commands.
2. Add Drizzle schema and generate the initial migration.
3. Configure migration bundling for the Expo app.
4. Initialize the database in the app provider layer.
5. Add tracker repository functions for creating and reading trackers.
6. Wire the custom goal starter submit action to create a tracker.
7. Verify typecheck, lint, tests, and Expo web startup.

Rollback is straightforward before release: remove the provider wiring and database dependencies. After release, rollback should leave existing local database files untouched and avoid destructive migrations.

## Open Questions

- Should the post-create experience remain on the starter screen with confirmation, reset the form, or navigate to a future tracker detail screen?
- Should tracker ids be generated with `crypto.randomUUID()` where available, or use a small cross-platform id helper?
