# Tasks

## 1. Establish the compatible baseline

- [x] 1.1 Synchronize the completed `add-conversational-expense-recording` deltas through the normal sync workflow without archiving or changing its code; verify `finance-expenses` exists in main specs and the renamed MCP requirement composes with this change without lost scenarios.
- [x] 1.2 Capture preservation evidence for existing migrations, local resource/receipt identities, Auth/onboarding contracts, and original source/history files; verify a synthetic legacy v1 expense receipt still recovers before implementation and document the local-only boundary.
- [x] 1.3 Add synthetic workbook reconciliation fixtures representing active years, derived Dashboard, excluded backups, monthly-only precision, and the seven missing annual totals; verify exact 106827.04 discrepancy detection without asserting verified savings and document that no live import/source edit is authorized.

## 2. Extend ledger structure and value contracts

- [x] 2.1 Add reviewed account type/opening-date metadata, categories, transaction classifications and groups to the complete schema with composite keys, native checks, indexes and RLS; create a pinned-CLI forward migration, verify pgTAP inventory/cross-scope/ordinary-role denial and preserve old rows as unknown/null, and update the catalogue/database guide.
- [x] 2.2 Define closed account/category, single/group transaction, correction/listing contracts and v2 fingerprints while retaining every old contract/hash; verify exact sums, kind-specific accounts, category compatibility, groups up to ten, invalid money/dates/fields, version-zero first classification and old receipt fixtures in unit tests.
- [x] 2.3 Add only necessary backend ledger reads/inserts/lock and correction metadata privileges plus exact audit/receipt check values; verify pgTAP still denies posted-value rewrites, deletion, Health, files and Auth secrets, and document the restricted grant changes.

## 3. Implement ledger services and explicit reads

- [x] 3.1 Implement `configure_account` and category/classification services with expected versions and unchanged opening amounts; verify legacy unknown metadata, date-before-history conflicts, kind/scope/archive checks and concurrent revisions using local fixtures, and document partial create/configure outcomes.
- [x] 3.2 Implement exact income, expense, same-book transfer and bounded atomic groups using existing transaction foundations; verify distinct stored child request UUIDs, immutable ordered membership, account effects, principal/interest splits, rollback, payload conflicts, legacy v1 versus new v2 recovery and deterministic locks in unit/integration tests, and document the recording contract.
- [x] 3.3 Implement controlled void/replacement services without overwriting posted values; verify one effective replacement, expected-version races, preservation of original evidence, `action_retired` legacy creation recovery and all-or-nothing dependent-link reconciliation, and document correction behavior.
- [x] 3.4 Implement bounded transaction listings with full-scope keyset cursors and effective/voided states; verify viewer access, filter binding, no duplicate page rows, revocation after discovery and unchanged amount-free `get_finance_context`, and document limits and pagination.

## 4. Add budgets and expected activity

- [x] 4.1 Extend budget category scope and add recurrence, expected item/line and allocation tables with native scope, period and uniqueness constraints; generate/review a CLI migration and narrow grants, verify pgTAP multiple category limits, occurrence identity and direct-role denial, and update the schema catalogue.
- [x] 4.2 Implement budget create/revise/archive and expected item create/revise/cancel services including quoted totals with unresolved components; verify exact-sum resolution, no guessed classifications or actual balance effects, unknown due dates, expected-version races and caps excluded from outflow, and document the local service contracts.
- [x] 4.3 Implement monthly/annual recurrence and bounded occurrence materialization with accepted short-month policy; verify leap years, day 31, end periods, 100-occurrence limit, repeated UUIDs/fresh-key uniqueness and preserved settled history, and document supported schedules.
- [x] 4.4 Implement explicit actual-to-plan allocation, reversal and derived due/payment state; verify partial/excess payments, no over-allocation across plans under concurrency, unknown due dates, cancellation and correction dependencies through local fixtures, and document settlement and forecast remainder rules.

## 5. Add debt and wealth tracking

- [x] 5.1 Add debt metadata, goals/earmarks, assets and single-target dated valuations with native keys/checks/RLS; generate/review a CLI migration and necessary grants, verify pgTAP target exclusivity, currency/scope, nonfinite amounts and denied direct access, and update the catalogue/database guide.
- [x] 5.2 Implement debt metadata and link accepted repayment expectations to component recording/settlement; verify unknown terms remain unresolved, drawdown/principal are transfers, card purchases/interest/fees are expenses and overpayment credits retain their sign, and document the absence of automatic amortization or bank execution.
- [x] 5.3 Implement goals and earmark set/release/cancel services with reviewed eligible account/basis rules; verify shared-basis concurrent limits, stale valuation denial, expected contributions excluded, later funding shortfalls and cancellation preserving actual money, and document supported progress calculations.
- [x] 5.4 Implement manual asset and dated valuation services with preserved correction history; verify no duplicate account/manual-asset mapping, exact-one target, known zero versus unknown value, future-value exclusion and current access on recovery, and document valuation basis and freshness.

## 6. Implement reports from authoritative evidence

- [x] 6.1 Define bounded closed report contracts and implement dated account balances and actual cash flow with exact sums; verify opening-day inclusivity, unknown/pre-baseline coverage, void/replacement effects, principal/investment exclusion from earnings/expenses and no float accumulation, and document each measure's basis.
- [x] 6.2 Implement plan-versus-actual, upcoming and goal reports using settlements and explicit baselines; verify actual-plus-remaining projections, unknown dates/components, monthly summaries unable to settle bills or reconstruct account forecasts, cancellation, overpayment and budget overlap, and document forecast assumptions/horizon limits.
- [x] 6.3 Implement signed net worth with account valuation replacement and manual assets; verify borrowing/repayment invariance, positive liability credit, goals excluded, stale/missing/future values and separate currencies, and document incomplete subtotals and the disclosed freshness parameter.

## 7. Add reviewed historical import and summary coverage

- [x] 7.1 Add protected import batch/row, monthly summary and report coverage tables with stable source-consumption identity and versioned replacements; generate/review a CLI migration and narrow grants, verify native scope/duplicate constraints and ordinary-role denial, and update the catalogue to the complete 40-table inventory.
- [x] 7.2 Implement strict frozen-manifest preview and bounded authorized status/continuation reads; verify 100-row/32 KiB limits, exact parsing rules, source version binding, no URL fetch/formula execution, empty-until-reviewed selection, backup exclusion and the synthetic discrepancy fixture, and document preparation through existing Sheets tools.
- [x] 7.3 Implement accepted role/destination mapping and blockers for unknown currency, adjustment meaning, precision, missing dates, debt components and immutable existing openings; verify month-only rows stay summaries/plans and valuations/baselines never become income, and document the focused review questions.
- [x] 7.4 Implement reviewed detail-versus-summary coverage and integrate it into reports; verify same-category/month overlap, partial/unknown coverage, newly added detail after summary acceptance, excluded sources and lack of aggregate account effects without silently double counting, and document the coverage basis.
- [x] 7.5 Implement digest/expected-version-gated atomic batch commit and explicit source replacement; verify stale previews, changed mapping across roles, fresh UUID duplicate attempts, competing source consumption, late failure rollback, revoked consent while waiting and truthful partial multi-batch outcomes, and document same-key recovery and reconciliation.

## 8. Wire and verify the conversational interface

- [x] 8.1 Wire all supported services through existing runtime/handler dependencies and register the exact 20-tool manifest with closed branch input/output schemas and accurate annotations; verify protocol discovery, malformed nested actions, body/group/page limits, caller isolation and unchanged OAuth/onboarding/legacy six-tool shapes without adding Finance browser routes.
- [x] 8.2 Add metadata guidance and a documented synthetic walkthrough for salary, hamburger, card purchase plus payment, loan receipt/unknown split, CETES transfer, recurring bill, monthly-only import, conflicting totals, cancellation and uncertain retries; verify focused questions, preserved user text, no guessed currency/attribution/dates, no redundant confirmation of resolved requests and no bank/payment claims.
- [x] 8.3 Update the OpenSpec index, service catalogue and local/remote guides as each tool family becomes implemented; verify links, table/tool inventories, retained original documents and explicit local-versus-hosted boundaries, without rewriting archived evidence or claiming a live user import.

## 9. Complete integrated local verification

- [x] 9.1 Apply only reviewed local forward migrations through Nx without reset/seed and run the existing database, type, lint and unit targets; verify preservation baselines, all native constraints/grants, absent application SQL routines and declarative-versus-history equality, recording exact results and any repaired failures.
- [x] 9.2 Extend the disposable integration launcher coverage and run the complete local suite including an actual OAuth/MCP HTTP flow through income, transfer, reports and one synthetic preview/commit; verify concurrency, correction/settlement races, consent revocation, unchanged onboarding and fixture cleanup on success/failure without live source data or cloud mutation.
- [x] 9.3 Validate all nine deltas strictly and their sequential composition after the predecessor, review excluded-feature and authorization boundaries, verify all local document links/preserved sources, and record acceptance, test counts, unresolved user-data decisions and rollout limitations before marking this change implemented.

## Workflow follow-up

- Review and synchronize the implemented delta specs, then archive through the normal OpenSpec workflow when requested.
- Deploy reviewed code and migrations to the remote project only as a subsequent rollout action, refresh plugin discovery, and verify its OAuth/tools before claiming hosted Finance support.
- Repair the source spreadsheet or import its real records only after a separate explicit instruction and a reconciled accepted review of source ranges, currency, roles, mappings and cutoff dates.
