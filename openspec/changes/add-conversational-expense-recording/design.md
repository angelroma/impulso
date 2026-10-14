# Design

## Context

See [proposal.md](proposal.md) for motivation and scope. The current `impulso-api` registers only `get_session` and `onboard`. Google/OAuth identity, current session and consent checks, a limited direct PostgreSQL role, explicit transactions, audit, and operation receipts already exist. Finance has tables and native structural constraints, but no runtime services or backend grants.

The existing receipt operation list already contains `create_book`, `create_account`, and `create_transaction`. Successful Finance audit rows require `book_id`. Books have independent ACLs; accounts have an optional person and a required opening balance; expenses require a source account, amount, currency, description, date, and request key. The model has no account balance column or default currency.

`withWorkspaceTransaction` currently locks a workspace before invoking its callback. Onboarding acquires the request advisory lock before the account/workspace locks. A Finance callback that acquires its request lock after the workspace lock would invert that order. This is a concrete shared-transaction integration concern, not a reason to add database routines.

## Goals / Non-Goals

**Goals:**

- Extend the existing Edge Function with a complete first-expense path and narrow, reusable validation/transaction primitives.
- Keep user identity, book authorization, and decimal/date correctness authoritative on the server while allowing helpful conversation guidance.
- Use existing tables and receipt/audit semantics, with only reviewed privilege changes to the declarative database model.
- Make the implementation independently testable locally without requiring a real purchase, user account write, remote deployment, or new frontend.

**Non-Goals:**

- A generic Finance CRUD framework, new ledger schema, account edits, balance reporting, bank integration, or a new OAuth provider/scope.
- Adding an external runtime currency service, trusting conversational confirmation as an authorization check, or claiming all future lifecycle rules are implemented.
- Editing current main requirements during planning. Delta specs describe the future behavior until the implemented change is synced.

## Decisions

### Extend the existing MCP endpoint with four closed contracts

Preserve both current tools and their exact schemas. Add these tools using shared TypeScript service dependencies in `impulso-api/runtime.ts`, `handler.ts`, and `mcp.ts`. Keep Finance available through authenticated MCP only; do not add direct browser Finance routes.

| Tool | Accepted fields | Result |
| --- | --- | --- |
| `get_finance_context` | Required `workspace_id`; optional `book_id`, `cursor`. | Workspace ID/time zone/current local date, eligible verified self choice, one page of authorized active books or accounts, and continuation cursor. |
| `create_book` | `request_id`, `workspace_id`, `name`, `currency`. | `status`, workspace/book IDs, normalized name, currency, and server-fixed minor unit. |
| `create_account` | `request_id`, `workspace_id`, `book_id`, `name`, `currency`, decimal-string `opening_balance`, nullable `person_id`. | `status`, workspace/book/account IDs and canonical accepted account values. |
| `record_expense` | `request_id`, `workspace_id`, `book_id`, `source_account_id`, decimal-string `amount`, `currency`, `occurred_on`, `description`, nullable `beneficiary_person_id`. | `status`, workspace/book/account/transaction IDs and canonical amount/currency/date/description/beneficiary values. |

All fields other than the context selectors are required; nullable fields express a deliberate shared/unassigned choice. Reject unknown fields, malformed identifiers, oversized input, actor IDs, arbitrary transaction kind, destination/replacement/void data, and database credentials. Mutation status is `created` or `already_processed`. MCP errors use the existing controlled `{ error: { code, message } }` convention. Names use the existing 200-character policy; descriptions use the 2,000-character table limit, with well-formed text and surrounding-whitespace normalization.

Separate services match the existing receipt operation names and allow reuse of already configured resources. A compound setup-and-expense tool would add a new operation contract and obscure which steps succeeded. Separate transactions require honest partial-progress reporting, accepted below.

### Keep discovery bounded and permission-scoped

`get_session` supplies the initial workspace ID; Finance calls keep the explicit workspace convention from the original design. An active selected workspace and membership are required on every context call. Without `book_id`, return only books with a current unrevoked owner/editor/viewer grant. With `book_id`, authorize that book before returning its active account summaries. Creation rights are reported from current ACLs; membership or workspace ownership never substitutes for a book grant.

Use fixed 50-row pages ordered by `(created_at, id)`, with a validated, bounded cursor bound to the workspace and query mode/book. Each page rechecks authorization. Return only selection fields, never raw ledger history, balances, unrelated people, or private receipts. Do not choose the only row in a truncated page as if the whole result were unique. An empty result means no accessible active choices, not proof that no other books exist.

The self choice comes from an existing verified `person_user_links` row, active person, and current basic-person ACL in the selected workspace. This slice permits only that self ID or explicit null for new account/expense associations. Requests involving another person explain that managed-person resolution is pending; they must not silently attach the entry to self. No person is created by a Finance action.

### Resolve intent with one useful setup review

Follow the unchanged onboarding flow first when required and retain the purchase request. Reuse explicit choices and authorized existing resources; ask focused questions only for unresolved amount, currency, account, person/shared choice, or date. "Pesos" is ambiguous without a resolved book or an explicit currency/country choice. Language and workspace time zone do not select a currency.

When setup is needed, suggest book `Everyday`, account `Main account`, and starting tracking balance `0`. They are options, not hidden defaults or a claim about a bank balance. Show the proposed setup and resolved expense together when practical; one clear acceptance can authorize those named setup actions and the expense. Preserve custom names and descriptions in their original language. A correction changes the review before writes.

A complete explicit expense instruction or already accepted resolved conversation values authorizes recording without redundant confirmation. Proposed values still need acceptance, including an omitted date proposed from the message date in the stored workspace zone. Capture a reliable message date when available; otherwise disclose the server context's current local date as the proposal. Clarify ambiguous relative dates, and freeze `occurred_on` before a write or retry. Do not change the stored workspace zone from ambient client location.

Cancellation before the first write leaves all resources unchanged. If book creation succeeds but account creation or recording later fails, report the completed setup precisely and retry the uncertain action with its original key. Do not claim a saved expense until its transaction commits, delete completed setup to hide partial progress, or blindly restart setup with new keys.

### Validate money exactly and package currency metadata

Use small TypeScript modules for the Finance contracts/service and exact validation, rather than a generic repository layer. Package a reviewed current ISO 4217 snapshot sourced from SIX, recording its publication date and provenance. Include only current codes whose minor units are integers from zero through four; reject `N.A.` units and unknown codes. Currency inputs require canonical uppercase codes resolved from the accepted conversation; reject noncanonical tool values. Book precision is derived server-side and immutable through these create-only tools. A future registry update must not rewrite existing books.

Validate decimal strings before any numeric conversion, hashing, or normalization that could hide invalid precision. Accept plain base-ten digits and an optional fraction; allow a leading minus only for opening balances. Reject exponent notation, separators, nonfinite values, excess raw fractional places even when zero, zero/nonpositive expenses, and magnitudes outside `numeric(20,4)`. Use string/BigInt arithmetic, not JavaScript floating-point conversion, and normalize accepted values deterministically to the applicable precision. Negative opening balances and resulting negative ledger balances are valid; this operation performs no bank payment or funds check.

For existing books, validate against stored currency and precision, including a trusted-supported-code check; never infer precision from locale. `occurred_on` must be a real `YYYY-MM-DD` date in years 0001 through 9999. Invalid dates and ambiguous user text never reach PostgreSQL as guessed values. No exchange, rounding, date-time column, or future-date prohibition is introduced.

### Reuse transaction protections without reversing lock order

Introduce the smallest shared transaction entry point needed to enforce a common order. Leave existing onboarding results and request semantics unchanged. Every context read and mutation rechecks current session/client/consent state in its transaction. Writes acquire the request UUID advisory transaction lock before account/workspace locks, then use one consistent order for workspace, active membership, book, book ACL, account, optional person/link/basic ACL, and applicable purge checks. Use stable UUID order for multiple rows. Preserve existing statement/lock timeouts and remote TLS/pooler configuration.

Check receipt actor and operation before exposing anything; a matching actor's purged receipt yields `action_retired` before looking for removed resources. For a completed receipt, recheck current scope and owner/editor permission, derive canonical validation using the stored resource context, compare the payload hash, and recover only its authorized result. Missing or retired resources cannot be recreated from a receipt. Request IDs are global: collisions across actors, operations, scopes, or normalized payloads yield generic `request_conflict`.

Each new write includes one successful Finance audit event with resolved `book_id`, one completed receipt, and all resource changes in the same transaction. `create_book` inserts its unrevoked owner ACL atomically; `create_account` uses the book's exact currency and accepted opening balance; `record_expense` sets kind `expense`, source only, null replacement/void fields, authenticated actors, and initial version/timestamps explicitly. Receipt operations are `create_book`, `create_account`, and `create_transaction` respectively. No stored database function or custom trigger is introduced.

Use a deterministic, versioned canonical payload hash including operation, scope/resource IDs, normalized names/text/money, currency, frozen date, and nullable person choice. Exclude retry-variable timestamps and the request UUID. Equivalent valid decimal spellings normalize identically, but invalid extra precision must be rejected before normalization. Different UUIDs are different actions: do not deduplicate legitimate repeated purchases by matching their descriptions or amounts. Book/account names are not unique keys and do not prove replay identity.

Archived resources and applicable approved/in-progress/completed purge states block new actions and recovery as appropriate; confirmed failed purges remain blocked. Person purge checks apply to nonnull associations. Context filters or rejects inaccessible/retired choices without revealing private record details. Use existing session, conflict, access, archive, purge, and retired-action errors, plus controlled validation codes. Lock timeouts are retryable with the same unchanged request; never return SQL details or treat an uncertain commit as permission for a new key.

### Change privileges through the canonical tree and a forward migration

Grant `impulso_backend` Finance schema usage and only the necessary SELECT/INSERT privileges on `books`, `book_access`, `accounts`, and `transactions`. Add narrow UPDATE-column grants on locked parent/ACL rows only where native PostgreSQL row locks require them. Do not grant transaction UPDATE, DELETE, Finance budgets/files access, broad schema grants, or Health access. These tools expose no account/book edits, balance mutations, ACL changes, or ownership transfer.

Edit the complete desired tree and use the pinned CLI workflow to create and review a new forward migration; do not rewrite the four existing migrations or iterate by changing the hosted dashboard. Preserve RLS and direct denial for `PUBLIC`, `anon`, `authenticated`, and `service_role`. Existing managed Auth/Storage objects and four private Auth views remain unchanged. Extend existing database assertions to verify the new positive and negative privilege boundary.

### Keep documentation and spec status honest

The `finance-expenses` delta defines the new flow. The existing database and MCP deltas change only requirements affected by the new services. Conversational onboarding requirements stay unchanged. During implementation, update the established MCP Purpose directly to describe authenticated account and Finance tools, since delta Purpose sections do not update established capabilities. Keep all unrelated existing requirement blocks intact until normal spec synchronization.

Update the documentation index, catalogue service-use descriptions, local testing guide, and remote deployment guide when the implementation is complete. Label undeployed features as local/source-verified until an explicit remote rollout verifies them. Do not rewrite preserved source documents or archived changes to make them appear current.

## Risks / Trade-offs

- [Separate setup mutations can partially succeed] -> Reuse committed IDs, retain request keys, and report exactly which stage completed; do not claim cross-call atomicity.
- [A conversational model can misresolve intent] -> Closed inputs, server authorization/value validation, explicit setup review, metadata acceptance scenarios, and no claim that a confirmation flag proves human consent.
- [RLS-bypassing backend gains Finance access] -> Restrict grants to four required tables, enforce independent ACLs inside each transaction, and test unauthorized/cross-scope paths.
- [Decimal or date coercion changes the record] -> Validate raw strings and actual calendar dates, freeze accepted values, and hash their canonical representation.
- [A metadata page is mistaken for all available accounts] -> Stable continuation and no uniqueness/default decisions from incomplete pages.
- [A registry update changes precision semantics] -> Version the bundled source, freeze existing book precision, and test zero-, two-, three-, and four-place currencies.
- [A transaction refactor regresses onboarding or deadlocks] -> Preserve its contract and cover simultaneous onboarding, context, Finance writes, revocation, and identical retries in local integration tests.

## Migration Plan

1. Implement and test contracts/validation, narrow grants and reviewed migration, transactional context/services, and MCP wiring through the existing Nx targets.
2. Apply only reviewed local migrations and run pgTAP, function unit/type/lint, and local integration checks with disposable fixtures. Ensure the integration launcher includes any new Finance test suite; its current suite list is explicit.
3. Update operating documentation and current scope descriptions, validate the delta set, and keep the production plugin's existing behavior until deployment.
4. A remote rollout is a separate action: inspect the destination and migration diff, apply the reviewed privilege migration before deploying code, deploy the existing function, refresh client tools, and perform an authorized smoke check without creating a real expense unless requested.

If code must roll back after rollout, redeploy the previous function bundle first. Keep any committed ledger data; remove added privileges only through a reviewed forward migration once no deployed code needs them. Do not reset the database or delete financial records as rollback.

## Open Questions

None affecting scope or acceptance. The proposal fixes the initial contracts, English suggestions, currency-source policy, self/shared boundary, and confirmation/retry behavior; no personal financial values are chosen here.

## Sources checked

- Canonical [Finance tables](../../../apps/supabase/schemas/finance/tables), [grants](../../../apps/supabase/schemas/access.sql), [audit](../../../apps/supabase/schemas/audit/tables/events.sql), and [receipt structure](../../../apps/supabase/schemas/private/tables/operation_receipts.sql).
- Existing [transaction helpers](../../../apps/supabase/functions/_shared/database.ts), [onboarding transaction](../../../apps/supabase/functions/_shared/onboarding.ts), [MCP contracts](../../../apps/supabase/functions/impulso-api/mcp.ts), and [integration launcher](../../../apps/supabase/scripts/run-integration.mjs).
- [SIX current ISO 4217 list](https://www.six-group.com/dam/download/financial-information/data-center/iso-currrency/lists/list-one.xml), publication date 2026-09-17, inspected during planning. It distinguishes integer minor units from `N.A.`; MXN, JPY, BHD, and CLF supply precision examples.
- Current Supabase [Edge Functions](https://supabase.com/docs/guides/functions) and [Data API security](https://supabase.com/docs/guides/api/securing-your-api) documentation. Changelog entries for [CBC TLS deprecation](https://supabase.com/changelog/cbc-tls-ciphers-deprecated) and [PostgreSQL 17.11 changes](https://supabase.com/changelog/postgres-15-19-17-11-breaking-changes) were checked; this plan retains verified TLS and existing PostgreSQL primitives and does not add affected extensions or custom operators.
