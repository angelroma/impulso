# Feature Specification: Accounts

**Feature Branch**: n/a (retroactive; built on `refactor`)

**Created**: 2026-11-09

**Status**: Implemented (retroactive spec)

**Input**: "Accounts are only real accounts (banks, cards, cash). Rename accounts, move accounts
between workspaces. Have the account type: saving, credit card, etc., based on the standards."

## User Scenarios & Testing

### User Story 1 - Add the places money lives (Priority: P1)

The user adds each real account with a name, a type and what it holds today. The balance then
follows every transaction.

**Why this priority**: a transaction needs an account.

**Independent Test**: create a checking account with an opening balance, record an expense and
see the balance drop by that amount.

**Acceptance Scenarios**:

1. **Given** a workspace with no accounts, **When** an account is created with only a name,
   **Then** it is a checking account in the workspace currency with a zero balance and is the
   default.
2. **Given** an account opened with 1,000.00, **When** an expense of 250.50 is recorded on it,
   **Then** its balance is 749.50.
3. **Given** a credit card, **When** it is created owing 5,000, **Then** the opening balance is
   recorded as -5,000.00; a positive opening balance is refused.

---

### User Story 2 - Choose the usual account (Priority: P2)

One account per workspace is the default, so a transaction recorded without naming an account
lands there.

**Why this priority**: removes a question from almost every transaction.

**Independent Test**: make a second account the default and record a transaction without an
account.

**Acceptance Scenarios**:

1. **Given** two accounts, **When** the second is set as default, **Then** the first stops being
   the default.
2. **Given** the default account, **When** it is archived, **Then** the oldest remaining active
   account becomes the default.

---

### User Story 3 - Move an account to another workspace (Priority: P3)

The user realises an account belongs in another workspace and moves it with its whole history.

**Why this priority**: corrects setup mistakes without re-entering data.

**Independent Test**: move an account with transactions and confirm they appear in the target
with the same categories and payees by name.

**Acceptance Scenarios**:

1. **Given** an account with transactions, **When** it is moved, **Then** all its transactions
   move with it and the reply says how many.
2. **Given** moved transactions with categories and payees, **When** the target lacks some of
   them, **Then** they are created there with the same name (and kind, and parent where
   possible); existing ones are reused.
3. **Given** moved transactions linked to projects, **When** the move completes, **Then** the
   project links are cleared.
4. **Given** an account that takes part in any transfer, **When** a move is requested, **Then**
   it is refused until those transfers are moved or deleted.

### Edge Cases

- Two active accounts in a workspace cannot share a name (case-insensitive). Moving an account
  into a workspace that already uses its name is refused.
- An account's currency may differ from its workspace's; it cannot change once the account has
  any transaction.
- Changing an account to a card or loan while its opening balance is positive is refused.
- Archiving an already archived account succeeds and reports it was already archived.
- An archived account cannot be edited or moved, cannot receive new transactions, and is left
  out of context; its past transactions stay.
- Unsetting the default directly is refused.
- A moved account becomes the default in the target only if the target had no active accounts.

## Requirements

### Functional Requirements

- **FR-001**: A user MUST be able to create an account with a name and, optionally, a type, a
  currency, an opening balance and the default flag.
- **FR-002**: The type MUST be one of: cash, checking, savings, investment, credit_card, loan.
  It defaults to checking.
- **FR-003**: Card and loan accounts are liabilities: their opening balance MUST be zero or
  negative.
- **FR-004**: The balance MUST equal opening balance + income − expenses − transfers out +
  transfers in, counting only transactions that are not deleted.
- **FR-005**: While a workspace has active accounts exactly one MUST be the default. The first
  account becomes it automatically.
- **FR-006**: A user MUST be able to rename an account and change its type, opening balance and
  default flag.
- **FR-007**: The currency MUST be a supported code and MUST NOT change once the account has
  transactions.
- **FR-008**: A user MUST be able to archive an account; it is never physically deleted.
- **FR-009**: A user MUST be able to move an account with all its transactions to another of
  their workspaces, mapping categories and payees by name and clearing project links.
- **FR-010**: An account involved in transfers MUST NOT be moved.

### Key Entities

- **Account**: a real place money is held or owed. Has a name, a type, a currency, an opening
  balance, a default flag and an archived date. Belongs to one workspace.
- **Account type**: reference data; each type says whether it is a liability.

## Success Criteria

- **SC-001**: After any recorded, edited, deleted or restored transaction the account balance
  reported matches the formula in FR-004 to the cent.
- **SC-002**: Moving an account loses no transaction and leaves no reference pointing at the
  source workspace.
- **SC-003**: A transaction can be recorded without naming an account whenever the workspace has
  one.

## Assumptions

- Debts are not accounts unless they are a real card or loan account; other debts are projects
  (see 005).
- Balances are not converted between currencies.

## Open Questions

- **No unarchive**: an archived account cannot be restored through the tools. Intended?
- **Liability balance over time**: only the opening balance of a card or loan is checked; later
  transactions can push it positive. Acceptable (overpayment), or should it warn?
- **Total across accounts**: context lists each balance but no net worth. Wanted?

## Implementation Reference

- Tool: `manage_account` (create, update, archive, move)
- Code: `apps/supabase/functions/_shared/finance/accounts.ts`, `common.ts` (`accountBalances`,
  `activeAccount`, `mapCategory`, `mapPayee`)
- Schema: `apps/supabase/schemas/finance/tables/accounts.sql`, `account_types.sql`
- Tests: `functions/tests/integration_test.ts` ("Guards keep debts negative…", "Transactions and
  accounts move between independent workspaces"), `tests/database/impulso_schema.test.sql`
