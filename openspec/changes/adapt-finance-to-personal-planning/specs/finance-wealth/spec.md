# Spec Delta

## Purpose

Maintain accepted savings goals and dated valuations alongside financial accounts so users can understand progress and net worth without duplicating investments, planned acquisitions, or earmarked funds.

## ADDED Requirements

### Requirement: Savings goals distinguish targets from existing money

A savings goal SHALL have an accepted positive target in one authorized book currency, with an optional target date. Targets and expected contributions SHALL remain plans rather than assets, income, or expenses. Changing or canceling a goal MUST NOT create, move, or erase actual account money.

#### Scenario: The user plans a future purchase

- **WHEN** the user accepts a savings target for a car, home, or other future purchase
- **THEN** the target is tracked as a goal with its accepted amount and optional date
- **AND** the desired purchase is not added to current assets or recorded as a completed expense

#### Scenario: A goal is canceled after money was contributed

- **WHEN** an authorized user cancels a goal
- **THEN** the goal no longer contributes future expectations and its allocation history remains inspectable
- **AND** existing transfers, balances, and recorded expenses remain unchanged

### Requirement: Goal allocations earmark available funds without duplication

Goal progress SHALL distinguish accepted account-funded allocations from expected contributions. New or increased allocations SHALL preserve same-book currency and current available assigned funds across all active goals. Allocations MUST NOT create another asset or bank movement; later funding shortfalls SHALL be disclosed rather than hidden by stale progress.

#### Scenario: Two goals share one savings account

- **WHEN** the user allocates funds from the same account to multiple goals
- **THEN** the total accepted active allocations cannot exceed the funds available for allocation from that account
- **AND** concurrent requests cannot allocate the same available funds twice
- **AND** the account value appears once in net worth, independently of its goal allocations

#### Scenario: An account later loses allocated funds

- **WHEN** spending, a correction, or a changed valuation makes active allocations exceed their supporting funds
- **THEN** goal results disclose the funding shortfall and distinguish earmarked amounts from available backing
- **AND** the assistant does not claim the affected goals are fully funded or silently invent replacement funds

#### Scenario: A planned contribution has not occurred

- **WHEN** a future monthly contribution is included in a goal plan
- **THEN** it contributes to the projection rather than current funded progress
- **AND** recording an accepted transfer and its matching allocation does not turn the contribution into an expense

### Requirement: Nonledger assets retain explicit ownership and provenance

An asset outside the ledger SHALL use an accepted identity, book currency, and reviewed ownership scope. Its value SHALL come only from accepted dated valuations with a source or note. Unknown values and planned acquisitions SHALL remain distinguishable from known owned assets; assets already represented by ledger accounts MUST NOT be added again.

#### Scenario: A manually tracked property has no accepted value

- **WHEN** the user identifies an owned property but has not accepted a valuation
- **THEN** the asset remains known with an unknown value and reports disclose the incomplete total
- **AND** the assistant does not derive a market value from a savings target, loan balance, or future purchase amount

#### Scenario: A workbook investment row already maps to an account

- **WHEN** a reviewed source row identifies holdings already represented by an investment account
- **THEN** that row maps to the existing account or its valuation
- **AND** it does not create an additional nonledger asset for the same holdings

### Requirement: Dated investment valuations replace only the report value

Each accepted valuation SHALL target exactly one eligible investment account or one nonledger asset in the same book and currency. Reports SHALL use an accepted valuation dated no later than the requested date, disclose its date and source, and distinguish it from the ledger balance. A valuation MUST NOT post income, alter transactions, or add its value on top of the same account balance.

#### Scenario: An investment account has contributions and a market valuation

- **WHEN** an investment account has a ledger balance and an accepted dated market value
- **THEN** net worth uses one disclosed value for that holding, replacing the account balance with the applicable valuation
- **AND** contributions remain transfers and the valuation difference is not reported as earned income or a cash movement

#### Scenario: A historical report encounters later or missing valuations

- **WHEN** a report date precedes a valuation or an owned asset has no applicable valuation
- **THEN** later values are excluded and any missing historical value is disclosed
- **AND** an applicable older valuation retains its date so it cannot be mistaken for a newly observed value

#### Scenario: A valuation is changed by an authorized correction

- **WHEN** a user accepts a corrected valuation
- **THEN** the report identifies the accepted replacement while preserving the earlier evidence and correction history
- **AND** the correction does not rewrite the holding's ledger transactions

### Requirement: Wealth operations preserve authorization and limited reporting claims

Wealth reads SHALL require current book read access and writes SHALL require current book write access, active scopes, and valid session consent. Results SHALL disclose unknown classification, ownership, baseline, or value that limits completeness. Market feeds, brokerage execution, automatic prices, foreign-exchange conversion, and investment advice SHALL remain unsupported.

#### Scenario: The user's books use different currencies

- **WHEN** a user requests wealth across books without an implemented accepted conversion basis
- **THEN** results remain separated by currency and authorized book scope
- **AND** the assistant does not sum unlike currencies into one net-worth amount

#### Scenario: The caller loses access or a holding is archived

- **WHEN** a caller's book grant is revoked or a requested write targets an archived or purging scope
- **THEN** the operation is denied without disclosing unauthorized asset values or committing allocations
- **AND** a prior result or retry receipt does not restore the missing permission
