# Implementation verification

## Baseline completed

The completed expense predecessor was synchronized into the main database, Finance expense, and MCP specifications without archiving it. All four main specifications passed strict validation. The supported-tools rename and all 43 predecessor expense scenarios are present.

Before new implementation edits, the existing Nx function suite passed 67 unit/protocol tests, and all four disposable integration suites passed 53 steps. The legacy expense HTTP/OAuth flow recovered its original request without creating another movement. Onboarding, authorization, lock order and consent revocation checks passed. Disposable resources were cleaned.

Preservation baselines record SHA-256 hashes for the five existing migrations and six critical source/instruction/reference files in the ignored local work directory. A separate read-only local database fingerprint captured workspace, person, book, account, transaction and receipt counts and identity/hash digests. All six resource sets were empty after fixture cleanup; no user records existed to classify or import. Later implementation edits to current source are expected, while prior migrations and original documents must remain intact.

## Current execution boundary

Implementation and verification target only the running local Impulso environment. Source workbook edits, actual financial imports, remote migrations/deployment and plugin refresh are separate actions. New import evidence uses synthetic fixtures, not a live workbook fetch. Application logic remains TypeScript; no custom PostgreSQL routine or application trigger is authorized.

## Completed local verification

Verified on October 14, 2026 UTC (October 13 in Mexico City). All commands ran through the local Nx targets; no reset, seed, remote migration or deployment was run.

All 32 implementation tasks are complete. Final static verification checked 37 active Markdown files, 223 local links/anchors and 21 preserved-source hash assertions. The nine-delta semantic preview composed cleanly with the synchronized predecessor and left the main specifications unchanged.

| Check | Observed result |
| --- | --- |
| `supabase:migrate-local` | Five new reviewed forward migrations applied, bringing local history from five to ten. |
| `supabase:test-db` | **533 pgTAP assertions passed**, two transactionally reverted files. |
| `supabase:check-functions` | Both Edge Function entrypoints passed type checking; the existing authorization assets built. |
| `supabase:lint-functions` | All function files passed lint. |
| `supabase:test-functions` | **112 unit/protocol tests passed**; the final combined Nx check/type/lint/unit run also passed. |
| `supabase:test-integration` | **Eight suites, 106 steps passed**, with disposable fixture cleanup. |
| `supabase:verify-schema` | All ten migrations replayed in the CLI shadow database; **No schema changes found** against the complete declarative tree. |
| Live local inventory | 40 application tables, all 40 with RLS; zero custom application PostgreSQL routines and zero application triggers. |
| Strict OpenSpec validation | Both active changes and all four current main specifications passed; all nine adaptation deltas composed successfully after the synchronized predecessor without writing the main specs. |

The five new CLI-generated migrations are additive ledger metadata, planning/debt/wealth, reviewed import support, committed replacement identity, and the narrow occurrence `rule_version` grant. The two final files repair behavior found during execution without rewriting already applied history. The first five migration hashes remain identical to the baseline. Native tests retain denial of posted-value updates, deletion, ordinary client access, Health/files and sensitive Auth objects.

The final read-only local inventory again found zero workspaces, people, books, accounts, transactions and receipts, matching the captured baseline after disposable fixtures were removed. The integration cleanup issue described below was resolved before that check. Managed Auth and Storage definitions were preserved. Source/history checks also verify the repository instructions, unchanged onboarding and legacy Finance contracts, original reference documents and archived records. Current service files are intentionally extended.

## Evidence covered

The original six MCP shapes and v1 expense fingerprint fixtures remain compatible. The exact 20-tool manifest has strict action branches, nested input/output validation, bounded pages/groups/bodies and verified caller isolation. The pinned SDK's discovery requires an object wrapper for root unions and output normalization; the published JSON schemas preserve each strict branch, and the original Zod contracts validate both callback boundaries. Protocol tests exercise malformed cross-branch inputs, controlled errors, missing dependencies and rejection of unexpected output.

Ledger fixtures cover income, expense, same-book transfers, card purchases and payments, immutable component groups, distinct child UUIDs, v2 recovery, classification races, void/replacement history, retired legacy receipts, bound cursors and independent viewer/writer grants. Planning fixtures cover exact unresolved/resolved debt components, monthly/annual recurrences and leap/day-31 behavior, current template revisions, atomic failures, concurrent allocation capacity, partial/excess component settlement, explicit correction dependencies, shared goal backing, valuation freshness and history.

Reports execute real PostgreSQL snapshot queries and exact integer arithmetic. Checks include transfer-neutral cash flow, signed liability credits, investment-value replacement, manual assets, unknown/pre-opening coverage, future/stale valuations, remaining-only projections, dates outside the forecast horizon, exact budget date/person/category intervals, unsupported summary precision, goal shortfalls and current attributed-person access. Principal overpayment cannot settle an unpaid interest component. Budget usage is null with an explicit issue when source coverage cannot establish the accepted interval.

Import fixtures cover the synthetic active years, derived Dashboard and excluded backup sheets, monthly precision, explicit numeric parsing/sign choices, immutable source text/formulas, the seven missing annual totals and exact **106827.04** difference. This is arithmetic evidence, never verified savings. Tests exercise unknown mappings/currency, partial coverage, stale targets and same-count changed-detail digests, reviewed summaries versus detail, role-changing source replacements, fresh-key duplicate attempts, competing consumption, bounded continuation, actor isolation and rollback after all writes.

The actual local HTTP flow uses disposable Supabase Auth users and synthetic administrator-owned Google identity links. It performs discovery, dynamic registration, consent, PKCE, code exchange, initialization, onboarding, the unchanged expense, new income and transfer, an exact report, one synthetic monthly-summary preview/commit and retry, refresh and denial/revocation checks. A ready import waits on a workspace lock while delegated consent is revoked; it then returns `invalid_session` and leaves no financial fact, success receipt or audit. A separate restored disposable grant verifies native Auth revocation and refresh denial. These fixtures prove the local integration boundary, not a new real Google provider login or a hosted plugin connection.

## Failures repaired before acceptance

- Stored four-place numeric values were normalized only at the database-read boundary before recurrence validation; raw currency precision remains strict. New occurrence lines receive fresh identities instead of copying template UUIDs.
- Committed replacement uniqueness no longer reserves source identity for draft previews. A forward migration retains one consumed successor while allowing independent reviews.
- Revising eligible future occurrences needed only `UPDATE(rule_version)`. A separate forward grant adds that metadata permission while native tests still deny changing `rule_id`.
- The import fixture's cleanup identifier construction was fixed. Its single residual synthetic workspace/user was explicitly scoped and removed; final cleanup and baseline counts passed.
- The OAuth wait fixture deliberately revokes consent; its separate native-revocation check now starts from a restored disposable grant instead of trying to revoke an already revoked grant.
- Report review found and repaired missing person-scope checks, monthly approximations for arbitrary budget intervals, out-of-horizon projection effects, component overpayment masking and unrelated measures affecting completeness.
- One intermediate HTTP run returned gateway failures while watched source files were still changing. After source stabilization and formatting, local health/metadata returned 200 and the complete frozen run passed all 106 steps. No failure was waived or hidden by a retry inside the tests.

## Documentation, decisions and rollout limits

The [database catalogue](../../reference/database-catalogue.md), [database workflow](../../guides/database-workflow.md), [local service guide](../../guides/local-development.md), [remote rollout guide](../../guides/remote-deployment.md), documentation index and [synthetic conversational acceptance](synthetic-acceptance.md) describe the implemented boundary. Link and preserved-source checks and semantic composition results were verified separately from runtime checks. No root `docs` directory was created.

The remote baseline remains version 2 with two account tools, four migrations and 23 tables. The six pending migrations after that remote baseline and the matching 20-tool source require a separate authorized rollout and plugin discovery refresh. Existing OAuth scopes and authorization hosting are unchanged.

Before any actual workbook import, review authoritative ranges/sheets, explicit currency, actual versus planned roles, adjustment meaning, account/category mappings, dated opening cutoffs, coverage and the conflicting totals. No live source repair or record import is included here. Managed-person lifecycle, sharing, Health, files, purge execution, bank/payment execution, automatic amortization, pricing feeds and foreign exchange remain excluded. Synthetic conversation review does not guarantee every external client's interpretation.

The change is ready for review and normal spec synchronization/archive when requested; implementation does not automatically archive it.
