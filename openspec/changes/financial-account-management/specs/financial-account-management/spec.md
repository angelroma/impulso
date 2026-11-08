# Financial account management

## ADDED Requirements

### Requirement: Rename an existing financial account

The system SHALL allow an authorized user to change the display name of an existing account. It SHALL validate a nonempty trimmed name using the existing account naming rules, retain the account ID, book, workspace, currency and financial data, and record the actor and previous/new names in the audit history. Authorization and optimistic version checks SHALL occur at write time. Retries SHALL follow the server's existing idempotency contract.

#### Scenario: Rename succeeds
- **WHEN** an authorized user submits a valid new name and current account version
- **THEN** account listings and reports show the new name and existing transactions retain their account references and amounts.

#### Scenario: Rename cannot be applied
- **WHEN** the name is invalid, the account is inaccessible, or its version has changed
- **THEN** the system rejects the request without modifying the account.

### Requirement: Review migration before committing it

The system SHALL accept explicit source and destination workspace, book and account identifiers. It SHALL validate access to both sides and reject identical accounts. A preview SHALL disclose the source treatment, destination treatment, included and excluded record types, counts, currency, exact monetary reconciliation and unresolved dependencies. The system SHALL block unsupported or unresolved cases, including currency incompatibility, instead of assuming conversions or omitting related records.

#### Scenario: Different workspaces
- **WHEN** the user selects accounts in different workspaces and has the required access to both
- **THEN** workspace inequality alone does not block the preview.

#### Scenario: Insufficient access
- **WHEN** the user cannot read the source or perform the required writes in either workspace
- **THEN** the system denies the operation without disclosing inaccessible account data or making changes.

### Requirement: Preserve and reconcile financial dependencies

The migration SHALL preserve the meaning of opening balances, ledger entries, correction history, dated valuations, planning/settlement references and import provenance wherever present. It SHALL explicitly resolve dependent account, category, person, debt and goal references. Cross-account transfers SHALL retain both sides and SHALL NOT become income or expenses. Unsupported dependencies SHALL block commitment with an actionable explanation.

#### Scenario: Destination already has records
- **WHEN** the destination is nonempty
- **THEN** its existing records are preserved and overlap or duplicate provenance is identified for resolution before commitment.

#### Scenario: Transfer involves an unselected account
- **WHEN** a migrated entry references another account outside the selected scope
- **THEN** preview requires an authorized reference mapping or blocks the migration; it never silently drops the other side.

### Requirement: Commit only an accepted current preview

The system SHALL commit only the explicitly accepted preview version/digest, after rechecking current authorization and all relevant source and destination versions. It SHALL apply the reviewed migration atomically or through a durable recovery mechanism that prevents partially migrated data from appearing as complete. Repeating the same request ID and payload SHALL return the same operation without duplicating financial facts. A changed payload SHALL NOT reuse that request ID.

#### Scenario: Retry after an uncertain response
- **WHEN** the same accepted request is retried after a timeout
- **THEN** the system recovers or reports the original operation without adding duplicate entries.

#### Scenario: Data or permissions change after preview
- **WHEN** a relevant version or required permission changes before commitment
- **THEN** commitment is rejected and a new review is required.

#### Scenario: Failure during migration
- **WHEN** persistence fails before verified completion
- **THEN** the system preserves or restores consistent source/destination state and never reports completion prematurely.

### Requirement: Verify the completed operation

The result SHALL include an audit reference, migrated counts, exclusions, exact reconciliation and source/destination state. Migration SHALL NOT increase total represented wealth, post a bank payment, or count copied historical entries twice in reports. Report bindings and external integrations SHALL only be changed through their authorized workflows; migration completion SHALL NOT imply that an external report was refreshed.
