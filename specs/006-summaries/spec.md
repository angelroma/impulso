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

### Edge Cases

- A start date after the end date is refused.
- A workspace with accounts in several currencies gets one total per currency; amounts are never
  added across currencies or converted.
- At most 100 groups are returned.
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

### Key Entities

- **Summary**: a computed view over transactions; nothing is stored.

## Success Criteria

- **SC-001**: The totals of a summary equal the sum of the transactions listed for the same
  period and workspace, to the cent.
- **SC-002**: "This month" is answered without the user giving a date.

## Assumptions

- Google Sheets export and category budgets were rejected; summaries are read in the
  conversation only.
- Net is income minus expense for the period, not a change in account balances.

## Open Questions

- **Roll-up to parent categories**: each subcategory is its own group; there is no total per
  top-level category. Wanted?
- **More than 100 groups**: the rest are cut off without notice. Should the reply say so?
- **Comparison with a previous period** is not available. Wanted?

## Implementation Reference

- Tool: `get_summary`
- Code: `apps/supabase/functions/_shared/finance/reports.ts` (`getSummary`)
- Tests: `functions/tests/integration_test.ts` ("Transactions use defaults, retry safely and keep
  balances", "Projects track spending against their budget")
