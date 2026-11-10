# Feature Specification: Summaries

**Feature Branch**: n/a (retroactive; built on `refactor`)

**Created**: 2026-11-09

**Status**: Implemented (retroactive spec)

**Input**: "Totals of income, expense and net for a period, optionally grouped by category,
payee, project, account or month."

## User Scenarios & Testing

### User Story 1 - How am I doing this month? (Priority: P1)

The user asks for a summary with no details and gets income, expense and net for the current
month so far.

**Why this priority**: the most common question after recording.

**Independent Test**: record one income and one expense this month and request a summary with no
parameters.

**Acceptance Scenarios**:

1. **Given** an income of 10,000 and an expense of 2,500 this month, **When** a summary is
   requested with no dates, **Then** it covers the first of the month through today and reports
   income 10,000, expense 2,500, net 7,500 and a count of 2.
2. **Given** a transfer in the period, **When** the summary is computed, **Then** the transfer
   is not counted.
3. **Given** a deleted transaction in the period, **When** the summary is computed, **Then** it
   is not counted.

---

### User Story 2 - Where did the money go? (Priority: P2)

The user asks for the same totals broken down by category, payee, project, account or month.

**Why this priority**: turns totals into something the user can act on.

**Independent Test**: record expenses in two categories and request a summary grouped by
category.

**Acceptance Scenarios**:

1. **Given** expenses in several categories, **When** grouped by category, **Then** each group
   shows its income, expense, net and count, the largest expense first, and subcategories show
   their parent.
2. **Given** a period of several months, **When** grouped by month, **Then** the groups are in
   chronological order.
3. **Given** transactions without a payee, **When** grouped by payee, **Then** they appear
   together as a group with no name.

---

### User Story 3 - Period report with the balance carried over (Priority: P2)

The user asks for a report of a period, for example October to November, and always gets the
same table: the balance carried over from before the period (positive or negative), each
transaction by date with the balance after it, and the closing balance.

**Why this priority**: the user reviews periods regularly and wants one fixed, simple format.

**Independent Test**: record transactions before and inside a period and request the report;
the first balance is the result of everything earlier and the last equals the closing balance.

**Acceptance Scenarios**:

1. **Given** accounts that start at 100 and -50 and an expense of 30 before the period, **When**
   the report is requested, **Then** the balance carried over is 20.
2. **Given** an income of 500 and an expense of 70.25 in the period, **When** the report is
   requested, **Then** the rows are oldest first with balances 520.00 and 449.75, and the closing
   balance is 449.75.
3. **Given** a transfer between two of the user's accounts, **When** the report covers all
   accounts, **Then** the row is listed with a change of 0.00; **When** it covers one of the two
   accounts, **Then** the transfer changes that account's balance.
4. **Given** a period with no transactions, **When** the report is requested, **Then** it still
   shows the balance carried over as both opening and closing balance.

### Edge Cases

- A report cannot be grouped, and an account can be chosen only for a report; both are refused.
- A report lists at most 300 transactions; when more exist the reply says so, and the balances
  still cover the whole period.
- Archived accounts are left out of a report of all accounts, as they are from the balances.
- A start date after the end date is refused.
- A workspace with accounts in several currencies gets one total per currency; amounts are never
  added across currencies or converted.
- At most 100 groups are returned; when more exist the reply says the list was cut off.
- A period with no transactions returns an empty list of totals.

## Requirements

### Functional Requirements

- **FR-001**: A user MUST be able to request income, expense, net and transaction count for a
  date range in one workspace.
- **FR-002**: The range MUST default to the first day of the current month through today, both
  in the workspace time zone. When only an end date is given, the range starts on the first day
  of that date's month.
- **FR-003**: Transfers and deleted transactions MUST NOT be counted.
- **FR-004**: Totals MUST be reported per currency.
- **FR-005**: A user MUST be able to group the result by category, payee, project, account or
  month.
- **FR-006**: Groups MUST be ordered by expense, largest first; months in chronological order.
- **FR-007**: When grouped by category, each group MUST also name its parent category.
- **FR-008**: Summaries MUST NOT change any data.
- **FR-009**: A user MUST be able to group a summary by top-level category, where each
  subcategory counts toward its parent. It is computed on read; nothing is stored.
- **FR-010**: When more than 100 groups exist, the reply MUST say the list was cut off. (No
  end-to-end test covers this yet.)
- **FR-011**: A user MUST be able to request a period report that gives, per currency, the
  balance carried over from before the start date, every transaction of the period oldest first
  with the balance after it, the period's income, expense and net transfers, and the closing
  balance.
- **FR-012**: The balance carried over MUST be the accounts' opening balances plus every
  transaction dated before the period; deleted transactions never count.
- **FR-013**: A report MUST cover all active accounts together by default, where a transfer
  between two of them changes nothing, or one chosen account, where a transfer counts on that
  account's side.
- **FR-014**: A report that reaches the last transaction MUST close on the balances the context
  shows.
- **FR-015**: The report is an option of `get_summary`, not a new tool. It is computed on read
  with exact decimals; nothing is stored.
- **FR-016**: The assistant MUST always present a report as the same table (Date, Concept,
  Category, Account, Income, Expense, Balance) with the balance carried over as the first row and
  the closing balance as the last, copying the amounts as returned. (Guidance to the assistant;
  the connector cannot enforce it.)
- **FR-017**: When more than 300 transactions fall in the period, the reply MUST say the list was
  cut off. (No end-to-end test covers this yet.)

### Key Entities

- **Summary**: a computed view over transactions; nothing is stored.
- **Period report**: a computed statement of a period with a running balance; nothing is stored.

## Success Criteria

- **SC-001**: The totals of a summary equal the sum of the transactions listed for the same
  period and workspace, to the cent.
- **SC-002**: "This month" is answered without the user giving a date.

## Assumptions

- Google Sheets export and category budgets were rejected; summaries are read in the
  conversation only.
- Net is income minus expense for the period, not a change in account balances.

## Clarifications

### Session 2026-11-09

- Q: Is a total per top-level category wanted? → A: Only if it follows best practice: nothing
  stored twice. It is computed from the transactions when asked for.
- Q: Should the reply say when groups were cut off? → A: Yes.
- Q: Is comparison with a previous period wanted? → A: Only when the user asks, and nothing is
  stored for it. The assistant requests two summaries; no new tool or table.
- Q: How should a report of a period look? → A: Always the same simple table: transactions by
  date, including the balance carried over from earlier periods, positive or negative.

## Implementation Reference

- Tool: `get_summary` (`statement: true` for the period report)
- Code: `apps/supabase/functions/_shared/finance/reports.ts` (`getSummary`, `statement`);
  table format in the instructions of `apps/supabase/functions/impulso-api/mcp.ts`
- Tests: `functions/tests/integration_test.ts` ("Transactions use defaults, retry safely and keep
  balances", "Projects track spending against their budget",
  "Restores and notices tell the user what a change affects",
  "A period report carries the earlier balance into a running balance")
