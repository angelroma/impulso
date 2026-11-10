# Feature Specification: Transactions

**Feature Branch**: n/a (retroactive; built on `refactor`)

**Created**: 2026-11-09

**Status**: Implemented (retroactive spec)

**Input**: "Record income, expenses and transfers from a conversation with as few questions as
possible. Edit them, delete them, move records between workspaces."

## User Scenarios & Testing

### User Story 1 - Record money in or out in one line (Priority: P1)

The user says "250.50 at Oxxo". The system fills the rest: default workspace, default account,
today's date and the payee's default category, and answers with the new balance.

**Why this priority**: it is the reason the product exists.

**Independent Test**: with one workspace and one account, record an expense giving only kind,
amount and payee; check the transaction and the returned balance.

**Acceptance Scenarios**:

1. **Given** a default workspace and account, **When** an expense is recorded with only an
   amount and a payee, **Then** it is saved on the default account, dated today in the workspace
   time zone, with the payee's default category, and the reply includes the account's new
   balance.
2. **Given** a recorded transaction, **When** the same request is sent again with the same
   request id, **Then** no second transaction is created and the original is returned as already
   processed.
3. **Given** an expense category, **When** it is used on an income, **Then** the request is
   refused.

---

### User Story 2 - Move money between own accounts (Priority: P2)

The user transfers from one account to another. It is a single record that lowers one balance
and raises the other, and it is neither income nor expense.

**Why this priority**: without it, paying a card or withdrawing cash distorts totals.

**Independent Test**: transfer 500 between two accounts in the same currency and check both
balances and that summaries do not count it.

**Acceptance Scenarios**:

1. **Given** two accounts in the same currency, **When** a transfer of 500 is recorded, **Then**
   the source drops by 500 and the destination rises by 500.
2. **Given** accounts in different currencies, **When** a transfer is requested, **Then** it is
   refused.
3. **Given** a transfer, **When** a category is supplied, or the destination equals the source,
   or the destination is missing, **Then** it is refused.

---

### User Story 3 - Fix a mistake (Priority: P2)

The user corrects any field of a transaction, deletes one recorded by mistake, and can bring a
deleted one back.

**Why this priority**: voice and chat entry produce mistakes; they must be cheap to fix.

**Independent Test**: edit the amount, delete the transaction, see the balance return, restore
it and see the balance change again.

**Acceptance Scenarios**:

1. **Given** a transaction, **When** only its amount is edited, **Then** every other field stays
   as it was.
2. **Given** an expense with a category, **When** its kind is changed to income, **Then** the
   category is cleared unless a matching one is given.
3. **Given** a deleted transaction, **When** an edit or move is attempted, **Then** it is
   refused until the transaction is restored.
4. **Given** a transaction on an account that was archived later, **When** another field is
   edited, **Then** the edit succeeds and the account link is kept.

---

### User Story 4 - Find past transactions (Priority: P2)

The user asks what they spent, where and when: newest first, filtered and searchable.

**Why this priority**: needed to review and to find the transaction to fix.

**Independent Test**: record several transactions and list them filtered by date range, payee
and a search word.

**Acceptance Scenarios**:

1. **Given** more transactions than the page size, **When** they are listed, **Then** the newest
   page is returned with a cursor that returns the next page.
2. **Given** a search word, **When** listing, **Then** transactions whose payee name or notes
   contain it are returned, without regard to case.
3. **Given** deleted transactions, **When** listing normally, **Then** they are left out; when
   deleted ones are asked for, they are included and marked.

---

### User Story 5 - Move a transaction to another workspace (Priority: P3)

The user recorded something in the wrong workspace and moves it.

**Why this priority**: corrects a rarer mistake without re-entering it.

**Independent Test**: move an expense to another workspace and see it there with the same
category and payee names.

**Acceptance Scenarios**:

1. **Given** a transaction, **When** it is moved to another workspace, **Then** it lands on the
   named account (or that workspace's default), its category and payee are matched by name or
   created, and its project link is cleared.
2. **Given** a target account in a different currency, **When** the move is requested, **Then**
   it is refused.
3. **Given** a transfer, **When** it is moved, **Then** a destination account in the new
   workspace must be given.

### Edge Cases

- Amounts are positive with up to two decimals and up to twelve whole digits; the kind gives
  the direction.
- Recording on an archived account or a closed project is refused; links that already exist on a
  transaction may stay when it is edited.
- A request id already used by another user is refused.
- No default account and no account named: the request is refused with a prompt to choose one.
- An account filter matches transfers in either direction.
- Deleting an already deleted transaction, or restoring one that is not deleted, succeeds.
- Notes are limited to 2,000 characters.

## Requirements

### Functional Requirements

- **FR-001**: A user MUST be able to record a transaction of kind income, expense or transfer
  with a positive amount.
- **FR-002**: Missing values MUST default to: the default workspace, its default account, today
  in the workspace time zone, and the payee's default category.
- **FR-003**: Recording MUST be idempotent on a client-supplied request id.
- **FR-004**: A transaction's category MUST be of the same kind as the transaction; transfers
  MUST NOT have a category.
- **FR-005**: A transfer MUST be a single record with a source and a different destination
  account in the same currency.
- **FR-006**: A transaction MAY carry a payee, a category, a project and notes; all are
  optional.
- **FR-007**: A user MUST be able to edit any of: kind, amount, date, account, destination
  account, payee, category, project and notes. Unmentioned fields MUST stay unchanged.
- **FR-008**: Deleting MUST be reversible: a deleted transaction is hidden from balances, lists,
  summaries and project progress, and can be restored.
- **FR-009**: A user MUST be able to move a transaction to another of their workspaces, keeping
  the same currency.
- **FR-010**: A user MUST be able to list transactions newest first, in pages of 25 by default
  and at most 100, filtered by date range, account, category, payee, project and kind, and
  searched by payee name or notes.
- **FR-011**: Every account, category, payee and project on a transaction MUST belong to the
  transaction's workspace.

### Key Entities

- **Transaction**: one movement of money. Has a kind, an amount, a date, an account, an optional
  destination account (transfers), optional payee, category, project and notes, a request id and
  a deleted date.
- **Transaction kind**: reference data: income, expense, transfer.

## Success Criteria

- **SC-001**: A typical expense is recorded from one sentence with no follow-up question.
- **SC-002**: Retrying a request never creates a duplicate.
- **SC-003**: No transaction ever references a record of another workspace.
- **SC-004**: A deleted transaction can always be restored exactly as it was.

## Assumptions

- Recurring transactions, a cleared flag, tags and paired transfer rows were rejected and are
  out of scope.
- Amounts are in the account's currency; nothing is converted.
- Future-dated transactions are allowed.

## Open Questions

- **Retry with different data**: a repeated request id returns the original transaction even if
  the new request has a different amount or payee. Should a mismatch be reported?
- **Search scope**: search covers payee and notes, not category or account names. Enough?
- **Cross-currency transfers** are refused outright. Is a transfer with two amounts ever needed?

## Implementation Reference

- Tools: `record_transaction`, `update_transaction` (edit, delete, restore, move),
  `list_transactions`
- Code: `apps/supabase/functions/_shared/finance/transactions.ts`, `reports.ts`
  (`listTransactions`), `finance.ts` (request-id lock)
- Schema: `apps/supabase/schemas/finance/tables/transactions.sql`, `transaction_kinds.sql`
- Tests: `functions/tests/integration_test.ts` ("Transactions use defaults, retry safely and keep
  balances", "Transactions and accounts move…"), `oauth_mcp_integration_test.ts` ("…records an
  expense once"), `tests/database/impulso_schema.test.sql`
