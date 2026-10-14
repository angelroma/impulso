# Spec Delta

## Purpose

Move reviewed workbook data into Impulso while preserving source precision, financial meaning, and reconciliation evidence. Keep preview, accepted mappings, and recoverable import commits separate so incomplete plans and monthly summaries cannot silently become ledger movements.

## ADDED Requirements

### Requirement: Imports use a reviewed frozen source manifest

Imports SHALL use a frozen manifest supplied through an authorized connector, with workbook identity, stable sheet IDs, visibility, ranges, source versions, and captured values. Users SHALL accept the authoritative sheets and ranges before commit. The import tools MUST NOT fetch arbitrary URLs, execute source formulas, edit the workbook, or disclose its contents to another service.

#### Scenario: Current sheets and historical backups coexist

- **WHEN** a manifest includes Dashboard, 2026, 2027, and 2028 alongside hidden or historical backup sheets
- **THEN** the preview identifies visibility and provenance and proposes current source ranges for review
- **AND** backup and overlapping Dashboard totals are excluded unless explicitly selected for a distinct reviewed purpose
- **AND** a sheet name, visibility flag, or formula never acts as an instruction to import or execute anything

#### Scenario: Source values are formula results or external references

- **WHEN** a captured cell contains a formula or a link to another workbook
- **THEN** only its connector-supplied frozen value and provenance can enter preview
- **AND** missing or unverified values remain blockers instead of triggering formula execution or another network fetch

### Requirement: Preview and commit requests are bounded and resumable

Each import tool request SHALL accept at most 100 source rows and a 32 KiB UTF-8 serialized body, rejecting excess input without partial processing. Results SHALL be bounded and support continuation through opaque source handles tied to the caller, workspace, and frozen manifest. Resuming SHALL preserve the reviewed source version and expose which ranges remain uncovered.

#### Scenario: A workbook exceeds one request

- **WHEN** the selected source contains more than 100 rows or cannot fit in a 32 KiB request
- **THEN** the caller processes bounded batches using the source handle and continuation information
- **AND** the preview reports completed and remaining source coverage without claiming the entire workbook has been reviewed
- **AND** the service does not silently truncate input or concatenate unbounded source data into one response

#### Scenario: A continuation belongs to another caller or snapshot

- **WHEN** a caller reuses a source handle from another caller, workspace, or changed manifest
- **THEN** the request fails without exposing the prior preview or committing financial data
- **AND** a changed source requires a new preview rather than silently updating a frozen batch

### Requirement: Reconciliation distinguishes source arithmetic from financial truth

Preview SHALL reconcile selected detail, monthly totals, annual totals, and Dashboard references using exact decimal arithmetic and accepted currencies. Missing totals, discrepancies, excluded ranges, and unresolved meanings SHALL be visible blockers for affected commits. Corrected source evidence or reviewed exclusions SHALL resolve blockers without relabeling an unreconciled total as verified savings.

#### Scenario: The reviewed 2026 fixture has missing annual totals

- **WHEN** a frozen fixture contains Dashboard annual net 202338.51, summed monthly net 95511.47, and seven rows with monthly values but missing column O annual totals
- **THEN** preview reports the exact 106827.04 difference and the affected source cells
- **AND** it distinguishes this arithmetic reconciliation from verified current savings or actual cash flow
- **AND** it does not overwrite either source value or select one silently as the correct financial result

#### Scenario: Only a reconciled subset is accepted

- **WHEN** the user reviews a reconciled subset and excludes disputed or duplicate source ranges
- **THEN** only the accepted subset can become commit-ready
- **AND** its coverage and remaining discrepancies stay visible in the import result and subsequent reports
- **AND** exclusion does not imply that the omitted workbook or Dashboard totals were reconciled

### Requirement: Accepted mappings determine financial meaning and authorized destination

Committed financial rows SHALL use an accepted `actual_detail`, `actual_summary`, `planned`, `opening_balance`, or `valuation` role, exact amount, confirmed currency, stable source identity, and authorized destination. `reference` rows SHALL be excluded from financial commit and `unknown` rows SHALL remain blocked. All destination scope rules SHALL apply; labels, signs, and formulas MUST NOT infer financial roles or missing repayment terms.

#### Scenario: Loan, card, and investment labels are ambiguous

- **WHEN** rows are labeled "Nu - Credito de 30K", "Cetes", or a card payment without accepted financial roles
- **THEN** preview asks for the missing role and destination rather than treating every outflow as an expense or every inflow as earned income
- **AND** accepted principal, transfer, interest, fee, contribution, and valuation mappings retain their distinct effects
- **AND** unknown component breakdowns remain unresolved without inventing amortization or interest

#### Scenario: A current balance or forecast is supplied

- **WHEN** a reviewed row represents a current opening balance or a copied future-year projection
- **THEN** an opening amount requires its accepted baseline date and account and creates no income
- **AND** a forecast maps only to planning records until separate actual evidence is accepted
- **AND** a proposed opening that would rewrite an existing immutable opening or invalidate recorded history remains blocked until reconciled through the normal ledger model

#### Scenario: A destination or currency is not accepted

- **WHEN** a row lacks a confirmed currency or targets an inaccessible book, incompatible account, or unauthorized person
- **THEN** the affected row remains blocked without creating an account, movement, or association automatically
- **AND** source labels and descriptions retain their original user-provided language

### Requirement: Monthly aggregates retain their precision and explicit report coverage

Month-only source totals SHALL remain separate imported summaries with their accepted period and `actual_summary` or `planned` role. They MUST NOT create invented transaction dates, accounts, purchases, or ledger balances. Reports SHALL disclose summary coverage and distinguish it from detailed movements, preventing overlapping summary and detail amounts from contributing twice to the same total.

#### Scenario: A monthly category total lacks transaction detail

- **WHEN** an accepted source cell records one month's food expense without purchase dates or accounts
- **THEN** import preserves that amount as a month-level summary with source provenance
- **AND** no first-of-month expense, assumed cash account, or invented list of purchases is created
- **AND** balance queries disclose that this summary cannot reconstruct an account balance

#### Scenario: Detailed transactions overlap a previously imported summary

- **WHEN** detailed movements and a source summary cover the same category and month
- **THEN** reports require an explicit nonoverlapping coverage choice or show the overlap as unresolved
- **AND** switching accepted coverage retains both sources and their provenance without adding their overlapping amounts together

### Requirement: Commit requires the accepted preview and current authorization

Commit SHALL require a frozen preview digest, accepted mappings, relevant expected versions, and request ID, with no unresolved blockers for the selected batch. It SHALL recheck current session, consent, membership, book grants, and applicable person access after waits and before commit. Stale source or destination versions and archived or purging scopes SHALL reject the batch without partial financial effects.

#### Scenario: A mapping, source, or destination changes after preview

- **WHEN** submitted values do not match the accepted preview digest or a required source or destination version is stale
- **THEN** commit rejects the batch and identifies the need for another reviewed preview
- **AND** it does not silently refresh a mapping, choose another account, or import changed values under the old approval

#### Scenario: Access is revoked while commit waits

- **WHEN** consent, membership, or a required book or person grant is revoked before the waiting operation can finish
- **THEN** the complete batch fails without financial rows, a success audit, or a completed operation receipt
- **AND** a preview or prior receipt never overrides current authorization

### Requirement: Import batches are atomic and duplicate safe across retries

Each bounded preview or commit mutation SHALL be atomic with its redacted book-linked audit and actor-bound receipt. Source identity SHALL be workbook, sheet ID, exact source cell, and period, independent of request UUID or destination role. Consumption SHALL be unique across roles within a destination book. Changed content, versions, or mappings SHALL require reviewed replacement referencing the prior committed version, never an independent posting.

#### Scenario: A commit response is lost or another request UUID is used

- **WHEN** an authorized caller retries the same accepted batch after an uncertain response, including with a different request UUID
- **THEN** stable source identity prevents duplicate financial records and returns the existing reviewed outcome
- **AND** concurrent retries cannot create multiple committed outcomes for the same source in the destination book

#### Scenario: A changed role attempts to reuse a consumed cell

- **WHEN** a source cell already committed to a book is submitted with another destination role or mapping
- **THEN** its existing consumption and coverage remain effective and prevent another independent financial effect
- **AND** changing the role requires a reviewed replacement referencing the prior committed version and an atomic coverage transition
- **AND** posted details use an auditable ledger correction while summaries, plans, or valuations retain their replaced history

#### Scenario: A committed source cell later changes

- **WHEN** the same source identity arrives with changed content or a new source version
- **THEN** preview shows the existing import and the proposed replacement for review
- **AND** commit cannot append it as an unrelated movement or silently alter the prior record
- **AND** an accepted replacement preserves the old provenance and follows the destination's correction or version rules

#### Scenario: One row or audit write fails within a batch

- **WHEN** any selected row, duplicate check, audit write, or receipt write fails
- **THEN** every mutation for that bounded batch rolls back
- **AND** earlier completed batches remain identified as completed while the failed and unprocessed coverage stays explicit
- **AND** the result does not claim the whole import succeeded
