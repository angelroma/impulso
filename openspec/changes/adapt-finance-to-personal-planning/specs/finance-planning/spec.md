# Spec Delta

## Purpose

Keep budgets, expected cash flows, recurring commitments, and their settlement separate from actual ledger activity so Impulso can compare monthly plans with completed financial actions.

## ADDED Requirements

### Requirement: Expected activity is separate from posted money

Plans SHALL describe expected income, expense, or transfer with an explicit period, exact amount, currency, and accepted scope. A known due date SHALL be optional. Creating, changing, or canceling a plan MUST NOT create a ledger entry or change an actual balance. Unknown dates and accounts SHALL remain unresolved rather than inferred.

#### Scenario: A monthly commitment has no exact payment date

- **WHEN** a user plans a subscription for a named month without supplying its due date
- **THEN** the plan retains month precision and no actual transaction exists
- **AND** it is not labeled overdue from an invented first-of-month date

#### Scenario: Future salary is planned

- **WHEN** accepted salary amounts are entered for future months
- **THEN** reports identify them as expected income rather than money already received
- **AND** the current account balance is unchanged

### Requirement: Recurring expectations have explicit bounded schedules

Recurring plans SHALL use accepted monthly or annual intervals, a start period, an optional end period, and an explicit day policy when a due day is supplied. Materialization SHALL be bounded and idempotent by rule and occurrence period. Editing a rule SHALL preserve settled history and require an expected version; unsupported schedule interpretations SHALL require clarification.

#### Scenario: A recurring payment reaches a short month

- **WHEN** an accepted day-31 rule uses the accepted last-day policy and materializes February
- **THEN** that occurrence uses the actual last day of February
- **AND** repeating materialization creates no duplicate occurrence

#### Scenario: A recurring amount changes after a payment

- **WHEN** a rule is changed with its current version after an occurrence has been settled
- **THEN** the paid occurrence and its accepted amounts remain unchanged
- **AND** only eligible future occurrences use the revised rule

### Requirement: Settlement references real matching movements

Settlements SHALL link authorized, nonvoid actual movement components to compatible plan lines. Scope, currency, kind, accounts when specified, and allocated amounts SHALL match. The service SHALL prevent allocating more than a movement component's amount across plans and serialize concurrent allocations. A paid label alone SHALL never be proof of a movement.

#### Scenario: A payment partially settles a bill

- **WHEN** a compatible actual expense of 600 is allocated against a planned expense of 1000
- **THEN** the plan reports paid 600 and outstanding 400 without creating another expense
- **AND** the same actual 600 cannot also settle another plan in full

#### Scenario: A user supplies only a paid marker from a backup

- **WHEN** an imported row says paid but has no accepted compatible movement evidence
- **THEN** its marker remains source evidence requiring review
- **AND** it does not generate or settle an actual transaction automatically

### Requirement: Payment and due status remain independently truthful

Plans SHALL derive unpaid, partially_paid, paid, or overpaid state from current valid allocations and accepted expected amounts. Overdue SHALL depend on a known past due date and unpaid remainder in workspace time. Cancellation SHALL require an explicit action and preserve linked history. A corrected or voided payment SHALL update dependent settlement atomically or be rejected until reconciled.

#### Scenario: An accepted actual payment exceeds its expectation

- **WHEN** a compatible allocation of 1100 settles a plan of 1000
- **THEN** it reports overpaid by 100, with zero outstanding forecast remainder
- **AND** no negative future expense is fabricated

#### Scenario: A linked payment is corrected

- **WHEN** a correction would invalidate a settlement or leave its amount overallocated
- **THEN** payment and allocation changes succeed atomically after explicit reconciliation or the entire correction is rejected
- **AND** an old plan does not remain falsely paid

### Requirement: Budget limits do not duplicate expected spending

Budgets SHALL support explicit book, optional category and permitted person, interval, currency, and exact positive limit. Multiple category budgets SHALL be possible for one interval. Budget comparisons SHALL use compatible actual activity and disclose overlap between whole-book and category limits. Limits MUST NOT be added to planned cash outflow as another payment.

#### Scenario: A monthly food limit accompanies expected bills

- **WHEN** a book contains both a 3000 food budget and expected expenses for that month
- **THEN** budget use and remaining allowance are reported separately from the cash-flow forecast
- **AND** neither the limit nor an overlapping whole-book limit is counted as another expense

### Requirement: Planning writes use current permissions and safe versions

Planning reads SHALL require current book read access; mutations and receipt recovery SHALL require current write access. Mutations SHALL validate active scope, exact values, expected versions for changes, and current session and consent, and commit audit and receipt atomically. Dates, rule versions, and accepted values SHALL remain fixed on identical retries.

#### Scenario: Concurrent edits or revoked access affect a plan

- **WHEN** a stale version edits a plan or a viewer tries to cancel or settle one
- **THEN** the request fails without partial changes or disclosure of unrelated resources
- **AND** a repeated accepted materialization or settlement cannot duplicate allocations
