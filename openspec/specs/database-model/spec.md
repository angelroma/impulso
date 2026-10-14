# database-model Specification

## Purpose

Describe Impulso's existing declarative PostgreSQL model, its access boundaries, and the integrity enforced by native database objects. This baseline documents existing structure; the presence of a table does not make a corresponding application operation available.

## Requirements

### Requirement: The complete declarative tree defines the desired model

The database SHALL use the complete `apps/supabase/schemas` tree as its desired application model and reviewed chronological files in `apps/supabase/migrations` as its change history. The model SHALL contain six application schemas and 23 tables: eight Core, six Finance, six Health, one Audit, and two Private. New implementation identifiers and documentation SHALL use English.

#### Scenario: Inspect the current model

- **WHEN** the complete declarative model is inspected
- **THEN** it contains `core`, `finance`, `health`, `api`, `audit`, and `private`
- **AND** its 23 tables match the [database catalogue](../../reference/database-catalogue.md)
- **AND** `api` contains no application tables, views, or callable operations

#### Scenario: Historical objects have been removed

- **WHEN** an earlier migration defines objects removed by a later reviewed migration
- **THEN** the complete chronological history and current declarative tree determine the resulting model
- **AND** the removed objects are not restored from the earlier definition

### Requirement: PostgreSQL provides structure while TypeScript owns application logic

Application schemas SHALL contain tables, native constraints, indexes, RLS, privileges, and the four restricted Auth projection views. They MUST NOT contain custom PostgreSQL functions, procedures, or application triggers, including SQL test helpers. Supabase-managed Auth and Storage objects and PostgreSQL built-ins SHALL remain outside the application-owned model.

#### Scenario: Inspect application routines and triggers

- **WHEN** the resulting application schemas are inspected
- **THEN** they contain no custom functions, procedures, or noninternal application triggers
- **AND** PostgreSQL internal constraint triggers and Supabase-managed platform objects remain intact

### Requirement: Direct client access is denied

All 23 application tables SHALL enable RLS and deny ordinary table access to `PUBLIC`, `anon`, `authenticated`, and `service_role`. Internal schemas SHALL deny those client roles schema access. Only the empty `api` namespace SHALL be exposed through the Data API, with new-table automatic exposure disabled. Seed configuration SHALL create no application or example data.

#### Scenario: A client role attempts to read or write application data

- **WHEN** `anon`, `authenticated`, or `service_role` attempts direct access to an application table or private Auth view
- **THEN** database privileges deny that access
- **AND** resolving the empty `api` namespace does not grant internal table access

### Requirement: The backend receives only current service privileges

The server-only `impulso_backend` role SHALL have only declared onboarding, Finance context/creation, audit, receipt, purge-state, and Auth-view privileges. Finance grants SHALL cover only required access to books, book ACLs, accounts, and transactions, with narrow lock-column UPDATE grants. Health, budgets, files, transaction edits, deletion, and administration SHALL remain denied. Its RLS bypass SHALL remain bounded by grants, with login credentials provisioned separately.

#### Scenario: The onboarding backend attempts unrelated access

- **WHEN** the backend attempts to access Health, Finance budgets/files, unrelated managed Auth columns, transaction edits, or destructive application operations
- **THEN** the declared privileges deny that access
- **AND** its allowed Core writes remain limited to the six onboarding tables and explicitly granted columns

#### Scenario: A Finance service uses the new grants

- **WHEN** the backend performs an authorized Finance context read or book/account/expense creation
- **THEN** the necessary Finance reads, inserts, and native row locks are permitted
- **AND** ordinary client roles retain no direct access to application tables or private Auth views
- **AND** no custom SQL function, procedure, or application trigger is introduced

### Requirement: Private Auth views expose only authorization state

The unexposed `private` schema SHALL contain `auth_users`, `auth_sessions`, `oauth_clients`, and `oauth_consents` as `postgres`-owned projections using owner permission checks. Explicit backend column grants SHALL expose only the declared identifiers and authorization state. Timestamp-only UPDATE grants SHALL support native row locks on account and session rows without granting access to passwords, refresh tokens, or client secrets.

#### Scenario: The backend validates a session

- **WHEN** the backend reads and locks the private account or session projection
- **THEN** it can access only its granted columns and the lock reaches the underlying managed Auth row
- **AND** ordinary client roles cannot access the projections

### Requirement: Native relationships preserve resource scope

Native foreign keys SHALL enforce declared workspace relationships. Finance account and transaction references SHALL additionally preserve their book and currency; Health attachment references SHALL preserve the subject person. Basic-person, financial-book, and health-person access SHALL remain separate ACL tables. Workspace membership or identity linkage MUST NOT be represented as an automatic cross-domain grant.

#### Scenario: A reference crosses a protected boundary

- **WHEN** a row references a person in another workspace, a transaction account in another book, or a Health attachment target belonging to another person
- **THEN** the applicable composite foreign key rejects the incompatible reference

#### Scenario: A user has only basic-person access

- **WHEN** a basic-person ACL or verified identity link exists
- **THEN** that row does not create a financial-book or health-person ACL
- **AND** Finance services check their independent current book grants while unimplemented domains still require their own authorization services

### Requirement: Native monetary constraints enforce representable valid rows

Monetary columns SHALL use `numeric(20,4)` and reject nonfinite values. Transaction and budget amounts SHALL be positive; opening balances MAY be finite and negative. Books SHALL use three uppercase currency letters and `minor_unit` from zero through four. Native constraints SHALL enforce the declared income, expense, and transfer account shapes and matching book currency.

#### Scenario: A financial row has invalid amount or account shape

- **WHEN** a transaction has zero, negative, or nonfinite amount, an expense lacks its source, or a transfer uses the same source and destination
- **THEN** native constraints reject the row

#### Scenario: A monetary value has book-specific excess precision

- **WHEN** an administrator supplies a representable four-place value to a book declaring two minor-unit places
- **THEN** the SQL type alone does not enforce that book-specific precision
- **AND** TypeScript Finance creation services validate raw decimal input and currency-specific precision before writing, without implying that administrator SQL has those application checks

### Requirement: Uniqueness preserves identity and owner limits

Native keys SHALL limit one creator-owned initial workspace per nonnull creator and one person/account identity link in each direction per workspace. Normalized aliases SHALL be unique per user and workspace. Partial unique indexes SHALL enforce at most one active workspace owner or unrevoked resource owner; they SHALL NOT be described as guaranteeing owner existence.

#### Scenario: A second owner or identity link conflicts

- **WHEN** an insert would create a second matching active owner or link the same account to a second person in one workspace
- **THEN** the corresponding unique key or index rejects it

#### Scenario: An administrator removes the last owner

- **WHEN** an administrator changes the only owner row to a nonowner role
- **THEN** the partial unique index alone does not prevent zero owners
- **AND** preserving an owner across future lifecycle operations requires transactional TypeScript checks

### Requirement: Dates and attachment metadata use explicit native checks

Native checks SHALL enforce declared date ordering, mutually exclusive date-or-instant Health representations, attachment target scope, supported MIME values, size limits, and canonical object-path shapes. Unknown clinical event and collection dates MAY remain null. Attachment metadata and bucket-name checks SHALL NOT imply that Storage buckets or upload/download services have been implemented.

#### Scenario: A clinical date is unknown or contradictory

- **WHEN** a clinical event or collection has neither date representation
- **THEN** its date remains unknown
- **AND** supplying both representations, a reversed medication interval, or a nonpositive appointment interval is rejected

#### Scenario: An attachment has incompatible metadata

- **WHEN** an attachment has an invalid size, MIME value, target combination, or object path
- **THEN** the corresponding native constraint rejects it
- **AND** a valid metadata row alone does not upload, verify, or serve a file

### Requirement: Lifecycle columns do not imply automatic application behavior

Version, timestamp, actor, archive, receipt, and workflow-state columns SHALL retain their declared types, defaults, and checks. The database MUST NOT imply automatic version increments, financial immutability, opening-balance locking, active-parent or owner-existence checks, or purge execution. Onboarding and Finance creation services SHALL enforce their implemented checks in TypeScript transactions; other lifecycle operations remain unavailable.

#### Scenario: An administrator performs a direct update

- **WHEN** an administrator updates a row without explicitly updating its version or metadata
- **THEN** no custom trigger increments the version or rewrites the actor and timestamp
- **AND** existing native constraints still apply

#### Scenario: Creation services enforce their own boundaries

- **WHEN** an onboarding or Finance creation service commits an authorized action
- **THEN** its TypeScript transaction supplies required actors, initial metadata, applicable parent/owner checks, audit, and receipt
- **AND** these checks do not expose account edits, transaction corrections, owner transfer, or purge execution

## Implementation evidence

- [Canonical SQL tree](../../../apps/supabase/schemas/) and [access grants](../../../apps/supabase/schemas/access.sql).
- [Chronological migrations](../../../apps/supabase/migrations/) and [database assertions](../../../apps/supabase/tests/database/impulso_schema.test.sql).
- [Transactional onboarding service](../../../apps/supabase/functions/_shared/onboarding.ts) and [backend integration tests](../../../apps/supabase/functions/tests/onboarding_integration_test.ts).
- [MCP authentication baseline](../mcp-authentication/spec.md) and [conversational onboarding](../conversational-onboarding/spec.md).
