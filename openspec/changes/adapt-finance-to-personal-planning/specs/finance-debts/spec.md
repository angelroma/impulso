# Spec Delta

## Purpose

Track manually maintained loans and credit cards through their authorized financial accounts, accepted repayment expectations, and actual payments without inventing terms or counting principal as an expense.

## ADDED Requirements

### Requirement: Debt identity and balances use the financial account

Each tracked loan or credit card SHALL refer to one authorized liability account in the same workspace, book, and currency. Debt metadata MUST NOT create another balance. The account's signed net position SHALL distinguish money owed from a positive credit, using its reviewed opening baseline and actual nonvoid movements.

#### Scenario: A loan already has an opening balance

- **WHEN** the user accepts a dated opening amount for a loan and associates its debt details
- **THEN** the debt balance is obtained from that account without adding the opening principal again
- **AND** a balance requested before the supported baseline is reported as unavailable rather than zero

#### Scenario: A card has been overpaid

- **WHEN** a card account's signed balance becomes positive after an accepted payment
- **THEN** the result identifies the positive credit separately from an amount owed
- **AND** it does not reverse the sign merely because the account is a liability account

### Requirement: Repayment terms preserve unknown and accepted values

Debt terms and repayment expectations SHALL contain only accepted user or reviewed source values. Missing rates, principal, interest, fees, statement dates, and installment counts SHALL remain unknown. The system MUST NOT infer amortization, accrue automatic interest, or promise a payoff date from incomplete terms.

#### Scenario: A monthly loan row has no component breakdown

- **WHEN** a reviewed workbook row contains a monthly expected payment but no accepted principal, interest, or fee values
- **THEN** that payment remains an expectation with unresolved component information
- **AND** the row does not become a posted expense, invented amortization schedule, or completed payment

#### Scenario: Accepted terms change prospectively

- **WHEN** the user accepts new terms or later installment expectations
- **THEN** future expectations reflect the accepted effective scope
- **AND** previously posted movements and reconciled payment evidence remain unchanged

### Requirement: Principal and financing costs have distinct actual effects

Borrowing and principal repayments SHALL use transfers between the liability and asset accounts. Card purchases and accepted interest or fees SHALL use expenses. A reviewed payment with multiple components SHALL post all component movements atomically, with exact totals and one recoverable operation; a retry MUST NOT duplicate any component.

#### Scenario: A loan is received or principal is repaid

- **WHEN** an accepted transfer records loan proceeds into a bank account or principal from that bank account into the loan account
- **THEN** the asset and liability balances change by the same amount in opposite directions
- **AND** the principal transfer creates neither earned income nor an operating expense

#### Scenario: A payment has accepted principal and financing costs

- **WHEN** an accepted payment contains principal, interest, and fee components
- **THEN** the component amounts sum exactly to the accepted payment total and their account effects are recorded together
- **AND** principal reduces the debt while only interest and fees contribute to expense totals
- **AND** failure rolls back every component, matching link, audit event, and operation receipt

#### Scenario: A purchase on a card is later paid

- **WHEN** a recorded card purchase is followed by an accepted bank-to-card payment
- **THEN** the purchase contributes one expense and the payment reduces the liability through a transfer
- **AND** the payment does not create a second purchase expense

### Requirement: Due payment state comes from expectations and matched evidence

Debt due amounts SHALL use dated repayment expectations and explicit links to actual movement components. Unpaid, partial, paid, and excess-payment results SHALL reflect those links; overdue status SHALL use the workspace date. Unknown component amounts SHALL remain unresolved, and cancellation of an expectation MUST NOT void an actual movement.

#### Scenario: A due installment is partly settled

- **WHEN** accepted actual components settle only part of a known installment amount and its due date has passed
- **THEN** the result reports the settled and remaining amounts, partial payment, and overdue status
- **AND** it does not report the whole installment as paid because a payment was mentioned

#### Scenario: A matching link conflicts with the installment

- **WHEN** an allocation crosses a workspace, book, currency, or debt account, or allocates more than the available actual component
- **THEN** the allocation is rejected without changing the payment or due amount
- **AND** concurrent matching cannot reuse the same available amount twice

#### Scenario: A matched payment is voided or an expectation is canceled

- **WHEN** an authorized correction voids a matched actual movement or cancels its expected installment
- **THEN** payment status is recomputed from the remaining valid evidence
- **AND** cancellation alone does not erase the actual ledger movement

### Requirement: Debt operations retain financial authorization and truthful limits

Debt reads SHALL require current book read access and debt writes SHALL require current book write access, active scopes, and valid session consent. Responses SHALL use controlled errors and distinguish recording from external execution. Bank connections, bank payments, automatic statement retrieval, and automatic interest calculation SHALL remain unsupported.

#### Scenario: A caller can access a person but not the debt book

- **WHEN** a caller has only workspace membership, basic-person access, or a revoked book grant
- **THEN** the debt balance, terms, schedule, and payment mutations are denied
- **AND** no account details or expected amounts are disclosed

#### Scenario: A user asks Impulso to pay a lender

- **WHEN** the user asks to execute a bank payment
- **THEN** the assistant explains the unsupported external operation
- **AND** an accepted ledger record is described only as a record, not proof that a lender received money
