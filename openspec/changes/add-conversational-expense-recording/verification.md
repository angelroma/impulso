# Verification

## Implemented scope

The local Edge Function exposes six tools: the unchanged `get_session` and `onboard`, plus `get_finance_context`, `create_book`, `create_account`, and `record_expense`. Finance creation uses exact decimal strings, explicit currency, concrete dates, verified self or accepted null attribution, independent book permissions, transactional audit, and replay receipts.

The CLI-created `20261014010925_grant_impulso_finance_backend_access.sql` was reviewed and applied only to the local Impulso database. It adds narrow backend grants on four existing Finance tables; it changes no tables or data and adds no SQL function, procedure, or application trigger.

## Execution evidence

| Check | Result |
| --- | --- |
| `supabase:test-db` | PASS: 320 pgTAP assertions. |
| `supabase:test-functions` | PASS: 67 unit/protocol tests, including 14 Finance contract cases and five shared transaction/cursor cases. |
| `supabase:check-functions` | PASS: both Edge Function entry points type-check. |
| `supabase:lint-functions` | PASS: 27 source/test files. |
| `supabase:verify-schema` | PASS: all five migrations replayed in the comparison database; `No schema changes found`. |
| `supabase:test-integration` | PASS: four suites, 53 steps, zero failures. |
| Strict OpenSpec validation | PASS: this change and all three existing main specifications. |
| Native spec-merge preview | PASS: three capabilities rebuilt in memory without writing main specs or reporting warnings; the MCP requirement rename and modification apply together. |

Checks ran through the workspace's Nx targets. The integration launcher retains local-host/port restrictions and discovers the new Finance suite through its existing test-directory discovery. Disposable fixture resources and Auth/OAuth records are cleaned in `finally` blocks; failure-path cleanup was also exercised during development. No real user expense or remote project data was written.

The final integration run includes 22 Finance steps, six foundation steps, 12 OAuth/MCP steps, and 13 onboarding steps. It covers:

- Successful book/owner, account, and expense creation; exact zero-, two-, three-, and four-place currencies; early calendar years; authenticated actors; audit and receipt consistency.
- Independent viewer/editor/owner access, workspace/book/currency isolation, self/null attribution, archive and purge states, and current permissions during recovery.
- Identical-key concurrency, distinct accepted actions, actor/operation/workspace/payload conflicts, retired receipts, late-failure rollback, and shared request-before-workspace locking.
- Delegated consent revoked while context and mutation requests wait for a workspace lock: both fail with `invalid_session`, with no Finance writes committed.
- Real local OAuth/PKCE and MCP HTTP/runtime wiring: a disposable authorized client creates a book and account, records an expense, repeats its request, and leaves exactly one transaction, audit event, and receipt.
- Existing Google-linked identity checks, provider-spoofing denial, account onboarding, refresh, consent revocation, and signed-out session rejection.

## Issues found and resolved

The first Finance pagination run exposed timestamp precision loss in a bound cursor parameter: the PostgreSQL client inferred a timestamp and converted through a JavaScript Date, dropping microseconds and repeating the first page. Binding via text before the timestamp cast preserves the full six-place value. The final 51-book and 51-account tests return 50 rows followed by one distinct row.

The first full integration attempt found the local Edge Functions runtime absent: public health returned `503` with a name-resolution failure. Starting `supabase:serve-functions` restored public health to `200`; the complete subsequent run passed. The database was not reset. The local function-serving session remains active for development.

## Documentation and acceptance

The [synthetic conversational review](acceptance.md) contains 11 fixture-only scenario groups for missing values, ambiguous pesos, accepted setup, custom names, complete instructions, multiple choices, dates/midnight retries, cancellation, partial setup, uncertain outcomes, and unsupported requests. It is a model/client desk review, not proof of every external client's behavior. Protocol and integration evidence above verify the actual server boundaries separately.

Static review checked 160 local Markdown targets/anchors before adding this verification record, with no failures. Fifty-two protected source/history/SQL files matched their existing hashes, including the original Spanish model, public Site identity, archived changes, existing onboarding spec, unchanged table/view definitions, and four historical migrations. The existing main MCP Purpose was updated as planned; its requirement blocks remain unchanged until spec synchronization.

The merge preview produces 10 database requirements/17 scenarios, 18 Finance requirements/43 scenarios, and 10 MCP requirements/17 scenarios. No existing scenario is discarded. Current requirements are tracked in the delta files until normal synchronization and archive.

## Deployment boundary

The hosted version 2 application and plugin remain at their existing account-only deployment. Remote privilege migration, function deployment, plugin refresh, and remote Finance verification have not been performed. Income, transfers, corrections, balances, managed-person creation/resolution beyond self, sharing, Health, budgets, files, and purge execution remain outside this change.
