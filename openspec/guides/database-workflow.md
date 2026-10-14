# Database schema and migration workflow

Impulso uses Supabase declarative schemas with the `pg-delta` engine. All database files stay under `apps/supabase`; all identifiers, comments and migration names use English.

## Source definitions and change history

`apps/supabase/schemas/` describes the complete desired application schema. Edit these files when changing a table, index, constraint, permission or other application database object.

`apps/supabase/migrations/` is the ordered history used to build or upgrade a database. Generate and review a new migration after editing the declarative files. Applying migrations does not automatically read changed files from `schemas/`.

The initial migration, `20261013010257_create_impulso_database.sql`, is preserved unchanged as history. The forward migration, `20261013013807_remove_impulso_database_functions.sql`, drops all eight custom SQL functions and 93 application triggers. It does not drop tables, change native constraints, remove indexes or delete stored records. The complete declarative tree describes six application schemas, 40 tables (23 in Finance), 223 explicitly declared indexes, four private Auth views, RLS and privileges, with no custom SQL functions or application triggers. The index count excludes indexes that PostgreSQL creates for primary keys and unique constraints. See the [database-model specification](../specs/database-model/spec.md) and [table catalogue](../reference/database-catalogue.md).

Business rules belong in Supabase Edge Functions. TypeScript retains authentication, session checks, transactional onboarding and the compatible expense foundation. The [personal-planning change](../changes/adapt-finance-to-personal-planning/proposal.md) extends ledger, planning, debt, wealth, reporting and reviewed import through separate strict service contracts; its [tasks](../changes/adapt-finance-to-personal-planning/tasks.md) track integrated availability. The removal migration itself implements no backend service. Direct client access to business tables remains denied. Health, sharing, files and purge execution still require their own services and explicit privileges. Supabase-managed Auth, Storage, PostgreSQL built-ins and native constraint triggers are outside the removal. Hosted API version 3 now exposes the same 20 tools; the [separate rollout verification](remote-deployment.md#finance-rollout-verification) records the remote database and plugin checks.

`20261013024746_create_impulso_backend_role.sql` adds the limited server role and its initial application grants. Its anonymous `DO` block only creates infrastructure if missing; it defines no stored routine or business logic. Local login credentials are provisioned separately by `supabase:configure-backend`; the [remote deployment](remote-deployment.md) uses separate runtime credentials. The role may read/insert the six onboarding Core tables, insert audit events, read/insert operation receipts and read purge state. Narrow UPDATE-column grants permit native row locks. Later Finance privileges are defined by migrations five through ten below; deletion and database administration remain denied.

`20261013224249_create_impulso_auth_access_views.sql` adds four column-only projections in the unexposed `private` schema: `auth_users`, `auth_sessions`, `oauth_clients` and `oauth_consents`. They expose the account/session identifiers and current OAuth grant state required by TypeScript authorization. The views are owned by `postgres` and use owner permission checks (`security_invoker = false`), with explicit column grants for `impulso_backend` and no ordinary-client access. Timestamp-only UPDATE grants on the account/session views preserve row locks on their underlying Auth rows. This uses native [view permissions](https://www.postgresql.org/docs/17/sql-createview.html) and [locking behavior](https://www.postgresql.org/docs/17/sql-select.html), and leaves the managed Auth objects and their ACLs unchanged. New environments need no direct backend grants on Auth tables. An existing environment with legacy direct grants requires its Auth owner to remove those grants separately.

The CLI-created, reviewed [20261014010925_grant_impulso_finance_backend_access.sql](../../apps/supabase/migrations/20261014010925_grant_impulso_finance_backend_access.sql) adds Finance schema usage and SELECT/INSERT on only `books`, `book_access`, `accounts`, and `transactions`. UPDATE is limited to `books.updated_at`, `accounts.updated_at`, and `book_access.granted_at` because native row locks require UPDATE on a column. No transaction UPDATE, DELETE, budgets/files access, Health access, table/data changes, or SQL routines are included. This fifth migration is the preserved initial Finance privilege stage, not the full current grant set. It is now applied locally and remotely. [access.sql](../../apps/supabase/schemas/access.sql) contains the matching desired grants.

The CLI-created adaptation migrations extend that baseline in order:

| Migration | Reviewed change |
| --- | --- |
| [20261014015028_extend_finance_ledger_metadata.sql](../../apps/supabase/migrations/20261014015028_extend_finance_ledger_metadata.sql) | Adds reviewed account kind/opening date with `unknown`/null defaults; categories, transaction groups and separate classification; native currency/kind keys; narrow configuration/correction/category grants and new audit/receipt identifiers. |
| [20261014015155_add_finance_planning_debt_and_wealth.sql](../../apps/supabase/migrations/20261014015155_add_finance_planning_debt_and_wealth.sql) | Adds ten normalized planning/debt/wealth tables, nullable category budget scope, occurrence and active-line identities, retained revision/revocation history, single-target valuations and required service privileges. |
| [20261014015535_add_reviewed_finance_imports.sql](../../apps/supabase/migrations/20261014015535_add_reviewed_finance_imports.sql) | Adds frozen batches/rows, provenance-preserving monthly summaries and reviewed report coverage; enforces source consumption across roles, exact result shapes, bounded snapshots and narrow state/result-link writes. |
| [20261014020347_defer_import_replacement_claim_until_commit.sql](../../apps/supabase/migrations/20261014020347_defer_import_replacement_claim_until_commit.sql) | Restricts predecessor replacement uniqueness to consumed rows, so a draft preview cannot reserve another draft review; committed replacement chains remain unique. |
| [20261014021054_grant_planned_occurrence_revision_metadata.sql](../../apps/supabase/migrations/20261014021054_grant_planned_occurrence_revision_metadata.sql) | Grants only UPDATE(rule_version) so an explicitly revised eligible occurrence retains its accepted rule revision; the original rule relationship remains unwritable. |

Each new file is transactional. All ten reviewed migration versions are applied locally through the migration target without reset or seed, and the authorized [remote rollout](remote-deployment.md#finance-rollout-verification) independently applied the six versions pending after its earlier four-migration baseline. The original five files remain byte-for-byte unchanged. The current hosted model has 40 RLS-enabled tables and API version 3 exposes 20 tools. These migrations create no users, sample records, business SQL routines, bank effects, or live workbook import; existing remote Core, receipt and audit hashes and counts were preserved.

Posted transaction amount, kind, date, currency, description, account/person links, original request and replacement reference have no backend UPDATE privilege. Corrections can change only void/version/actor/time metadata and insert a replacement. Original group membership, imported source snapshots/mappings, summary amounts and valuation amounts also remain immutable to that role; explicit retirement/replacement preserves history. Native locks use the necessary narrow metadata UPDATE privileges. No backend DELETE, Finance-file, Health, Auth-secret or administration access is introduced.

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
    20261014010925_grant_impulso_finance_backend_access.sql
    20261014015028_extend_finance_ledger_metadata.sql
    20261014015155_add_finance_planning_debt_and_wealth.sql
    20261014015535_add_reviewed_finance_imports.sql
    20261014020347_defer_import_replacement_claim_until_commit.sql
    20261014021054_grant_planned_occurrence_revision_metadata.sql
  tests/
    database/
      impulso_schema.test.sql
      finance_planning_schema.test.sql
```

Each table file keeps its columns, relationships, constraints, indexes, RLS and table privileges together. `access.sql` contains shared schema access and default privileges. `api` remains empty. The backend lives in [apps/supabase/functions](../../apps/supabase/functions/): `impulso-api` hosts MCP tools reusing TypeScript onboarding and Finance services, and `impulso-auth` serves local sign-in and consent. Finance has no separate browser mutation routes. The remote deployment uses the same browser sources through its published authorization Site. See [local development](local-development.md) for endpoints and checks and [authorization hosting](authorization-hosting.md) for remote asset delivery.

The removed automatic behavior includes actor and timestamp updates, version increments, immutable fields, active-parent checks, owner-existence checks, opening-balance locking, currency-specific decimal precision and purge state workflows. Onboarding and supported Finance services supply their actors, metadata, authorized active parents, scope checks, audit and receipts in TypeScript transactions. Book creation includes its initial owner grant. Finance validates raw decimals against stored book precision before normalization. Account configuration reviews type/date without changing the opening amount; void/replacement changes effective evidence without overwriting posted values. TypeScript handles exact component sums, expected versions, eligible accounts, aggregate allocations, active states, recurrence generation, current permissions after waits, valuation freshness and accepted import/coverage reviews. Native constraints enforce scoped relationships, allowed shapes and uniqueness; no database trigger supplies application behavior. Unimplemented domain lifecycle operations remain unavailable. A partial unique index limits a scope to at most one matching owner, but does not ensure that one always exists. Ordinary client roles remain unable to write business tables.

`config.toml` enables `experimental.pgdelta` and sets `declarative_schema_path = "./schemas"`. The legacy `db.migrations.schema_paths` stays empty. The engine orders dependencies rather than relying on alphabetical filenames; for example, `core.ownership_transfer_requests` references `finance.books`. The import-row/monthly-summary provenance cycle uses a separate native ALTER TABLE foreign key so the loader can create both tables. Month checks use explicit lower/upper comparisons with `date_trunc`; combining BETWEEN with another predicate produced repeated equivalent constraint differences in the pinned engine and was normalized before application.

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

   `start-local` starts or reuses the stack named `Impulso`. `migrate-local` applies only pending migrations without resetting the database; the reviewed migration SQL determines any changes to existing data. The reviewed local baseline contains the ten migrations listed above. `test-db` runs both pgTAP files with synthetic fixture changes reverted by each outer transaction. These targets use the pinned Supabase CLI and do not deploy to the hosted project.
5. Commit the changed declarative files, the generated migration and any corresponding tests together. Deploy to the hosted project only as a separate authorized step.

## History and platform boundaries

- Preserve migrations that were applied or shared. Correct them with new forward migrations rather than renaming or rewriting their history.
- Make database structure changes through the declarative files and reviewed migrations. A manual Studio change is not captured by comparison against migration history.
- Keep application schemas complete. Supabase-managed Auth and Storage objects are not copied into this tree.
- Declarative schema files contain definitions, not `INSERT`, `UPDATE` or `DELETE` statements. Data transformations and future Storage bucket records need explicit versioned migrations. Seed data remains disabled.
- This file organization does not expose tables or grant new application access. Review access controls alongside each schema change.

## Verification history

These are recorded results from October 13, 2026, not a live environment check performed by this documentation migration:

- The initial reorganization was checked statically for equivalence to the original migration. At its earlier three-migration baseline, declarative synchronization reported `No schema changes found` and all 222 pgTAP assertions passed. Those counts describe that historical stage.
- The old `apps` local stack was stopped with its database and storage volumes preserved; switching to `Impulso` did not require a database reset.
- The fourth migration was subsequently applied locally. The updated suite passed all 256 pgTAP assertions, covering the 23 RLS-enabled tables, four restricted Auth views and absence of application SQL functions, procedures or custom triggers. Fixtures and writes were rolled back.
- A rolled-back PostgreSQL 17.11 probe verified narrow view access, denied direct Auth access and confirmed that view locks block conflicting locks on Auth base rows. The local integration suite includes the lock check. Environments with legacy direct Auth grants still require cleanup by the Auth owner; the current model needs only the private views.
- The remote project was later deployed and its four migration versions reconciled with the current model. Its migration list and database push dry run reported an up-to-date baseline. See [remote deployment](remote-deployment.md) for the separate remote evidence and limits.

After a future schema change, rerun the relevant local commands above. Historical test success does not prove an edited tree or a different environment is synchronized.

## Local Finance privilege verification

At the earlier five-migration conversational-expense stage, the reviewed fifth migration was applied only to the local stack. The updated database suite passed all 320 pgTAP assertions, including service SELECT/INSERT and row-lock privileges on the four Finance tables, denied transaction edits/deletion and budgets/files/Health access, and continued denial for ordinary clients. The migration changes grants only; it adds no tables, data, custom PostgreSQL functions, procedures, or application triggers. Function/protocol/integration verification is recorded separately in [local development](local-development.md#verification-status); this database result does not establish a remote rollout.

## Local personal-planning verification

On October 14, 2026 UTC, the five reviewed adaptation migrations were applied through `supabase:migrate-local`. The two database files passed **533 pgTAP assertions**. Coverage includes the complete 40-table/RLS inventory, ordinary-client denial, narrow server privileges, scoped currency/kind relationships, group positions, null-safe category budgets, recurrence identity, resolved/unresolved plan shapes, settlement scope, goal funding basis, exact-one valuation targets, finite/zero/positive amounts, frozen import fields, role-independent source consumption retained replacement history, and multiple draft previews unable to reserve or fork a consumed replacement.

All five original migration SHA-256 hashes matched the captured preservation baseline. Declarative comparison after replaying all ten migrations reported `No schema changes found`. The desired tree and new migrations contain no custom PostgreSQL function, procedure or application trigger; managed Auth/Storage objects remain unchanged. Existing local application identities and receipts were preserved; the captured local baseline contained no user financial rows.

These dated database observations are one part of the completed [local verification](../changes/adapt-finance-to-personal-planning/verification.md), which records function, protocol and disposable integration results separately. They do not establish a hosted Finance connection, reconciliation of the user's source amounts or a live import. Remote rollout and any real-source import remain separate actions.

## Remote Finance rollout verification

The later authorized [remote rollout](remote-deployment.md#finance-rollout-verification) verified ten applied migration versions, 40 RLS-enabled application tables, zero custom application SQL routines and zero application triggers in `txoorpmblpvqveeudafv`. It deployed `impulso-api` version 3, refreshed ChatGPT's 20-tool manifest and checked the existing OAuth session with `get_session`. Existing user records were preserved; no salary, financial records or live workbook import was created. These hosted observations are independent of the historical local test results above.
