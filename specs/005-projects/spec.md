# Feature Specification: Projects

**Feature Branch**: n/a (retroactive; built on `refactor`)

**Created**: 2026-11-09

**Status**: Implemented (retroactive spec)

**Input**: "Projects with budget, spent and remaining. Debts are projects, not accounts: the
budget is the amount owed, payments are tagged to it, and it is closed when paid."

## User Scenarios & Testing

### User Story 1 - Track spending against a budget (Priority: P1)

The user groups the spending of one effort (a trip, a renovation) and sees how much of its
budget is left.

**Why this priority**: the main reason projects exist.

**Independent Test**: create a project with a budget, record an expense tagged to it and check
spent and remaining.

**Acceptance Scenarios**:

1. **Given** a project with a budget of 10,000, **When** an expense of 2,500 is tagged to it,
   **Then** spent is 2,500 and remaining is 7,500.
2. **Given** that project, **When** an income of 500 (a refund) is tagged to it, **Then** spent
   is 2,000 and remaining is 8,000.
3. **Given** a project without a budget, **When** expenses are tagged to it, **Then** spent is
   reported and remaining is omitted.

---

### User Story 2 - Pay down a debt (Priority: P2)

The user owes someone money that is not a card or loan account. They create a project whose
budget is the amount owed, tag each payment to it and close it when remaining reaches zero.

**Why this priority**: replaces debt accounts, which the user rejected.

**Independent Test**: create a debt project for 3,000, tag two payments of 1,500 and see
remaining at 0; close it.

**Acceptance Scenarios**:

1. **Given** a debt project of 3,000, **When** payments of 1,500 and 1,500 are tagged to it,
   **Then** remaining is 0.
2. **Given** a paid debt, **When** the project is closed, **Then** it no longer appears in
   context and cannot receive new transactions.

---

### User Story 3 - Close and reopen (Priority: P3)

The user closes a finished project and can reopen it if something else comes up.

**Why this priority**: keeps the list of choices short.

**Independent Test**: close a project, try to record against it (refused), reopen it and record.

**Acceptance Scenarios**:

1. **Given** a closed project, **When** a new transaction is tagged to it, **Then** it is
   refused.
2. **Given** a closed project, **When** it is reopened, **Then** it appears in context again
   with the same spent and remaining.
3. **Given** a transaction already tagged to a project that was closed later, **When** another
   field of the transaction is edited, **Then** the edit succeeds and the tag is kept.

### Edge Cases

- Project names are unique per workspace (case-insensitive), closed projects included.
- A budget, when given, must be greater than zero. An end date cannot be before the start date.
- Overspending makes remaining negative; it is reported, not blocked.
- Only transactions on accounts in the workspace currency count toward spent.
- Deleted transactions and transfers do not count toward spent.
- Moving a transaction or an account to another workspace clears the project tag, because
  projects do not cross workspaces.

## Requirements

### Functional Requirements

- **FR-001**: A user MUST be able to create a project with a name and, optionally, a budget, a
  start date, an end date and notes.
- **FR-002**: A user MUST be able to change a project's name, budget, dates and notes, and clear
  the optional ones.
- **FR-003**: Spent MUST equal tagged expenses minus tagged income, over transactions that are
  not deleted and are on accounts in the workspace currency.
- **FR-004**: Remaining MUST equal budget minus spent and is reported only when a budget is set.
- **FR-005**: A project is active or closed. A user MUST be able to close and reopen it.
- **FR-006**: New transactions MUST NOT be tagged to a closed project.
- **FR-007**: Context MUST list only active projects, each with budget, spent and remaining.
- **FR-008**: A project belongs to one workspace; only that workspace's transactions can be
  tagged to it.
- **FR-009**: The reply to recording or editing a transfer tagged to a project MUST say that it
  does not count toward the project, so the assistant can ask whether it should be an expense
  or an income instead.
- **FR-010**: When a project name is already taken, the reply MUST say whether the existing
  project is active or closed.
- **FR-011**: Project progress MUST report tagged transactions left out for being in another
  currency: how many and their total per currency.

### Key Entities

- **Project**: a named effort or debt whose spending is tracked. Has a name, an optional budget,
  optional start and end dates, notes and a status.
- **Project status**: reference data: active, closed.

## Success Criteria

- **SC-001**: Spent and remaining reported for a project always match its tagged transactions to
  the cent.
- **SC-002**: A debt can be followed from the amount owed down to zero without a debt account.

## Assumptions

- Category budgets were rejected; the project budget is the only budget.
- Start and end dates are informational; they do not limit which transactions can be tagged.

## Clarifications

### Session 2026-11-09

- Q: Should a transfer tagged to a project count toward spent? → A: Not automatically. A project
  has money spent on it and money earned from it, so the assistant asks the user which one it
  is and records it as an expense or an income. Every reply ends with a short summary of what
  was done, so the user can ask for a correction.
- Q: Should a closed project's name be reusable? → A: No. Equal names are confusing. The user is
  told the name is taken and the assistant suggests another.
- Q: Should transactions in another currency count toward spent? → A: No, they stay apart, but
  the user must be told.
- Q: How is money owed to the user modelled? → A: With the existing model, and the assistant
  suggests how. Convention: a project per loan; lending the money is an expense tagged to it,
  each repayment is an income tagged to it, and it is closed when spent is back to zero.

## Implementation Reference

- Tool: `manage_project` (create, update, close, reopen)
- Code: `apps/supabase/functions/_shared/finance/projects.ts`, `common.ts` (`projectProgress`,
  `activeProject`)
- Schema: `apps/supabase/schemas/finance/tables/projects.sql`, `project_statuses.sql`
- Tests: `functions/tests/integration_test.ts` ("Projects track spending against their
  budget",
  "Restores and notices tell the user what a change affects"),
  `tests/database/impulso_schema.test.sql`
