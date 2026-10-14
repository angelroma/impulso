# Database catalogue

This catalogue describes the existing declarative model: six application schemas, 23 tables, and four private Auth projection views. Exact columns, defaults, constraints, indexes, RLS, and privileges live in the linked [canonical SQL tree](../../apps/supabase/schemas/); reviewed upgrades live in [migrations](../../apps/supabase/migrations/). PostgreSQL 17 is configured in [config.toml](../../apps/supabase/config.toml).

The [database-model specification](../specs/database-model/spec.md) defines the current boundary. The preserved [original data model](original-data-model.md) contains design provenance and proposed operations as well as implemented structure; it is not proof that every described service exists.

## Current application scope

Only account session inspection and transactional onboarding are available through the [MCP API](../specs/mcp-authentication/spec.md). Onboarding writes six Core tables, one audit event, and an operation receipt. It reads purge state and restricted Auth projections to validate the operation. Finance/Health operations, additional people, sharing, ownership transfer, file services, and purge execution remain pending. Their tables and state values already exist as structural preparation.

All 23 tables enable RLS. Ordinary client roles, including `service_role`, have no direct application-table access. The limited `impulso_backend` role has only the current service grants in [access.sql](../../apps/supabase/schemas/access.sql); it has no Finance/Health privileges. Google sign-in alone does not create a financial book or enable a Health scope.

## Core: eight tables

| Table and canonical definition | Purpose and important relationships | Current service use |
| --- | --- | --- |
| [core.workspaces](../../apps/supabase/schemas/core/tables/workspaces.sql) | Workspace name, time zone, creator, version, and archive metadata. A nonnull creator can have one initial workspace. | Created or recovered by onboarding. |
| [core.workspace_members](../../apps/supabase/schemas/core/tables/workspace_members.sql) | Accounts belonging to a workspace, with owner/member roles and invited/active/revoked states. | Onboarding creates the active owner; invitation and membership management are pending. |
| [core.people](../../apps/supabase/schemas/core/tables/people.sql) | Basic person profiles scoped to one workspace. A profile may exist without an Auth account. | Onboarding creates the user's self profile; managed-person operations are pending. |
| [core.person_user_links](../../apps/supabase/schemas/core/tables/person_user_links.sql) | Verified account-to-person identity links, unique in both directions within a workspace. | Onboarding creates the `self_registration` link; dual-acceptance linking is pending. |
| [core.person_access](../../apps/supabase/schemas/core/tables/person_access.sql) | Owner/editor/viewer grants for a basic person profile, separate from Finance and Health ACLs. | Onboarding creates the basic owner grant; grant changes are pending. |
| [core.person_aliases](../../apps/supabase/schemas/core/tables/person_aliases.sql) | User-specific names for people. The generated trimmed/lowercase alias is unique per workspace and user. | Onboarding creates alias `me`; alias management is pending. |
| [core.identity_link_requests](../../apps/supabase/schemas/core/tables/identity_link_requests.sql) | Pending and completed requests to connect an existing workspace member to a person; declared expiry is seven days. | Request and acceptance services are pending. |
| [core.ownership_transfer_requests](../../apps/supabase/schemas/core/tables/ownership_transfer_requests.sql) | Offers to transfer workspace, basic-person, book, or health-person ownership, with one pending offer per scope. | Transfer and acceptance services are pending. |

## Finance: six tables

| Table and canonical definition | Purpose and important relationships | Current service use |
| --- | --- | --- |
| [finance.books](../../apps/supabase/schemas/finance/tables/books.sql) | Named financial books with explicit currency and minor-unit precision, scoped to a workspace. | Book creation and management are pending. |
| [finance.book_access](../../apps/supabase/schemas/finance/tables/book_access.sql) | Owner/editor/viewer grants for an individual book, with explicit revocation metadata. | Financial authorization and sharing services are pending. |
| [finance.accounts](../../apps/supabase/schemas/finance/tables/accounts.sql) | Accounts within a book and currency, optional associated person, and finite opening balance. | Account operations and balance services are pending. |
| [finance.transactions](../../apps/supabase/schemas/finance/tables/transactions.sql) | Positive income/expense/transfer amounts, source/destination accounts, beneficiary, occurrence date, request key, replacement, and void metadata. | Expense recording, corrections, transfers, and voiding are pending. |
| [finance.budgets](../../apps/supabase/schemas/finance/tables/budgets.sql) | Positive budget amount and date interval for a book, optionally assigned to a person. | Budget operations are pending. |
| [finance.files](../../apps/supabase/schemas/finance/tables/files.sql) | Attachment metadata for one transaction, including `finance-files` bucket label, canonical scoped object path, MIME, size, and state. | Buckets, upload verification, retrieval, and file lifecycle services are pending. |

Composite references bind Finance accounts and transactions to the same workspace, book, and currency. Money uses `numeric(20,4)`; native checks reject nonfinite values and nonpositive transaction/budget amounts. Currency syntax is three uppercase letters and `minor_unit` is zero through four. The current SQL does not verify an ISO currency registry, parse user decimal strings, enforce book-specific decimal precision, or lock an opening balance after its first movement.

## Health: six tables

| Table and canonical definition | Purpose and important relationships | Current service use |
| --- | --- | --- |
| [health.person_access](../../apps/supabase/schemas/health/tables/person_access.sql) | Independent owner/editor/viewer grants for one person's Health data in a workspace. | Health enablement and access management are pending. |
| [health.records](../../apps/supabase/schemas/health/tables/records.sql) | Person-scoped notes, symptoms, diagnoses, history, or medication-intake reports, with an optional date or instant. | Clinical-record operations are pending. |
| [health.medications](../../apps/supabase/schemas/health/tables/medications.sql) | Reported medication name, optional instructions/dates, and reported/active/stopped state. | Medication operations are pending. |
| [health.appointments](../../apps/supabase/schemas/health/tables/appointments.sql) | Appointment start, optional end, time zone, provider, location, reason, and status for one person. | Appointment operations are pending. |
| [health.lab_results](../../apps/supabase/schemas/health/tables/lab_results.sql) | Reported test and result text, optional collection date or instant, unit, reference range, and laboratory. | Lab-result operations are pending. |
| [health.files](../../apps/supabase/schemas/health/tables/files.sql) | Attachment metadata for exactly one record, medication, appointment, or lab result belonging to the same person; `health-files` bucket label. | Buckets and file services are pending. |

Unknown clinical event or collection dates remain null; creation timestamps do not supply them. Date and instant representations are mutually exclusive, not jointly required. Medication end dates cannot precede start dates, and an appointment end must follow its start. Health attachment foreign keys include workspace and person to prevent cross-subject references.

## Audit: one table

| Table and canonical definition | Purpose and important relationships | Current service use |
| --- | --- | --- |
| [audit.events](../../apps/supabase/schemas/audit/tables/events.sql) | Request/actor/scope identifiers, module, resource, action, outcome, and changed-field names. Historical identifiers are retained independently of resource lifetime. | Onboarding inserts one successful workspace-creation event; other operation audit services are pending. |

## Private: two tables

| Table and canonical definition | Purpose and important relationships | Current service use |
| --- | --- | --- |
| [private.operation_receipts](../../apps/supabase/schemas/private/tables/operation_receipts.sql) | Globally unique request key, actor, operation, normalized payload hash, result IDs, and completed/purged state for idempotency. | Onboarding checks and writes receipts; other listed operation names are reserved structural values. |
| [private.purge_requests](../../apps/supabase/schemas/private/tables/purge_requests.sql) | Administrative purge scope, manifest/hash, five-minute preparation expiry, confirmation, progress, and failure state. | Onboarding reads state to deny recreation of purging or retired scopes; purge execution is pending. |

## Private Auth projections: four views

These views are not additional application tables and do not duplicate managed Auth records. They are `postgres`-owned, use owner permission checks (`security_invoker = false`), and are inaccessible to ordinary clients. Explicit backend column grants provide a narrow bridge to managed Auth state.

| View and canonical definition | Projected columns | Granted backend use |
| --- | --- | --- |
| [private.auth_users](../../apps/supabase/schemas/private/views/auth_users.sql) | `id`, `updated_at` | Read `id`; timestamp-only UPDATE privilege permits locking the underlying account during onboarding. |
| [private.auth_sessions](../../apps/supabase/schemas/private/views/auth_sessions.sql) | `id`, `user_id`, `not_after`, `updated_at`, `oauth_client_id`, `scopes` | Read identifiers, expiry, client, and scopes; timestamp-only UPDATE privilege permits session row locks. |
| [private.oauth_clients](../../apps/supabase/schemas/private/views/oauth_clients.sql) | `id`, `deleted_at` | Verify that the OAuth client still exists and is not deleted. |
| [private.oauth_consents](../../apps/supabase/schemas/private/views/oauth_consents.sql) | `user_id`, `client_id`, `scopes`, `revoked_at` | Verify current consent and scope coverage for the user/client pair. |

The backend cannot select `updated_at` through these Auth projections merely because it holds UPDATE on that timestamp column. Password hashes, refresh tokens, and OAuth client secrets are not projected. Managed Auth and Storage schemas retain their Supabase-owned definitions.

## Responsibility boundaries

- Native primary/foreign keys, unique indexes, generated aliases, and row checks enforce structural integrity. Partial owner indexes guarantee **at most one** matching owner; they do not guarantee that an owner remains.
- Version columns start at one and must stay positive. Metadata and versions do not update automatically, and financial immutability, active-parent checks, and archive rules require future TypeScript services.
- Workspace membership, a verified self link, a basic-person grant, a financial-book grant, and a health-person grant are distinct. The current onboarding transaction creates only the basic account scope.
- File metadata constrains PDF/JPEG/PNG, positive size up to 20 MiB, and scoped paths. It does not provision a bucket or prove an uploaded object's content.
- The empty `api` schema is reserved for future explicit interfaces; current application operations run through TypeScript Edge Functions. There are no custom PostgreSQL functions, procedures, or application triggers in the current model.

See the [database workflow](../guides/database-workflow.md) for reviewed migrations and the [database assertions](../../apps/supabase/tests/database/impulso_schema.test.sql) for executable integrity checks.
