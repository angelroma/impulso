# Spec Delta

## Purpose

Provide authorized financial reports that distinguish completed activity, plans and historical summaries, disclose missing coverage and account for debt and investment values without double counting.

## ADDED Requirements

### Requirement: Finance reports use explicit authorized and bounded contracts

`get_finance_report` SHALL require workspace, book, documented report kind and bounded date scope. Results SHALL identify currency, reporting basis, period, as-of boundary, coverage and unresolved exclusions, with exact decimal-string totals. Every report SHALL recheck current read access and session; no arbitrary SQL, user-selected expressions or cross-currency total SHALL be accepted.

#### Scenario: A viewer requests a cash-flow report

- **WHEN** a current book viewer supplies a permitted report kind and date interval
- **THEN** the response contains only that book's authorized figures with their currency and coverage basis
- **AND** the operation creates no transactions, planning records, audits of successful writes or mutation receipts

#### Scenario: A report request exceeds its contract or access

- **WHEN** input contains arbitrary expressions, an unsupported interval, another protected book or revoked consent
- **THEN** the request fails with a controlled error without exposing unrelated figures
- **AND** requesting several currencies does not produce an invented converted grand total

### Requirement: Actual cash flow distinguishes earnings spending and account movement

Actual income and expense reports SHALL use effective posted entries and accepted historical coverage. Transfers, loan principal received or repaid, and investment contributions SHALL not count as earnings or consumption. Interest, fees and actual purchases SHALL count under their accepted classifications. Voided entries SHALL contribute zero; a correction SHALL contribute only its effective replacement.

#### Scenario: Savings and investment contributions accompany earnings

- **WHEN** salary of `1000.00`, spending of `100.00` and an owned-account investment transfer of `200.00` are posted
- **THEN** earned income is `1000.00`, spending is `100.00` and income less spending is `900.00`
- **AND** the transfer appears as account movement rather than an additional expense or a second saving gain

#### Scenario: Borrowing and a card repayment are present

- **WHEN** loan principal is transferred to checking and checking later pays a card or loan principal balance
- **THEN** neither principal movement increases earned income or expense totals
- **AND** an actual card purchase, interest charge or fee is counted once under its applicable posted expense

#### Scenario: A posted amount has been replaced

- **WHEN** an original expense of `100.00` has been corrected to an effective replacement of `80.00`
- **THEN** actual expense totals include `80.00` rather than `180.00` or `100.00`
- **AND** ledger inspection can still explain the preserved original and its replacement

### Requirement: Dated account balances disclose the opening coverage boundary

An account balance SHALL equal its accepted opening amount plus effective incoming entries minus effective outgoing entries through the requested date. It SHALL disclose the opening date and coverage limitations. Unknown opening boundaries or account types SHALL remain explicit; balances before a known boundary SHALL not be presented as verified, and monthly summaries without accounts SHALL not supply account balances.

#### Scenario: A complete opening boundary is available

- **WHEN** an account opens on `2026-01-01` with `100.00`, receives `500.00` and sends `200.00` within the requested interval
- **THEN** its ending balance is exactly `400.00` with the opening boundary stated
- **AND** future, voided and planned entries do not affect that dated balance

#### Scenario: A legacy account has an unknown boundary

- **WHEN** an account retains null `opening_balance_on`, an unknown type or an unresolved imported baseline
- **THEN** applicable reports mark its coverage or classification incomplete and identify the missing decision
- **AND** they do not silently choose creation time, January first or a spreadsheet total as its accepted opening date

#### Scenario: The requested date precedes the accepted opening

- **WHEN** an account's requested as-of date is earlier than its opening boundary
- **THEN** the report returns an explicit unavailable or incomplete balance rather than a verified zero or backdated opening amount
- **AND** a month-only historical summary cannot repair the missing account-level precision

### Requirement: Detailed and aggregate actual coverage never overlap silently

Reports SHALL distinguish detailed transactions from provenance-preserving monthly summaries. For each book, currency, month and classification, accepted actual coverage SHALL select disjoint authoritative detail or summary contributions. Unresolved overlap, unknown classification and excluded rows SHALL be disclosed. Monthly precision SHALL remain monthly and SHALL not create fictional daily transactions or account effects.

#### Scenario: Monthly detail duplicates a historical summary

- **WHEN** a month contains both a summary and detailed movements for the same actual category coverage
- **THEN** the report counts only an explicitly accepted disjoint coverage selection or marks the affected total incomplete
- **AND** it does not add the summary and details as if they were separate spending

#### Scenario: A report asks for more precision than the source provides

- **WHEN** a historical import identifies only a month and category without an occurrence date or account
- **THEN** a monthly report can identify that accepted summary contribution and its provenance
- **AND** daily reports, account balances and dated net worth exclude it or disclose the missing precision instead of inventing dates or account assignments

#### Scenario: A workbook headline conflicts with its monthly components

- **WHEN** a source dashboard total differs from accepted component sums or still includes unknown rows
- **THEN** the report exposes the reconciliation difference and incomplete coverage
- **AND** it does not treat either headline or partial sum as the user's verified savings merely because it appeared in the source

### Requirement: Projections and plan comparisons remain separate from actual results

Plan-versus-actual reports SHALL distinguish accepted planned amounts, linked realized amounts, remaining commitments and unclassified coverage. Projections SHALL state their baseline, scenario, horizon and assumptions, and SHALL not be described as guaranteed balances or earnings. Settlement links SHALL prevent counting the same actual amount twice, and a paid marker without a posted entry SHALL not establish an actual account effect.

#### Scenario: A future obligation is partly settled

- **WHEN** a planned obligation of `1000.00` has an accepted linked actual payment of `400.00`
- **THEN** the report shows `1000.00` planned, `400.00` realized and `600.00` remaining under its stated coverage
- **AND** a projection does not subtract both the full obligation and the already posted payment from the same baseline

#### Scenario: A recurring plan spans future years

- **WHEN** accepted recurring plans generate future dated expectations
- **THEN** the report identifies them as a projection separate from actual historical income and spending
- **AND** generating or displaying those expectations creates no completed financial movements

#### Scenario: A commitment is manually marked paid without ledger evidence

- **WHEN** the source workbook or user marks an item paid but no accepted posted transaction establishes its cash effect
- **THEN** the report preserves that observation while identifying actual payment coverage as unresolved
- **AND** it does not increase an account's spending or reduce its balance from the marker alone

### Requirement: Net worth uses dated liability and asset values without double counting

Net-worth reports SHALL state an as-of date and currency and sum signed positions once: negative liabilities reduce net worth and positive overpayment credits remain positive. An accepted dated market valuation SHALL replace its investment's ledger cost basis rather than be added to it. Missing or stale valuations, unknown types and incomplete baselines SHALL be disclosed; savings goals and borrowed principal SHALL not create additional wealth.

#### Scenario: An investment has both ledger cost and a market valuation

- **WHEN** an investment account has a ledger cost of `1000.00` and a valid accepted valuation of `1100.00` as of the report date
- **THEN** its net-worth contribution is `1100.00` rather than `2100.00`
- **AND** the valuation date and basis are visible while any unrealized change remains distinct from earned cash income

#### Scenario: A liability is borrowed or repaid

- **WHEN** borrowed principal increases an owned cash account and the matching negative liability balance by the same amount
- **THEN** that transfer alone leaves net worth unchanged
- **AND** principal repayment changes both account positions without recording an extra expense or a second reduction of net worth

#### Scenario: A liability account holds an overpayment credit

- **WHEN** a liability account's accepted signed balance is positive because of an overpayment
- **THEN** that positive credit contributes positively to net worth rather than being subtracted because of its account type
- **AND** negative liability balances reduce net worth once without a second sign inversion

#### Scenario: Values are missing stale or differently denominated

- **WHEN** an account type, accepted baseline or applicable valuation is missing, a valuation is beyond its accepted freshness boundary, or assets use different currencies
- **THEN** the response identifies incomplete or stale components and reports supported currency subtotals separately
- **AND** it does not use a future valuation, invent an exchange rate, or present a savings goal's target as an owned asset
