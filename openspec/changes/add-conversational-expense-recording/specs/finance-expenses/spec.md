# Spec Delta

## Purpose

Enable the connected user to prepare an authorized financial book and account, then record an expense through a focused conversation with exact values, independent resource permissions, truthful outcomes, and safe retries.

## ADDED Requirements

### Requirement: Finance tools use strict explicit resource contracts

The Finance tool surface SHALL contain only `get_finance_context`, `create_book`, `create_account`, and `record_expense`. Every Finance call SHALL require `workspace_id`. Inputs SHALL be closed objects with validated UUID resource identifiers and no tokens, passwords, SQL, actor identifiers, arbitrary records, or unsupported fields. Existing `get_session` and `onboard` contracts SHALL remain unchanged.

#### Scenario: The client supplies an unexpected field

- **WHEN** a Finance call contains `actor_user_id`, `kind`, a token, SQL, an unsupported field, or a malformed resource identifier
- **THEN** the request is rejected without executing a Finance mutation
- **AND** the connected identity remains the only source of the actor

#### Scenario: A connected client chooses its initial workspace

- **WHEN** `get_session` reports complete onboarding with an authorized initial workspace
- **THEN** the client can use that workspace identifier in subsequent Finance calls
- **AND** Finance inputs do not require changes to the existing account-tool shapes

### Requirement: Finance context returns authorized choices without creating resources

`get_finance_context` SHALL accept exactly required `workspace_id` and optional `book_id` and `cursor`. Without a book filter it SHALL return authorized active book summaries; with one it SHALL return that book's active account summaries. Results SHALL include applicable names, IDs, currency metadata, workspace time zone, current local date, an authorized self choice, and `next_cursor`, without ledger rows or balances. Inspection MUST NOT create resources.

#### Scenario: A new workspace has no financial setup

- **WHEN** an authorized user requests Finance context and no authorized active book exists
- **THEN** the result contains an empty book collection and the available workspace date and attribution context
- **AND** no book, account, grant, expense, audit event, or receipt is created

#### Scenario: Existing financial resources are available

- **WHEN** an authorized user requests books or accounts for a permitted book
- **THEN** the result contains only active resources visible through the user's current book access
- **AND** it supplies the applicable currency and minor unit for resolving expense input
- **AND** it does not disclose transaction descriptions, amounts, account balances, or unrelated resources

### Requirement: Finance context pages preserve scope and current permissions

Finance context SHALL return at most 50 books or accounts per page, ordered by `(created_at, id)` using keyset continuation. A continuation cursor SHALL be validated against the request's workspace and book filter. Every page SHALL recheck current access; cursor contents MUST NOT establish authorization. `next_cursor` SHALL be null when no further authorized results remain.

#### Scenario: A user continues a resource list

- **WHEN** more than 50 authorized active resources match the same context request
- **THEN** the first response contains at most 50 rows and a continuation cursor
- **AND** continuing under the same scope returns the following ordered rows without repeating the previous page

#### Scenario: A cursor is reused outside its scope or after revocation

- **WHEN** a cursor belongs to another workspace or book filter, or the user's access has been revoked
- **THEN** an incompatible cursor is rejected and revoked resources are not returned
- **AND** possession of the cursor does not permit resource discovery

### Requirement: Book creation establishes one explicit financial owner

`create_book` SHALL accept exactly `request_id`, `workspace_id`, `name`, and `currency`. An active workspace member MAY create a book after accepted setup review. The operation SHALL atomically create the book and one unrevoked owner grant for that verified member, deriving `minor_unit` from supported currency metadata. It MUST NOT change existing book names, currencies, or permissions to satisfy a new request.

#### Scenario: The user accepts creation of a financial book

- **WHEN** an active member submits valid reviewed book values with a new request identifier
- **THEN** one book is created with its selected currency and canonical minor unit
- **AND** its sole initial unrevoked owner grant belongs to the verified actor
- **AND** the operation returns the created book identifier and normalized details

#### Scenario: The caller lacks active workspace membership

- **WHEN** a caller without active membership attempts to create a book
- **THEN** book creation and owner-grant creation are denied
- **AND** an identity link or basic-person grant cannot substitute for membership

### Requirement: Account creation uses an authorized book and explicit opening balance

`create_account` SHALL accept exactly `request_id`, `workspace_id`, `book_id`, `name`, `currency`, `opening_balance`, and `person_id`. Its book access SHALL be owner or editor, its currency SHALL match that book, and its opening balance SHALL be an explicit valid decimal string. `person_id` SHALL be null or the verified active self under the attribution rules. Existing accounts MUST NOT be silently reused by name or modified.

#### Scenario: The user accepts a new account

- **WHEN** a book owner or editor submits accepted account values, including a valid finite negative, zero, or positive opening balance
- **THEN** one account is created in that book with matching currency and the accepted attribution
- **AND** the operation returns the account identifier and normalized details

#### Scenario: An account request conflicts with its selected book

- **WHEN** a request supplies another book's currency, an inaccessible book, or an invalid opening balance
- **THEN** the account is rejected without changing that book or another account

### Requirement: Expense recording creates only a sourced expense entry

`record_expense` SHALL accept exactly `request_id`, `workspace_id`, `book_id`, `source_account_id`, `amount`, `currency`, `occurred_on`, `description`, and `beneficiary_person_id`. It SHALL create an expense in the authorized book using its matching active source account, with no destination, replacement, or void metadata. The beneficiary SHALL be null or the verified active self under the attribution rules.

#### Scenario: A complete expense is accepted

- **WHEN** a book owner or editor submits a valid positive amount, matching currency, concrete date, description, source account, and resolved beneficiary
- **THEN** one transaction of kind `expense` is created in that book
- **AND** its source is the selected account and its destination is null
- **AND** its creator and updater are the verified actor, with an initial version of one

#### Scenario: An account belongs to another protected scope

- **WHEN** the source account belongs to another workspace or book, has a different currency, or is archived
- **THEN** no expense is created or moved to another account
- **AND** the failure does not disclose the unrelated account's details

### Requirement: Currency metadata is explicit and versioned

Financial services SHALL use a versioned snapshot of current assigned ISO 4217 currency metadata packaged with the application. Supported currencies SHALL have a numeric minor unit from zero through four. Book creation SHALL derive that unit rather than accept it from the client. Account and expense currency SHALL be explicit and match the book. Language, location, and the word `pesos` alone MUST NOT determine currency.

#### Scenario: Currency is missing or ambiguous in the conversation

- **WHEN** a purchase mentions pesos without a currency-resolving accepted book or explicit country-specific currency
- **THEN** the assistant asks a focused currency question
- **AND** it does not infer MXN from Spanish, client time zone, residence, or server region

#### Scenario: A currency is unsupported or conflicts with the book

- **WHEN** an input uses an unknown, withdrawn, noncanonical, or nonnumeric-minor-unit currency, or differs from the selected book's currency
- **THEN** the service rejects the write before storing a financial row
- **AND** it does not convert currencies or replace the book currency

### Requirement: Monetary input preserves exact decimal value

Amounts and opening balances SHALL be decimal strings validated without binary floating-point arithmetic. Services SHALL reject nonfinite values, exponent notation, locale separators, excess currency scale including trailing zeros, and values outside `numeric(20,4)`. Expenses SHALL be positive; opening balances MAY be negative or zero. Accepted values SHALL be canonically normalized for storage, output, and receipt hashing without rounding.

#### Scenario: A monetary value would be rounded or lose precision

- **WHEN** input contains a JSON number, `NaN`, infinity, exponent notation, excess fractional places, or more integer precision than `numeric(20,4)` supports
- **THEN** the write is rejected without rounding or truncation
- **AND** `100.000` is rejected for a currency with two minor-unit places even though the excess digit is zero

#### Scenario: Equivalent accepted representations are retried

- **WHEN** valid decimal strings represent the same amount within the selected currency's permitted scale
- **THEN** normalization produces one exact canonical amount and payload fingerprint
- **AND** expense zero or negative amounts remain invalid while valid negative opening balances remain permitted

### Requirement: Dates are concrete and explained in workspace time

`occurred_on` SHALL be a real Gregorian date in exact `YYYY-MM-DD` form. A missing date SHALL be proposed from reliable message-time context in the workspace zone, otherwise from its server-provided current local date, with the basis disclosed for acceptance. Ambiguous dates SHALL be clarified. The concrete resolved date SHALL be frozen before submission and identical retries, rather than recomputed from `today`.

#### Scenario: The user omits a purchase date

- **WHEN** an expense request has no date or reliable message-time context and the server supplies the workspace's current local date
- **THEN** the assistant proposes that concrete date as today's fallback for the user's acceptance
- **AND** it does not silently use the execution host's date or a UTC date

#### Scenario: The message and server dates differ

- **WHEN** reliable message-time context identifies a message date in the workspace zone that differs from the current server-provided local date
- **THEN** the assistant proposes the concrete message-local date and explains its basis for acceptance
- **AND** it does not label a prior message date as today or silently change it to the execution date

#### Scenario: A date is impossible, ambiguous, or changes across a retry

- **WHEN** the user supplies an ambiguous date or a tool input contains an impossible date, timestamp, or relative date label
- **THEN** the assistant clarifies ambiguity and the service rejects invalid concrete-date input
- **AND** retrying an already submitted action after local midnight retains its original resolved date

### Requirement: Attribution is explicit self or shared and unassigned

The initial Finance tools SHALL accept only null or the actor's verified self person for account and expense attribution. A nonnull person SHALL have a matching verified identity link, current basic-person access, an active person, and matching workspace. Null SHALL represent a clearly accepted shared or unassigned choice. Another person's identity, a same-name match, or general workspace membership MUST NOT supply attribution authority.

#### Scenario: The user records an expense for the verified self

- **WHEN** the accepted attribution is self and the active identity link and basic-person access remain valid
- **THEN** the applicable person field uses that verified person identifier
- **AND** the assistant need not ask again for an unchanged attribution already accepted in the current conversation

#### Scenario: The user chooses shared or unassigned attribution

- **WHEN** the user clearly accepts a shared or unassigned account or expense
- **THEN** the applicable person field is null
- **AND** the response does not imply that a particular person owns or benefited from that resource

#### Scenario: The user names another person or loses self access

- **WHEN** attribution targets another person, an archived self, a mismatched workspace, a removed identity link, or revoked basic-person access
- **THEN** that attributed write is rejected
- **AND** the assistant explains that broader managed-person operations are not yet supported rather than guessing a person or silently changing attribution to null

### Requirement: Financial setup is guided only when necessary

The assistant SHALL check account state and authorized Finance context, retain the original purchase request, and reuse accepted authorized selections. It SHALL ask only missing or ambiguous details. When setup is needed it MAY suggest book `Everyday`, account `Main account`, and opening balance `0` as English defaults, but SHALL obtain acceptance of a concise review including names, currency, balance, and attribution before creation.

#### Scenario: A hamburger request lacks setup and expense details

- **WHEN** the user says `compre una hamburguesa` and no usable financial setup exists
- **THEN** the assistant retains the hamburger description, offers the required setup choices, and asks for missing expense details such as amount and unresolved currency
- **AND** it does not invent the price, create resources on inspection, or claim the purchase was recorded

#### Scenario: The user has existing accepted resources and values

- **WHEN** the current context and conversation already establish authorized resources and accepted setup values
- **THEN** the assistant reuses those choices and asks only unresolved expense details
- **AND** it does not repeat onboarding or create another book or account merely because the expense is new

#### Scenario: The user supplies custom names or descriptions

- **WHEN** setup or expense text includes user-provided names or descriptions in another language
- **THEN** the service preserves that text subject to whitespace and length validation
- **AND** generated English suggestions do not translate or replace the user's content

### Requirement: Expense submission follows the user's resolved intent

A complete explicit instruction to record an expense SHALL authorize submission without redundant confirmation. Proposed defaults, ambiguous resources, unresolved dates, and unresolved attribution SHALL require acceptance or clarification first. One concise review MAY authorize both setup and the expense when all actions are clear. Corrections SHALL update that review; cancellation before submission SHALL perform no writes.

#### Scenario: The user gives an already resolved recording instruction

- **WHEN** the user explicitly asks to record a purchase and every required value is explicit or already accepted in the conversation
- **THEN** the assistant submits the expense without asking the user to reconfirm the same resolved instruction
- **AND** selecting an account or amount does not authorize unrelated resource creation

#### Scenario: The assistant proposes missing values or multiple resources match

- **WHEN** a proposed default, today assumption, attribution choice, or multiple matching books or accounts leaves the action unresolved
- **THEN** the assistant requests a focused choice or concise complete review
- **AND** it submits only after acceptance of those values

#### Scenario: The user corrects or cancels the proposed action

- **WHEN** the user changes a proposed value or cancels before the affected calls are submitted
- **THEN** a correction is reflected before submission and cancellation performs no writes
- **AND** a canceled expense does not remove separately accepted resources that were already created

### Requirement: Every Finance operation rechecks independent authorization

Finance operations SHALL recheck verified session and delegated consent, active workspace membership, resource scope, and current domain permissions inside their transaction. Book context SHALL require an unrevoked owner, editor, or viewer book grant; account creation and expense writes SHALL require owner or editor. Active membership SHALL authorize only book creation, not access to an existing book. Recovery SHALL enforce the same current permissions.

#### Scenario: A viewer reads context and attempts a write

- **WHEN** an active member has only a viewer grant for a book
- **THEN** authorized book and account context can be returned
- **AND** account creation and expense recording in that book are denied

#### Scenario: Workspace ownership does not grant another book

- **WHEN** a workspace owner, member, or linked person lacks an unrevoked grant for an existing book
- **THEN** that book and its accounts are absent from discovery and its writes are denied
- **AND** supplying known resource identifiers does not bypass authorization

#### Scenario: Access is revoked while an operation waits

- **WHEN** a session, consent, membership, book grant, or applicable person grant is revoked before a waiting operation performs its transactional authorization checks
- **THEN** the operation fails without a new financial write
- **AND** previously returned context or an earlier successful receipt does not override the current denial

### Requirement: Archived and purging scopes cannot receive or recover actions

Financial reads and writes SHALL reject applicable archived workspaces, books, accounts, and attributed people. Confirmed purge states for the workspace, book, or applicable person SHALL block the scoped operation, including confirmed failed purges; completed or retired scopes SHALL not be recreated or restored through retries. Unrelated scopes MUST NOT be silently substituted.

#### Scenario: A selected scope becomes unavailable

- **WHEN** an applicable resource is archived or has an approved, deleting, completed, or confirmed failed purge state
- **THEN** its Finance operation or recovery fails with the appropriate controlled scope error
- **AND** the service does not reopen the resource, create a replacement, or write to another scope

### Requirement: Each mutation commits its resources audit and receipt atomically

Each accepted book, account, or expense mutation SHALL commit its resource changes, successful Finance audit, and completed operation receipt in one transaction. Successful Finance audit SHALL identify the book, verified actor, request, resource, and changed fields without copying descriptions or monetary values. A book's initial owner grant SHALL share its transaction. Failure before commit SHALL leave none of that action's writes committed.

#### Scenario: A failure occurs after the financial row is inserted

- **WHEN** an account or expense transaction fails while writing its successful audit or receipt
- **THEN** its financial row, successful audit, and receipt all roll back
- **AND** failure in book creation also rolls back its initial owner grant

#### Scenario: An expense succeeds

- **WHEN** the expense transaction commits
- **THEN** exactly one expense, its successful audit, and its completed receipt exist for the accepted action
- **AND** audit identifiers and changed-field names describe the action without embedding the user's expense description or amount

### Requirement: Mutation retries preserve identity payload and current access

Each separate mutation SHALL use its own UUID request identifier and bind its receipt to the verified actor, operation, normalized payload hash, and result IDs. Book, account, and expense receipts SHALL use `create_book`, `create_account`, and `create_transaction`. Identical retries SHALL return the original authorized result without duplicate writes or success audits. Conflicting actor, operation, or payload SHALL fail; purged receipts SHALL remain retired.

#### Scenario: Identical requests race or a response is uncertain

- **WHEN** identical calls race with the same request identifier or the client retries an uncertain result
- **THEN** at most one mutation and one set of successful audit records commit
- **AND** recovery with the unchanged identifier and payload returns `already_processed` only after current access and result scope are verified

#### Scenario: A request identifier is reused for another action

- **WHEN** the same identifier is supplied by another actor, for another operation, or with a different normalized payload
- **THEN** the call fails with a controlled request conflict and creates no replacement action
- **AND** no original result details are disclosed to the conflicting caller

#### Scenario: Separate accepted actions use different request identifiers

- **WHEN** the user separately accepts multiple book or account creations with distinct request identifiers
- **THEN** each authorized action may create its own resource even when names or values match
- **AND** idempotency does not impose one book per user, one account per book, or semantic deduplication across different identifiers

#### Scenario: A successful writer is later downgraded to viewer

- **WHEN** an actor retries a prior successful mutation after their book grant has become viewer-only
- **THEN** mutation recovery is denied under the current write-permission rules
- **AND** the earlier receipt does not turn read access into authority to replay a write

#### Scenario: The receipt has been retired or the payload needs a correction

- **WHEN** recovery encounters a purged receipt or the user changes values after an uncertain submission
- **THEN** a retired action is rejected and an uncertain action is first recovered using its original identifier and unchanged payload
- **AND** the client does not blindly use a fresh identifier or claim that a new submission corrects an already committed expense

### Requirement: Results report committed ledger outcomes and partial setup truthfully

Successful writes SHALL return resource identifiers, canonical accepted details, and status `created` or `already_processed`, without SQL or credentials. Only a committed expense or authorized receipt recovery SHALL justify saying the expense was recorded. Separate setup calls SHALL retain their own outcomes; later failure or cancellation MUST NOT imply earlier setup rolled back. Recording a ledger entry MUST NOT be described as making a bank payment.

#### Scenario: Setup succeeds but expense creation fails

- **WHEN** accepted book or account creation commits and a later account or expense call fails or is canceled
- **THEN** the assistant explains which setup resources exist and that the expense has not been recorded
- **AND** it can reuse those authorized resources without claiming the separate calls formed one rollback unit

#### Scenario: The expense is committed or recovered

- **WHEN** a successful response reports the created expense or its authorized retry recovery
- **THEN** the assistant can confirm the recorded amount, currency, date, selected account, and description
- **AND** it does not claim money was transferred, a bank was charged, or an external purchase was executed

### Requirement: Errors and unsupported requests preserve the narrow expense boundary

Finance failures SHALL use controlled English error codes and messages for invalid input, currency, amount, date, denied access, archived scope, pending purge, retired action, and request conflict, without SQL or unauthorized resource details. Income, transfers, corrections, balances, new managed people, sharing, budgets, files, Health, and purge execution SHALL remain unsupported rather than being approximated through expense tools.

#### Scenario: A caller requests a broader financial action

- **WHEN** a user asks to transfer money, record income, correct a committed expense, manage another person, or use another excluded operation
- **THEN** the assistant explains the unsupported operation
- **AND** it does not create an expense as a substitute or claim the requested operation succeeded

#### Scenario: A failed call exposes only a controlled error

- **WHEN** validation, access, scope, receipt conflict, or an unexpected backend failure prevents an action
- **THEN** the tool returns a controlled failure without raw database messages, connection details, or credentials
- **AND** the client does not interpret the failure as permission to repeat the action with a new identifier
