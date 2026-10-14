# Tasks

## 1. Exact value and tool contracts

- [x] 1.1 Package a reviewed SIX ISO 4217 currency/minor-unit snapshot with publication/source metadata and document the update policy in the local guide; verify deduplicated codes and zero-, two-, three-, and four-place currencies, excluding unknown and N.A. units, with unit assertions.
- [x] 1.2 Add closed TypeScript input/result contracts and exact decimal, name, UUID, and date validation for the four Finance tools; verify JSON numbers, exponent/nonfinite values, separators, raw excess scale including trailing zeros, overflow, negative/zero expense, valid negative opening balance, malformed text, and unknown fields with unit tests.
- [x] 1.3 Add concrete calendar-date and workspace-local date handling without changing onboarding; verify leap days, invalid calendar dates, years 0001/0099, midnight/time-zone boundaries, canonical output, and frozen-date retry fixtures through unit tests.

## 2. Restricted access and shared transaction foundations

- [x] 2.1 Extend the complete declarative access tree only for the four required Finance tables and narrow lock columns, create and review a forward migration with the pinned CLI, and update the database guide; verify the migration contains no table/data/routine changes and pgTAP covers allowed service reads/inserts/locks plus denied Health, budgets/files, transaction edits, deletion, and ordinary-client access.
- [x] 2.2 Introduce the smallest shared transaction/receipt entry point needed for consistent request-before-workspace locking, active-session/consent checks, timeouts, and controlled conflicts; verify unchanged onboarding results and retries with existing unit/integration coverage and a lock-order regression case.

## 3. Finance context and transactional services

- [x] 3.1 Implement authorized Finance context, fixed 50-row keyset pagination, workspace time/date, and eligible verified-self summaries; include its Finance integration suite in the launcher's existing discovery and verify empty/read-only results, book/account selection fields, filtered ACLs, cursor scope/continuation, truncated-page handling, and absent ledger/balance leakage with disposable local fixtures.
- [x] 3.2 Implement atomic book plus owner-ACL creation using the existing create_book receipt operation; verify owner creation, active membership, derived currency precision, scope/purge denial, audit book identifiers, rollback, and identical-request recovery in local integration tests, and document the service contract in the local guide.
- [x] 3.3 Implement account creation with explicit currency/opening balance and self/null attribution using create_account receipts; verify owner/editor access, viewer/no-ACL denial, cross-workspace/book/currency rejection, active identifiable self checks, allowed negative balance, rollback, audit, and replay in local integration tests, and document its contract.
- [x] 3.4 Implement expense-only insertion using create_transaction receipts and canonical result values; verify matching active source account, positive exact money, fixed date, no destination/replacement/void metadata, authenticated actors, version one, book-linked audit, transaction rollback, and self/null attribution through local integration tests.
- [x] 3.5 Verify cross-service receipt behavior and concurrency with local integration fixtures: identical simultaneous keys produce one action/audit, distinct accepted keys allow multiple resources, actor/operation/workspace/payload conflicts disclose no result, viewer downgrades and revocations deny recovery, and purged/archived/purging/confirmed-failed scopes cannot be recreated; document the retry and truthful partial-setup rules.

## 4. MCP integration and conversational behavior

- [x] 4.1 Wire the services through existing runtime/handler dependencies and register the four strict MCP tools without adding Finance browser routes; verify discovery lists exactly six tools, new input/output/error contracts are closed, malformed/oversized requests fail, callers remain isolated, and both existing account-tool shapes and OAuth/session protections pass protocol tests.
- [x] 4.2 Add client guidance for retained purchase intent, focused missing-value questions, accepted English setup suggestions, explicit currency, date and self/shared resolution, reuse of existing resources, cancellation, no redundant confirmation of complete instructions, and same-key recovery; verify metadata assertions and a documented synthetic conversation walkthrough including the hamburger, ambiguous pesos, multiple accounts, midnight retry, partial setup, and unsupported managed-person/correction cases.
- [x] 4.3 Update the OpenSpec index, catalogue service-use descriptions, local/database guides, remote deployment status boundaries, and established MCP Purpose to reflect the implemented local behavior; verify links and source/tool inventories agree, requirements outside the delta set and onboarding remain unchanged, preserved references/history stay intact, and no local test is described as a remote deployment.

## 5. Integrated verification

- [x] 5.1 Apply only the reviewed local migration and run the existing Nx database, function type/lint/unit, and integration targets including the Finance suite; verify disposable fixtures are cleaned after success/failure, the declarative tree matches reviewed history, and existing Auth/onboarding tests still pass without creating real user expenses or changing remote state.
- [x] 5.2 Validate the complete OpenSpec delta set strictly, check the renamed-plus-modified MCP requirement and complete preserved scenarios against current main specs, review the final implementation diff for excluded features and SQL routines, and record test/acceptance evidence with any deployment limitations before marking the change complete.

## Workflow follow-up

- Deploy the reviewed migration and function to the existing remote project only as a subsequent rollout action; refresh plugin discovery and verify connection behavior before claiming remote expense support.
- Record a real user expense only when the user supplies or accepts its required values and asks for that action.
- Sync the implemented delta specs and archive this change after review through the normal OpenSpec workflow.
