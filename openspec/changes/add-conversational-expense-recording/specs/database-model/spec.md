# Spec Delta

## MODIFIED Requirements

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
