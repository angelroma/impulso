# Spec Delta

## Purpose

Extend the authorized financial ledger to represent earned income, spending, transfers, typed accounts and reviewed corrections while preserving exact amounts, historical evidence and the existing expense workflow.

## ADDED Requirements

### Requirement: Ledger extensions preserve legacy tool and receipt compatibility

The system SHALL preserve the six existing tool contracts and their accepted behavior. Existing expense receipts SHALL retain their original version-one fingerprint and recovery rules. `get_finance_context` SHALL continue to exclude amounts and history. New transaction contracts SHALL include an explicit kind in a versioned fingerprint without rewriting historical receipts.

#### Scenario: A legacy expense response was lost before the extension

- **WHEN** its authorized actor retries the original `record_expense` request with unchanged values
- **THEN** the original receipt is evaluated using its original fingerprint and returns the existing result under current recovery rules
- **AND** adding category or account metadata does not itself invalidate the original receipt or insert another expense

#### Scenario: A request identifier crosses transaction contracts

- **WHEN** a new transaction action reuses an existing request identifier with a different kind, contract fingerprint or accepted payload
- **THEN** it fails with a controlled request conflict without disclosing the earlier action
- **AND** no legacy receipt is upgraded or replaced to accommodate the new request

#### Scenario: A client only needs financial choices

- **WHEN** it calls the unchanged `get_finance_context` contract
- **THEN** it receives the existing bounded authorized choices without balances, amounts or ledger descriptions
- **AND** ledger inspection requires an explicit read operation

### Requirement: Account types and opening boundaries are explicitly reviewed

Accounts SHALL support an explicit type and a nullable `opening_balance_on` date. Existing accounts SHALL migrate to type `unknown` and an unknown opening date. Type or boundary changes SHALL require accepted values and `expected_version`. No amount, historical date or liability classification SHALL be inferred from an account name; opening balances SHALL remain immutable after the first movement.

#### Scenario: Existing local accounts are migrated

- **WHEN** the additive ledger migration runs over accounts created by the existing workflow
- **THEN** their identifiers, names, currencies, opening amounts, attributions and transactions remain unchanged
- **AND** missing account types and opening boundaries are visibly unknown until reviewed

#### Scenario: A boundary conflicts with existing history

- **WHEN** an account configuration would place an existing movement before its accepted opening boundary, or a new movement precedes that boundary
- **THEN** the conflicting action is rejected without moving or silently discarding historical entries
- **AND** the user can resolve the boundary through a new explicit reviewed action

#### Scenario: Two account configuration changes use one version

- **WHEN** concurrent accepted updates supply the same `expected_version`
- **THEN** at most one change commits and the other receives a controlled version conflict
- **AND** an account named like a card or investment is not automatically retyped

### Requirement: Categories classify transactions without changing their original payloads

Categories SHALL belong to a book and have an explicit income or expense kind. Transaction classification SHALL use a separate relation so legacy transaction payloads and receipts remain unchanged. Creation and changes SHALL require current write access; classification changes and category updates SHALL require `expected_version`. Archived categories SHALL preserve historical labels but reject new classification.

#### Scenario: An existing expense is categorized

- **WHEN** an authorized writer selects an active compatible category and the current classification version
- **THEN** its classification commits with an audit and receipt without changing the expense's original amount, date, description or fingerprint
- **AND** an identical authorized retry does not create another classification revision or success audit

#### Scenario: Classification uses another protected scope or kind

- **WHEN** a category belongs to another book or workspace, is archived, or has an incompatible income or expense kind
- **THEN** classification fails without revealing unrelated category details
- **AND** a transfer is not classified as income or expense to make it affect spending reports

#### Scenario: Classification updates race

- **WHEN** two changes use the same classification version
- **THEN** one accepted revision can commit and the other fails with a version conflict
- **AND** an uncategorized transaction remains visibly uncategorized until explicitly classified

### Requirement: New transaction recording enforces kind-specific account effects

`record_transaction` SHALL accept a closed kind-specific contract for income, expense or transfer with explicit scope, exact positive amount, matching currency and concrete date. Income SHALL have only a destination, expense only a source, and transfer two distinct accounts in one book and currency. Attribution SHALL remain verified self or explicitly accepted unassigned; no operation SHALL execute a bank payment.

#### Scenario: Income and transfer are recorded

- **WHEN** a writer records income of `500.00` to checking and transfers `200.00` from checking to savings in the same MXN book
- **THEN** one income increases checking and one transfer decreases checking while increasing savings by the same exact amount
- **AND** the transfer contributes neither earned income nor expense to reports

#### Scenario: A proposed transfer cannot be represented safely

- **WHEN** its source and destination are identical, cross-book, cross-workspace, differently denominated, inactive or unauthorized
- **THEN** the transfer is rejected atomically without an account effect or replacement expense
- **AND** currency conversion, loan drawdown and income are not silently substituted for one another

#### Scenario: One accepted payment has several financial components

- **WHEN** a complete instruction groups no more than ten compatible entries such as a principal transfer and interest expense
- **THEN** the bounded group commits all accepted entries, links and success evidence atomically or commits none
- **AND** every entry retains its explicit kind, account effects, exact amount, currency and attribution without rounding a split remainder

#### Scenario: Amount or date input would lose precision

- **WHEN** the request supplies a JSON number, nonfinite or exponential amount, excess currency scale, unsupported currency or impossible date
- **THEN** it fails before recording a movement without rounding, truncation or date substitution
- **AND** normalized accepted decimal strings and the resolved concrete date remain fixed across retries

### Requirement: Corrections and voids preserve an auditable movement history

Controlled correction and void operations SHALL require explicit scope, reason, `request_id` and `expected_version`. Corrections SHALL atomically void the current entry and create one linked replacement; voids SHALL remove only its effective balance and report effects. The original entry, description and receipt SHALL remain preserved. Conflicting revisions SHALL fail instead of appending an unrelated compensating expense.

#### Scenario: A committed expense amount is corrected

- **WHEN** a writer accepts a correction with the current transaction version and valid replacement values
- **THEN** the original is retained as voided and exactly one linked replacement supplies the effective ledger amount
- **AND** the source, replacement, audit and receipt changes commit together or all roll back

#### Scenario: Two revisions compete for one effective entry

- **WHEN** a correction and void race using the same version, or a correction targets an already superseded entry
- **THEN** at most one revision succeeds and the other receives a controlled conflict
- **AND** replaying a legacy creation receipt cannot restore a voided entry or create another replacement

#### Scenario: A creation receipt points to a voided or replaced entry

- **WHEN** a client retries the original creation request after its entry has been voided or replaced
- **THEN** recovery returns controlled `action_retired` rather than confirming an active expense
- **AND** the original receipt remains preserved without restoring the entry or inserting another transaction

#### Scenario: A transfer correction involves opposite account order

- **WHEN** concurrent authorized revisions involve the same account pair in opposite directions
- **THEN** they use a deterministic resource-lock order and preserve exactly-once balanced effects
- **AND** a transient lock failure permits only an unchanged same-key retry

### Requirement: Explicit ledger reads are bounded and permission scoped

`list_transactions` SHALL require workspace and book scope and accept only documented bounded date, account, category and kind filters. Results SHALL use keyset pagination, decimal-string amounts, concrete dates and explicit effective or voided state. Each page SHALL recheck access and bind continuation to the complete filter scope; client cursors SHALL never grant access or request arbitrary SQL.

#### Scenario: A viewer inspects the authorized ledger

- **WHEN** a current book viewer requests a bounded interval and follows its continuation
- **THEN** only matching permitted entries are returned in stable date-and-ID order without repeating the preceding page
- **AND** the viewer gains no mutation, import, private receipt or unrelated book access

#### Scenario: A continuation changes scope or permissions

- **WHEN** a cursor is reused with different filters, another book, or after a book grant is revoked
- **THEN** incompatible continuation is rejected and revoked entries are not returned
- **AND** one page's context cannot authorize later reads

### Requirement: New ledger actions retain transactional authorization and safe retries

Every new ledger action SHALL recheck session, consent, membership, book grant and applicable person access within its transaction, including after waits. Archived or purging scopes SHALL block actions and recovery. Mutations SHALL atomically commit their changes, book-linked redacted audit and actor-bound receipt, using stable lock order and unchanged-key recovery; no custom SQL routines SHALL be required.

#### Scenario: Delegated consent is revoked while a writer waits

- **WHEN** consent, membership or applicable grant is revoked before the waiting action can complete its authorization checks
- **THEN** no new financial change, success audit or completed receipt commits
- **AND** a previous successful receipt does not override current write denial

#### Scenario: A late failure or uncertain response occurs

- **WHEN** audit or receipt creation fails, or identical accepted requests race
- **THEN** a failed transaction leaves no partial changes and at most one successful mutation commits
- **AND** unchanged authorized recovery returns the original result while changed payloads and retired receipts fail safely
