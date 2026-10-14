# Design

## Context

See [proposal](proposal.md) for motivation. The Supabase Nx application already has six strict MCP tools, four Finance tables available to its limited backend, exact decimal validators, independent book ACLs, transactional audit/receipts, and disposable local tests. The five existing migrations and the complete declarative schema are the baseline, not a greenfield database. The previous expense change is implemented but its deltas are not synchronized into main specs.

Observed workbook structure: the connected spreadsheet `1a1h-D0kmw4NhowoULWOBM2OY3SELeySFu7DQEYa3vbo` has Dashboard, 2026, 2027, and 2028 tabs plus hidden archives/backups. Annual tabs are concept-by-month matrices, not a bank transaction feed. The workbook timezone is America/Mexico_City; this does not authorize changing an existing workspace timezone or inferring currency. Source amounts mix earned income, loan inflows, adjustments, credit payments, CETES contributions, expectations, and manually entered asset/debt balances. Their precise meanings require accepted mappings.

The reviewed 2026 values give annual headline net 202338.51 but monthly net sum 95511.47, difference 106827.04. Annual total cells are missing for seven rows: 17, 25, 47, 48, 50, 52, and 53. Fixed-expense monthly totals sum to 630443.59 versus annual 585716.55; variable-expense monthly totals sum to 464421.81 versus annual 402321.81. These are reconciliation evidence, not verified current wealth. The source workbook remains unchanged.

## Goals / Non-Goals

**Goals:** Extend the existing local system in independently testable stages; retain posted evidence and old request receipts; make actual, planned, monthly, and valued data distinguishable; provide a reviewed import path that refuses unresolved source facts.

**Non-Goals:** A replacement ledger architecture, custom SQL routines, an independent backend, another web UI, bank connections/payments, automatic amortization/tax advice, securities pricing, currency conversion, new managed-person access, Health/files/sharing, purge execution, production rollout, source-sheet repair, or importing this user's records during implementation. New code, contracts, defaults, tests, and technical docs remain English; user labels remain unchanged.

## Decisions

### 1. Apply on top of the completed expense baseline

The first apply task synchronizes the reviewed predecessor delta set using the normal sync workflow without archiving it. Verify the resulting `finance-expenses` main capability and renamed MCP requirement before applying this change's MODIFIED blocks. Validate the two change sets in sequence in memory during planning; do not fabricate a new main spec or silently treat `finance-expenses` as new again.

Keep all six existing input/output contracts, v1 canonical payload order, operation names, and receipt result identifiers. In particular, the old `record_expense` hash uses `create_transaction` without a `kind` or category field. New recording has an explicitly separate v2 fingerprint including kind and group entries. A reused request UUID across versions conflicts rather than upgrading an old receipt. Metadata classification does not invalidate old creation recovery; a voided/replaced original instead returns controlled `action_retired` without implying it is still effective.

Alternative rejected: refactoring existing expenses through a new generic payload breaks recovery of committed actions and changes closed client contracts.

### 2. Retain the signed ledger and add explicit classification

`finance.accounts` gains `account_kind` in `unknown`, `cash`, `bank`, `investment`, `credit_card`, or `loan`, and nullable `opening_balance_on`. Existing and legacy-created accounts remain `unknown`/null until reviewed with `configure_account` and an expected version. Opening is start-of-day: balance through date D = accepted opening + effective destination inflows - effective source outflows from opening date through D. Amounts remain exact decimal strings and are summed with integer minor-unit or exact decimal arithmetic, never JavaScript floating-point accumulation.

A liability uses the same signed position: a negative balance is owed money, a positive overpayment is credit. Borrowing is liability-to-bank transfer; principal repayment is bank-to-liability transfer; a card purchase is an expense from the card; interest/fees are expenses; owned investment contributions are transfers. Transfers remain inside one book and currency. No separate annual books are required for the workbook's years.

Unknown opening dates produce incomplete account coverage. Accepting a boundary after existing movements, posting before an accepted boundary, or rewriting an opening amount after the first movement is rejected. An account type is not inferred from its name. This feature does not introduce opening-balance edits; genuine historical corrections need explicitly represented entries and provenance.

Keep `finance.transactions` amounts, dates, descriptions, kinds, accounts, and original requests immutable. `transaction_classifications` is a separate, versioned relation containing an optional compatible income/expense category and optional group membership. Transfers never acquire an income/expense category. Classifications need explicit revisions, not generated translations. For a first classification, expected version zero means the relation must not yet exist; later updates require its stored positive version.

New `transaction_groups` associate at most ten accepted component entries in one transaction. A group models a payment with principal transfer plus interest/fee expenses, not another account effect or report row. The caller UUID belongs to the parent receipt/group; each child receives a distinct immutable generated transaction request UUID because the existing book/request key allows one transaction per UUID. Generate children only after the parent request lock and receipt lookup; store their ordered identifiers in group membership and receipt results. Retry uses those stored identifiers and never regenerates or hashes generated IDs as user payload. Original membership/order is immutable; category revisions preserve it. A correction follows the original component's replacement chain rather than moving membership or rewriting the group. Native composite keys, exact constraints, and kind-specific shapes remain authoritative structural checks.

### 3. Use normalized tables for plans and their reconciliation

Proposed additive Finance inventory:

| Table | Responsibility |
| --- | --- |
| `categories` | Book-scoped income or expense labels, archive state, version. |
| `transaction_classifications` | One versioned category/group association per existing transaction. |
| `transaction_groups` | Atomic accepted multi-component event, with no extra monetary effect. |
| `recurring_rules` | Monthly/annual interval, start/end periods, nullable due day, explicit short-month policy, revision. |
| `recurring_rule_lines` | Normalized kind, amount, compatible category and optional accounts for each template component. |
| `planned_items` | Period, optional due date/debt/rule, optional accepted quoted total, resolved/unresolved component state, revision and cancellation. |
| `planned_item_lines` | Expected income/expense/transfer components and exact amounts. |
| `planned_item_allocations` | Versioned actual-transaction amount linked to an expected line; revoked links retain history. |
| `debt_details` | One-to-one loan/card account metadata, creditor text, optional accepted limit and payment terms. |
| `savings_goals` | Named target amount/date, permitted attribution, active/canceled state. |
| `goal_allocations` | Explicit earmarks from eligible actual account funds; never another ledger balance. |
| `assets` | Manual nonledger assets such as a vehicle/property, with explicit ownership/identity text. |
| `asset_valuations` | Dated, sourced value targeting exactly one manual asset or investment account. |
| `import_batches` | Actor/book-bound frozen source version, mapping/review digest, reconciliation and lifecycle state. |
| `import_rows` | Immutable bounded source cells, stable identity, exact parsed value, accepted role, result links and blockers. |
| `monthly_summaries` | Accepted aggregate actual amount, month, kind/category, and source provenance without fictional account effects. |
| `report_coverage` | Reviewed detail-versus-summary authority for one book/month/kind/category coverage key. |

These 17 tables extend the six existing Finance tables to 23 Finance tables and the application inventory from 23 to 40 tables. Do not add redundant caches for balances, payments, forecast totals, goal progress, or net worth. Update the catalogue and SQL inventory assertions to the generated inventory during apply. Existing Core/Health tables, four private Auth views, and all six schema names remain unchanged.

Every new resource has applicable scope keys, actors/timestamps, version, and lifecycle fields; relation tables use their parent scopes and appropriate revision/revocation metadata. All resource links use `(workspace_id, book_id, ...)` and currency where required. Index foreign keys and the actual keyset/date lookup paths. `asset_valuations` has exactly one target, a nonnegative finite value and a unique target/date revision policy. Unknown values are absent, not zero. Native foreign keys cannot prove current active state, allocation sums, or whether two manually named assets are the same thing; TypeScript handles those checks and requests an explicit identity choice when mapping imports.

Existing `finance.budgets` gains nullable category scope and a native uniqueness definition including that scope; whole-book and category caps remain separate comparisons. Its person attribution still uses only verified self or accepted null. Editing a budget with a category must not silently narrow an old whole-book budget.

Alternative rejected: storing these concepts as transaction flags or unvalidated JSON would make a future payment indistinguishable from actual money and weaken cross-book references. Raw source snapshots may use bounded JSON data, but application financial relationships are normalized.

### 4. A plan is not money and a paid label is not evidence

Rules materialize only within a requested horizon, at most 100 occurrences per call. An immutable occurrence identity `(rule_id, period_start)` prevents duplicate generation across request IDs. Materialized entries retain their accepted rule revision. Updates affect eligible future unsettled occurrences through explicit expected-version actions; they never rewrite paid history. Monthly and annual recurrence support an accepted day or month-only precision; a day outside a short month uses an explicitly accepted `last_day` policy or is rejected for clarification.

Plans have component lines because a loan installment can contain principal and expense. An unresolved installment may retain an accepted positive `quoted_total` on its header and no invented typed lines. Its known amount is displayed as an unclassified expectation; it cannot be settled as classified money or contribute to verified expense/earnings totals, and affected forecasts disclose incomplete classification. Resolving it requires an expected-version action whose exact component sum equals the quoted total. Settlement links reference actual components, not inferred descriptions or equal amounts. Under deterministic locks, the sum of active allocations cannot exceed any referenced actual amount; explicit overpayment against an expectation is allowed and reported, with forecast remainder clamped to zero. Status is derived as unpaid, partially_paid, paid, or overpaid. Overdue is independently based on a known due date and workspace local date; cancellation is an explicit stored action. A correction must atomically reconcile linked allocations or fail; it cannot leave stale paid status.

Projection baseline is a supported dated balance. For the remaining horizon, add/subtract only expected unsettled lines not already represented by dated actual movements in that baseline. Monthly summaries can support month-level plan comparisons but never settle individual bills or establish account effects. Unmatched summaries or unresolved components affecting an account forecast make it explicitly incomplete; they are not subtracted from selected plan lines automatically. Do not add budget caps as extra expenses. The response states horizon, baseline, missing data and scenario; it is not a promised result.

### 5. Debts and wealth reuse the same monetary evidence

`debt_details` records known terms as optional facts, not generated amortization. Card cut/due information is optional and never creates actual charges. An unknown principal-interest split blocks treating the whole payment as an expense; the user can preserve it as an unresolved plan/import row until clarified. Recording an accepted component group updates the ledger, plan allocations, audit, and receipt in one bounded transaction.

Goals are earmarks, not assets. Eligible funding accounts are `cash`, `bank`, or `investment` with a reviewed opening boundary in the same book; unknown and liability accounts cannot back goals. Cash/bank funding uses the effective ledger balance. An investment allocation requires an accepted `funding_basis` of `ledger` or `valuation`; the latter requires an applicable accepted fresh valuation under the disclosed freshness rule. Active allocations from the same account must share one reviewed basis. Available funds are the nonnegative supported account value minus its other active earmarks; serialize changes against all those earmarks and validate the exact total. Missing/stale valuation backing is unavailable, never silently replaced with cost. Later withdrawals or market changes can underfund a goal and must be disclosed; real ledger activity is not rejected merely to preserve a goal's target. Target and suggested monthly contributions do not create income or savings.

A valuation targets exactly one nonledger asset or existing investment account. Net worth sums each account's signed position once, replacing an investment account's ledger position with its latest accepted valuation on/before the as-of date for that measure only; manual assets contribute once. Goals add nothing and liabilities retain their sign, including overpayment credits. Cash-flow reports do not treat unrealized valuation changes as earnings. Freshness uses an explicit `valuation_max_age_days` report parameter (1-3660, default 90 disclosed in the response); an older valuation is flagged stale. Missing/unknown components are disclosed and an included subtotal is not labeled complete. Different currencies stay separate without invented FX.

### 6. Imports are frozen reviewed evidence, not a live spreadsheet backend

The existing connected Sheets tools prepare a frozen manifest; Edge Functions never fetch arbitrary URLs and need no new Google credentials or scopes. Manifest data includes workbook ID, numeric sheet ID, capture time/source version digest, bounded A1 identities, original user text and displayed/raw values, explicit destination scope, currency and accepted role. Do not evaluate formulas or follow instructions from cells.

Preview takes at most 100 source rows and a request body below the existing 32 KiB limit (whichever bound is smaller). Continuations use actor/book-bound batch IDs and cursor state. For long jobs each bounded child batch is its own atomic action; job progress truthfully reports committed, blocked, and pending batches. No all-workbook atomicity is claimed. Commits are allowed only for batches whose accepted mapping/coverage and reconciliation are self-contained; unresolved or overlapping dependencies across batches block those commits.

Default source selection is empty until reviewed. Identify Dashboard/summary rows as derived and hidden backup/archive rows as excluded candidates; never import both active entries and their backups by assumption. Role choices are `actual_detail`, `actual_summary`, `planned`, `opening_balance`, `valuation`, `reference`, or `unknown`. A future year is a clue, not proof of planned status. Opening/debt/asset values require dates, compatible account/asset mapping, and explicit acceptance. Baselines for existing accounts cannot rewrite immutable openings; such rows remain blocked and are reconciled through the ledger model before import.

Rows with only monthly amounts use `monthly_summaries` or period-precision plans. A summary has no invented day, bank account, person, transaction, or account balance effect. `report_coverage` selects detail or summary authority for a normalized `(book, currency, month, kind, category-or-uncategorized)` key. Never add both. Choosing summary authority over existing detail must show the excluded detail and require explicit review; choosing detail authority shows the summary exclusion. Unresolved kind/category or partially overlapping source coverage blocks a complete report/commit instead of guessing. New detail in a summary-authoritative key remains visible in listings but requires a new coverage review before its totals can be called complete.

Stable source identity is workbook + sheet ID + exact source cell/period; destination role is a reviewed mapping, not a way to bypass duplicate protection. Enforce source consumption uniqueness across request UUIDs and roles for the same destination book. A changed source value or mapping needs an explicit reviewed replacement referencing the prior committed version; it must atomically retire/replace old summary/plan/valuation effects or use an auditable ledger correction for posted details. No delete/reimport shortcut. Duplicate data in different source sheets still needs declared source selection and overlap review; textual similarity is not proof of identity.

`preview_finance_import` creates only protected draft/import metadata. Commit requires its immutable reviewed digest, expected batch/target/coverage versions, explicit accepted currency/mappings, cleared blockers, and current writer authorization. Currency symbols and locale-formatted values are interpreted only by an accepted parsing rule; lost precision, ambiguous separators, unknown roles, stale previews or unreconciled differences block commit. Present the exact 2026 discrepancy without silently fixing source formulas or declaring either net figure true. Applying this change uses synthetic fixtures only; the user's workbook is not imported by the implementation task.

### 7. Extend a fixed MCP surface instead of generic CRUD

Keep the old six tools. Add these fourteen related-operation tools, each with a strict discriminated union and closed branch results:

| Tool | Allowed operations |
| --- | --- |
| `configure_account` | Review type and opening date for an existing account with expected version; no opening amount edits. |
| `manage_category` | Create, rename, archive, or classify an existing compatible transaction. |
| `record_transaction` | Record one kind-specific entry or an accepted atomic group up to ten entries; optional compatible category/settlement links. |
| `correct_transaction` | Void or replace the current effective entry with reason/version and explicitly reconciled dependent links. |
| `list_transactions` | Read a scoped, filtered keyset page. |
| `get_finance_report` | Read `balances`, `cash_flow`, `plan_vs_actual`, `upcoming`, `goals`, or `net_worth`. |
| `manage_budget` | Create, revise, or archive a scoped limit. |
| `manage_plan` | Create/revise/cancel plans or recurrence, materialize a bounded horizon, link/revoke settlement. |
| `manage_debt` | Create/revise/archive metadata for an existing compatible liability account, with no actual money effect. |
| `manage_goal` | Create/revise/cancel goals and set/release explicit earmarks. |
| `manage_asset` | Create/revise/archive manual assets or append/revise a dated valuation with preserved history. |
| `preview_finance_import` | Validate/freeze mappings and source evidence, return blockers/reconciliation/digest. |
| `commit_finance_import` | Commit one ready bounded reviewed batch. |
| `get_finance_import` | Read an authorized batch's status and bounded source/result rows. |

The related `manage_*` families also include strictly bounded `get` or `list` branches for their own declared resources where inspection is required by the capability. Those branches use read permission and create no mutations, audits of writes, or receipts; the family annotation remains potentially mutating. This supplies resource discovery after reconnection without adding tool names or exposing generic CRUD.

For old account creation followed by configuration, report partial success truthfully if configuration fails. All new Finance calls require workspace/book scope; mutations use one request UUID per accepted action and expected versions for changes. Inputs are never arbitrary table names or field dictionaries. Reads default to 50 rows, maximum 100; report horizons are at most 36 months and detail scans are bounded by the SQL statement timeout, with an explicit `report_too_large` outcome rather than silent truncation. Keyset continuation binds all filters, dates, and scope. Compute each aggregate report in one bounded SQL statement/CTE snapshot with exact sums inside the existing read-committed transaction; check live permissions/session before and after that statement. Do not use an old repeatable-read authorization snapshot to hide a consent revocation while waiting.

New services live in small related TypeScript modules under `_shared`, with existing runtime dependency injection and MCP handler boundaries. No new Finance browser routes. Client guidance asks the focused unresolved question, retains user intent and language, distinguishes observation from posted fact, and reuses accepted resources. Complete explicit supported instructions need no redundant confirmation. No generated category/name/location/currency is silently substituted for user data.

### 8. Expand native security only as required

All new tables enable RLS and deny ordinary client roles and `service_role`. Extend only `impulso_backend` reads/inserts and narrow mutation columns required by implemented services. Posted transaction amount/date/account/currency remain unwritable; correction can update only void/version/actor/timestamp metadata and insert a replacement. No DELETE grants. Health, Finance files, Auth secrets, cross-domain access and administration remain denied.

Add only exact operation identifiers required by the new tool branches to the receipt check, retaining every existing value. Extend Finance audit resource-type checks for the new resources; store actor, scope, IDs and changed field names without copying source contents, descriptions, amounts or values to audit. Snapshot/import data is protected business data, not an audit/log payload. Relation revisions are soft-revoked, not physically deleted. Do not conflate new operation names with existing receipts.

Every mutation uses the shared identity transaction: request advisory lock before user/workspace/book, then sorted account IDs, then the applicable category/plan/goal/import and allocation rows in documented fixed type-and-ID order. Recheck live session/consent after waits and before commit; reads recheck before returning. Viewer can inspect authorized records/reports, owner/editor can write/recover, membership alone grants no book. Preserve current self-or-accepted-null person attribution and active/archive/purge guards on every new parent and recovery path. No application function, procedure, trigger, or SQL test helper is introduced.

## Risks / Trade-offs

- [Unknown spreadsheet semantics] -> Import blocks unknown actual/planned roles, currency, adjustment meaning, accounts and dates. Manual review resolves data without changing the model.
- [More tables and services] -> Normalize only concepts the workbook already needs, stage migrations by service capability, and compute derived figures instead of adding caches or a new backend.
- [Legacy receipts and closed clients] -> Keep old shapes/fingerprints and regression fixtures; add typed metadata through separate operations.
- [Historical summaries cannot prove balances] -> Preserve month precision and report coverage; require accepted dated account baselines for balances/net worth.
- [Concurrent settlement, correction, or earmarking] -> Stable locks, expected versions, aggregate-limit checks and rollback tests under races.
- [Source/destination remapping evades dedup] -> Anchor identity to source cells before mapping and serialize coverage/consumption checks across batches and roles.
- [A long report or import exceeds local limits] -> Bound pages, horizons, entry groups and batches; surface limits and partial job progress honestly.
- [Local tests are mistaken for deployment] -> Track implementation evidence separately from remote rollout and plugin discovery verification.

## Migration Plan

1. Synchronize the completed expense predecessor without archiving or modifying its implementation. Validate sequential spec composition and capture a preservation baseline for existing history and data.
2. Extend the complete schema with native relationships/checks/indexes/RLS first. Generate chronological files through pinned Supabase CLI; review each forward migration and narrow grants. Use successive reviewed files for ledger metadata, planning/debt/wealth, then imports. No reset, seed records, SQL routine, or cloud mutation.
3. Implement and test each corresponding local service and MCP family before declaring it available. Account defaults remain unknown; no user's historical data is classified by migration. Keep partial implementation explicitly local/incomplete until the full manifest and all tasks pass.
4. Test exact arithmetic/contracts, ordinary-role denial, native cross-scope failures, old receipts, concurrency, revocation while waiting, allocation limits, report coverage and fixture-only imports. Run current Nx database, type, lint, unit and integration targets; compare the declarative tree with replayed history.
5. Update the catalogue, current local guides, tool inventories, dated verification, source reconciliation evidence and remote limitations under OpenSpec. Review and synchronize this change only through the normal workflow after implementation.

Rollback strategy: do not reset or reverse historical data. Before data-bearing services exist, an unused additive table/column can be removed by a separately reviewed forward migration. Once any new record exists, disable the affected tool branch and ship a forward fix; preserve source rows, receipts, original entries and correction chains. No deployment or live import occurs in this planning workflow.

## Open Questions

The exact source currency, paid-versus-forecast status of individual months, meaning of adjustment rows, authoritative debt snapshots/terms, accepted baseline dates, and account/category mappings are user-data decisions for import review. They cannot default to guessed values and do not block defining or implementing the guarded services. This change does not decide whether to repair the source sheet or choose an actual-data cutover date for the user.
