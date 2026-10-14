# Database schema and migration workflow

Impulso uses Supabase declarative schemas with the `pg-delta` engine. All database files stay under `apps/supabase`; all identifiers, comments and migration names use English.

## Source definitions and change history

`apps/supabase/schemas/` describes the complete desired application schema. Edit these files when changing a table, index, constraint, permission or other application database object.

`apps/supabase/migrations/` is the ordered history used to build or upgrade a database. Generate and review a new migration after editing the declarative files. Applying migrations does not automatically read changed files from `schemas/`.

The initial migration, `20261013010257_create_impulso_database.sql`, is preserved unchanged as history. The forward migration, `20261013013807_remove_impulso_database_functions.sql`, drops all eight custom SQL functions and 93 application triggers. It does not drop tables, change native constraints, remove indexes or delete stored records. After the complete history is applied, the declarative files describe six application schemas, 23 tables, 105 indexes, RLS and privileges, with no custom SQL functions or application triggers.

Business rules will be implemented in Supabase Edge Functions. The removal migration does not implement that backend. Client access remains denied until the Edge Function operations and authorization are implemented. Supabase-managed Auth, Storage, PostgreSQL built-ins and native constraint triggers are outside this removal.

`20261013024746_create_impulso_backend_role.sql` adds the limited server role and its application grants. Its anonymous `DO` block only creates infrastructure if missing; it defines no stored routine or business logic. Login credentials are provisioned separately by `supabase:configure-backend`. The role may read/insert the six onboarding Core tables, insert audit events, manage receipts and read purge state. It has no Finance/Health privileges, deletion privileges or database administration rights. Timestamp-only UPDATE grants permit native row locks.

`20261013224249_create_impulso_auth_access_views.sql` adds four column-only projections in the unexposed `private` schema: `auth_users`, `auth_sessions`, `oauth_clients` and `oauth_consents`. They expose the account/session identifiers and current OAuth grant state required by TypeScript authorization. The views are owned by `postgres` and use owner permission checks (`security_invoker = false`), with explicit column grants for `impulso_backend` and no ordinary-client access. Timestamp-only UPDATE grants on the account/session views preserve row locks on their underlying Auth rows. This uses native [view permissions](https://www.postgresql.org/docs/17/sql-createview.html) and [locking behavior](https://www.postgresql.org/docs/17/sql-select.html), and leaves the managed Auth objects and their ACLs unchanged. New environments need no direct backend grants on Auth tables. An existing environment with legacy direct grants requires its Auth owner to remove those grants separately.

Roles are cluster infrastructure, declared in `schemas/_cluster/roles.sql` with matching application grants in `schemas/access.sql`. The manifest `schemas/.pgdelta-export.json` selects cluster scope, the Supabase profile and secret redaction, and loads the role before its grants. The pinned Supabase CLI uses isolated shadow PostgreSQL instances with lineage checks for this scope; ordinary colocated database shadows must not manage global roles. Login passwords remain environment configuration, excluded from declarative SQL.

## File layout

```text
apps/supabase/
  config.toml
  schemas/
    .pgdelta-export.json
    _cluster/
      roles.sql
    access.sql
    core/
      schema.sql
      tables/
        workspaces.sql
        people.sql
        ...
    finance/
      schema.sql
      tables/
        books.sql
        accounts.sql
        transactions.sql
        ...
    health/
      schema.sql
      tables/
        ...
    api/
      schema.sql
    audit/
      schema.sql
      tables/
        events.sql
    private/
      schema.sql
      tables/
        operation_receipts.sql
        purge_requests.sql
      views/
        auth_users.sql
        auth_sessions.sql
        oauth_clients.sql
        oauth_consents.sql
  migrations/
    20261013010257_create_impulso_database.sql
    20261013013807_remove_impulso_database_functions.sql
    20261013024746_create_impulso_backend_role.sql
    20261013224249_create_impulso_auth_access_views.sql
  tests/
    database/
      impulso_schema.test.sql
```

Each table file keeps its columns, relationships, constraints, indexes, RLS and table privileges together. `access.sql` contains shared schema access and default privileges. `api` has no application operations. The Edge Function foundation lives in `apps/supabase/functions/`; `impulso-api` hosts MCP tools that reuse the same TypeScript onboarding service, and `impulso-auth` serves sign-in and consent. Moving authorization into the Edge Runtime changes local Auth callback configuration and browser asset delivery, without adding application tables, migrations or SQL routines. See [edge-functions.md](edge-functions.md) for the implemented endpoints and validation results.

The removed behavior includes automatic actor and timestamp updates, version increments, immutable fields, active-parent checks, owner-existence checks, opening-balance locking, currency-specific decimal precision and purge state workflows. Implement these checks in Edge Functions using validated user identity, authorized scopes and SQL transactions with consistent locks. A partial unique index still limits a scope to at most one active owner, but the backend must ensure that one exists. Ordinary client roles remain unable to write tables while these operations are pending.

`config.toml` enables `experimental.pgdelta` and sets `declarative_schema_path = "./schemas"`. The legacy `db.migrations.schema_paths` stays empty. The engine orders dependencies rather than relying on alphabetical filenames; for example, `core.ownership_transfer_requests` references `finance.books`.

Run `npx nx run supabase:verify-schema` to compare the current tree against migration history without applying changes. An unchanged tree should report no changes; if it finds differences, the CLI writes a proposed `verify_impulso_schema` migration for review. Never apply a verification proposal automatically.

## Edit, generate, review and apply

Run commands from the repository root using the pinned Supabase CLI version. Docker is needed for the isolated shadow database used by schema comparison.

1. Edit the relevant files in `apps/supabase/schemas/`. Keep the complete tree present; a removed definition can produce a destructive migration. Do not add a second definition of the same object.
2. Generate a migration without applying it. Choose a descriptive name for the actual change; the CLI assigns its timestamp. For example, after editing the financial definitions:

   ```powershell
   npx supabase@2.120.0 db schema declarative sync --file update_finance_tables --no-apply --workdir apps
   ```

   The comparison uses migration history as its baseline, not the current state of the running application database. `--no-apply` writes migration files only; the comparison can start a temporary shadow database. Do not add `--apply` or `--yes` when preparing files only. On an unchanged tree, there should be no schema changes to migrate.
3. Review the generated SQL, especially removals, relationships, RLS, grants and execution permissions. Generated migrations are proposals that require review. Keep related changes in the same migration when they must succeed together.
4. Apply reviewed, pending migrations to the local database and run the database tests through Nx:

   ```powershell
   npx nx run supabase:start-local
   npx nx run supabase:migrate-local
   npx nx run supabase:test-db
   ```

   The `Impulso` local stack is already running, and all three current migrations are applied. `start-local` starts or reuses that stack. `migrate-local` applies only pending migrations without resetting the database; the reviewed migration SQL determines any changes to existing data. `test-db` runs the pgTAP suite with fixture changes reverted by its transaction. These targets use the pinned Supabase CLI and do not deploy to the hosted project.
5. Commit the changed declarative files, the generated migration and any corresponding tests together. Deploy to the hosted project only as a separate authorized step.

## History and platform boundaries

- Preserve migrations that were applied or shared. Correct them with new forward migrations rather than renaming or rewriting their history.
- Make database structure changes through the declarative files and reviewed migrations. A manual Studio change is not captured by comparison against migration history.
- Keep application schemas complete. Supabase-managed Auth and Storage objects are not copied into this tree.
- Declarative schema files contain definitions, not `INSERT`, `UPDATE` or `DELETE` statements. Data transformations and future Storage bucket records need explicit versioned migrations. Seed data remains disabled.
- This file organization does not expose tables or grant new application access. Review access controls alongside each schema change.

## Verification status

The Auth view migration is prepared and pending application. A rolled-back PostgreSQL 17.11 probe verified narrow view access, denied direct Auth access, and confirmed that view locks block conflicting locks on the Auth base rows. The committed integration suite includes that lock check. Apply the migration and remove legacy local direct Auth grants before running the updated database and integration suites.

The initial reorganization was checked statically for equivalence to the original migration. Prior local execution was verified:

- The `Impulso` local stack is running with all three migrations applied. The old `apps` stack was stopped with its database and storage volumes preserved; no database reset was needed.
- The live database contains 23 application tables with RLS, all 105 declared indexes, no application SQL functions or procedures and no custom application triggers.
- All 222 pgTAP assertions passed. The suite defines no custom test functions, and its transaction reverted every fixture and write. Application tables and Auth users remained empty after the test run.
- Declarative synchronization with `--no-apply` and the cluster-scope manifest compared the complete schema tree, backend role and grants against isolated shadows built from all three migrations and reported `No schema changes found`. No additional migration was generated or applied.
- The hosted Supabase project was not modified. Further local changes use `supabase:start-local`, `supabase:migrate-local` and `supabase:test-db` through Nx.
