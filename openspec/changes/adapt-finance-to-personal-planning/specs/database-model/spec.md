# Spec Delta

## MODIFIED Requirements

### Requirement: The complete declarative tree defines the desired model

The database SHALL use the complete `apps/supabase/schemas` tree as its desired application model and reviewed chronological files in `apps/supabase/migrations` as history. It SHALL preserve the six application schemas and existing Core, Health, Audit, and Private tables while extending Finance for the declared ledger, planning, debt, wealth, and import capabilities. New implementation identifiers and documentation SHALL use English.

#### Scenario: Inspect the current model

- **WHEN** the complete declarative model is inspected
- **THEN** it contains `core`, `finance`, `health`, `api`, `audit`, and `private`
- **AND** its full table inventory matches the updated database catalogue
- **AND** `api` contains no application tables, views, or callable operations

#### Scenario: Historical objects have been removed

- **WHEN** an earlier migration defines objects removed by a later reviewed migration
- **THEN** the complete chronological history and current declarative tree determine the resulting model
- **AND** the removed objects are not restored from the earlier definition

#### Scenario: Existing local data receives additive extensions

- **WHEN** the reviewed Finance migrations are applied to an existing local database
- **THEN** prior identities, workspaces, accounts, posted expenses, audits, and receipts survive
- **AND** legacy account classifications and unknown opening dates are not fabricated

### Requirement: Direct client access is denied

Every application table SHALL enable RLS and deny ordinary table access to `PUBLIC`, `anon`, `authenticated`, and `service_role`. Internal schemas SHALL deny those client roles schema access. Only the empty `api` namespace SHALL be exposed through the Data API, with new-table automatic exposure disabled. Seed configuration SHALL create no application or example data.

#### Scenario: A client role attempts to read or write application data

- **WHEN** `anon`, `authenticated`, or `service_role` attempts direct access to an application table or private Auth view
- **THEN** database privileges deny that access
- **AND** resolving the empty `api` namespace does not grant internal table access
- **AND** the same denial applies to new planning, debt, wealth, and import tables

### Requirement: The backend receives only current service privileges

The server-only `impulso_backend` role SHALL receive only declared service reads, inserts, and necessary lock or metadata updates. Finance correction grants SHALL exclude changes to posted amounts, dates, currency, and account references. Health, Finance files, deletion, and administration SHALL remain denied. RLS bypass SHALL remain bounded by grants, with credentials provisioned separately.

#### Scenario: The onboarding backend attempts unrelated access

- **WHEN** the backend attempts Health, Finance files, unrelated managed Auth columns, posted-value rewrites, or destructive application operations
- **THEN** the declared privileges deny that access
- **AND** its allowed Core writes remain limited to the six onboarding tables and explicitly granted columns

#### Scenario: A Finance service uses the new grants

- **WHEN** the backend performs an authorized supported Finance operation
- **THEN** its required reads, inserts, native row locks, and narrowly declared metadata updates are permitted
- **AND** ordinary client roles retain no direct application or Auth-view access
- **AND** no custom SQL function, procedure, or application trigger is introduced

### Requirement: Native relationships preserve resource scope

Native foreign keys SHALL enforce workspace relationships. Finance references SHALL additionally preserve applicable book and currency across accounts, categories, plans, settlements, debts, goals, valuations, and imports; Health attachments SHALL preserve subject person. Basic-person, financial-book, and health-person ACLs SHALL remain independent. Membership or identity linkage MUST NOT imply cross-domain permission.

#### Scenario: A reference crosses a protected boundary

- **WHEN** a row references a person in another workspace, an account or category in another book, or a Health attachment target belonging to another person
- **THEN** the applicable composite foreign key rejects the incompatible reference

#### Scenario: A user has only basic-person access

- **WHEN** a basic-person ACL or verified identity link exists
- **THEN** that row does not create a financial-book or health-person ACL
- **AND** Finance services check independent current book grants while unimplemented domains still require their own authorization services

#### Scenario: New Finance links have incompatible scope

- **WHEN** a settlement, goal allocation, valuation target, or import result links resources across workspaces, books, or required currencies
- **THEN** the native relationship rejects that link
- **AND** TypeScript separately checks active state, permissions, kind compatibility, and aggregate allocation limits

### Requirement: Lifecycle columns do not imply automatic application behavior

Lifecycle columns SHALL retain declared types, defaults, and native checks. The database MUST NOT imply automatic versions, immutable history, active-parent or owner-existence checks, recurrence generation, report calculation, import execution, or purge execution. Supported onboarding and Finance services SHALL supply their application checks, audit, and receipts in TypeScript transactions; other operations remain unavailable.

#### Scenario: An administrator performs a direct update

- **WHEN** an administrator updates a row without explicitly updating its version or metadata
- **THEN** no custom trigger increments the version or rewrites actor and timestamp
- **AND** native constraints still apply

#### Scenario: Creation services enforce their own boundaries

- **WHEN** an onboarding or Finance creation service commits an authorized action
- **THEN** its TypeScript transaction supplies actors, metadata, applicable parent and owner checks, audit, and receipt
- **AND** existence of a table does not expose owner transfer, Health, files, or purge execution

#### Scenario: A supported Finance update changes related resources

- **WHEN** a correction, allocation, plan revision, valuation, or reviewed import changes supported records
- **THEN** TypeScript validates expected versions and commits related writes, audit, and receipt atomically
- **AND** historical posted amounts are corrected by replacement rather than overwritten
