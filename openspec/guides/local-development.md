# Local MCP, OAuth and Edge Functions

Impulso's backend lives in `apps/supabase/functions` and runs in Supabase Edge Functions. A local MCP client initiates OAuth, the browser handles Google sign-in and connection consent, and the conversation collects accepted onboarding and Finance values. Local source includes scoped ledger, planning, debt, wealth, report and reviewed import services through a fixed 20-tool MCP surface. Business logic stays in transactional TypeScript; the 40-table declarative model uses native constraints, indexes, RLS and privileges. No custom PostgreSQL functions, procedures or application triggers are created.

This guide covers local development endpoints. The checked-in client entries use the hosted version 3 deployment, which exposes the same 20 tools and has ten reviewed migrations and 40 RLS-enabled application tables. Select the local endpoint explicitly to exercise this computer's development stack. See the separate [remote rollout verification](remote-deployment.md#finance-rollout-verification) for hosted migration/deployment, refreshed plugin discovery and authenticated session evidence. Existing conversational onboarding guidance applies to both environments. Implementing or deploying the import services does not authorize importing the user's workbook or modifying its source cells.

## Connect from a local client

Keep the Supabase stack and `supabase:serve-functions` running. This one serving process hosts both the MCP API and authorization screen. The MCP URL is:

```text
http://127.0.0.1:54321/functions/v1/impulso-api/mcp
```

The repository includes a project-scoped Codex entry in `.codex/config.toml` and a Claude Code HTTP entry in `.mcp.json`. Neither contains credentials. Each client completes its own OAuth connection. Claude Code exposes connection management through `/mcp`. To select the local endpoint instead of the hosted entry, pass its URL explicitly when starting Codex login from PowerShell:

```powershell
codex -c 'mcp_servers.impulso.url="http://127.0.0.1:54321/functions/v1/impulso-api/mcp"' mcp login impulso --scopes openid,email,profile,offline_access
```

Sign in with Google, review the requesting client and allow or deny its connection. After approval, return to the client and ask it to use Impulso. It checks `get_session` and, when setup is required, offers a short name menu and an understandable time-zone suggestion before reviewing the complete setup with you. The client sends a canonical IANA time zone behind the scenes only after you accept that review. No setup form is required in the browser. The assistant never needs your password, access token or database credentials in conversation.

This endpoint is local to this computer. Local desktop/CLI clients need Streamable HTTP and OAuth support. A hosted custom MCP form cannot reach loopback directly; the optional [local tunnel setup](local-tunnel.md) describes the relay alternative while Supabase stays local. That tunnel's runtime connection remains unverified. Browser sign-in for the local stack must still run on this computer. The deployed remote endpoint uses HTTPS without this tunnel. See the official [Codex MCP guide](https://learn.chatgpt.com/docs/extend/mcp?surface=cli) and [Claude Code MCP guide](https://code.claude.com/docs/en/mcp) for client-specific behavior.

## MCP tools

| Tool | Purpose |
| --- | --- |
| `get_session` | Return the authenticated account and whether setup is required, complete or unavailable. Email is returned only when the OAuth session includes the email scope. |
| `onboard` | Create or recover the user's personal workspace after acceptance of a complete review, using confirmed `display_name`, `workspace_name`, canonical IANA `timezone` and UUID `request_id`. |
| `get_finance_context` | Return authorized active book/account choices, workspace time zone/current local date, verified self choice, rights, and bounded continuation; inspection creates nothing. |
| `create_book` | Create an accepted named book with explicit currency, server-derived minor unit, and the actor's initial owner grant. |
| `create_account` | Create an accepted account in an authorized book with explicit currency, exact opening balance, and verified-self or shared/unassigned attribution. |
| `record_expense` | Commit one positive sourced expense with exact amount, concrete date, description, and resolved self/null beneficiary, together with audit and receipt. |
| `configure_account` | Review an account's type and opening date with its expected version, without changing the opening amount. |
| `manage_category` | Create, rename, archive or list scoped income/expense categories, or classify an existing compatible transaction with a version check. |
| `record_transaction` | Record accepted income, expense or transfer components, individually or in an atomic group of at most ten entries, with optional settlement links. |
| `correct_transaction` | Void or replace a current movement with a reason, expected version and explicit reconciliation of every affected allocation. |
| `list_transactions` | Read filtered, permission-scoped keyset pages of effective or voided movements and preserved correction links. |
| `get_finance_report` | Read exact balances, cash flow, plan comparisons, upcoming commitments, goals or signed net worth with coverage and freshness disclosures. |
| `manage_budget` | Create, revise, archive or inspect book/category limits independently of actual spending and plans. |
| `manage_plan` | Create, revise, cancel or inspect expectations and recurrence; materialize at most 100 occurrences; link or revoke actual settlement evidence. |
| `manage_debt` | Create, revise, archive or inspect accepted loan/card terms for an existing compatible liability account; no automatic amortization. |
| `manage_goal` | Create, revise, cancel or inspect goals, and set/release accepted earmarks against eligible supported funds. |
| `manage_asset` | Create, revise, archive or inspect separately identified manual holdings; append or replace accepted dated manual/investment valuations. |
| `preview_finance_import` | Freeze and review a bounded synthetic or separately authorized source manifest, mappings, reconciliation and blockers; no money is posted. |
| `commit_finance_import` | Commit one ready, reviewed bounded batch using its digest, expected versions and current authorization. |
| `get_finance_import` | Read authorized batch progress and bounded source/result rows; a partial job is not an all-workbook transaction. |

Tool descriptions and initialization instructions guide the conversation; they do not enforce conversational consent or replace authorization. The server independently validates identity, fields, current access and idempotency. Users cannot select an actor by providing a user ID. There are no arbitrary SQL, bank execution, Health or file tools. Onboarding alone never records an expense; Finance is a separate accepted action. The synchronized [expense baseline](../specs/finance-expenses/spec.md), [MCP authentication](../specs/mcp-authentication/spec.md) and unchanged [conversational onboarding](../specs/conversational-onboarding/spec.md) requirements are supplemented by the active [personal planning deltas](../changes/adapt-finance-to-personal-planning/specs) until their normal synchronization.

The transport uses a pinned official MCP SDK and stateless Streamable HTTP. Its protected resource metadata is served at `/functions/v1/impulso-api/.well-known/oauth-protected-resource`; unauthenticated MCP responses advertise that URL in `WWW-Authenticate`. OAuth authorization, registration, code exchange and refresh remain Supabase Auth responsibilities.

## Finance contracts and transactions

Finance is available only through authenticated MCP; no direct Finance browser routes were added. Inputs use closed action-specific objects with validated UUIDs, canonical uppercase currency codes and well-formed user text. Unsupported actions, arbitrary fields, SQL, tokens and caller-selected actor IDs are rejected. Nullable attribution fields mean an explicitly accepted shared/unassigned choice; a missing person is not permission to substitute self or null. The six original contracts remain compatible. The table below retains their creation/context reference; extension contracts are canonical in [ledger_contracts.ts](../../apps/supabase/functions/_shared/ledger_contracts.ts), [planning_contracts.ts](../../apps/supabase/functions/_shared/planning_contracts.ts), [report_contracts.ts](../../apps/supabase/functions/_shared/report_contracts.ts) and [import_contracts.ts](../../apps/supabase/functions/_shared/import_contracts.ts).

| Tool | Required inputs | Optional inputs | Committed result or context |
| --- | --- | --- | --- |
| `get_finance_context` | `workspace_id` | `book_id`, `cursor` | Workspace ID, `timezone`, `current_local_date`, authorized `self`, `can_create_book`, `books`, `accounts`, `selected_book`, and `next_cursor`. |
| `create_book` | `request_id`, `workspace_id`, `name`, `currency` | None | `status`, workspace/book IDs, name, currency, and server-derived `minor_unit`. |
| `create_account` | `request_id`, `workspace_id`, `book_id`, `name`, `currency`, `opening_balance`, nullable `person_id` | None | `status`, workspace/book/account IDs, name, currency, canonical opening balance, and person choice. |
| `record_expense` | `request_id`, `workspace_id`, `book_id`, `source_account_id`, `amount`, `currency`, `occurred_on`, `description`, nullable `beneficiary_person_id` | None | `status`, workspace/book/source-account/transaction IDs, canonical amount/currency/date/description, and beneficiary choice. |

Context returns at most 50 rows ordered by creation time and ID. Without `book_id`, it lists only active books with a current owner/editor/viewer grant. With it, the selected book is authorized before listing active accounts. Book summaries include currency, minor unit, role, and creation/recording rights; account summaries include only ID, name, currency, and person association. No ledger entries or balances are exposed. Cursors are bounded and bound to workspace/query mode/book, and each page rechecks current access. Continue a truncated result before treating one choice as unique. An empty authorized list does not prove no inaccessible books exist.

Every call requires active workspace membership. Only book creation derives authority from that membership; existing-book reads require its independent grant, and every Finance mutation and recovery requires owner/editor. A nonnull new attribution must be the actor's verified active self in the same workspace, with current identity link and basic-person access. Other people require future resolution services and must never be silently replaced by self or null. Archived and applicable purging/retired scopes, including confirmed failed purges, are blocked.

Monetary values are decimal strings, never JSON numbers. Raw spelling is checked before normalization and hashing, without binary floating point or rounding: reject nonfinite/exponent/separated values, excess currency scale even when trailing zeros, more than 16 integer digits, and nonpositive expenses. Opening balances may be negative or zero. Accepted values are returned at fixed book precision. Supported currency comes from the packaged snapshot below; account/expense currency must match the book. Language, location, time zone, and pesos alone do not resolve currency. Names have a 200-character limit and descriptions 2,000; user content is preserved in its original language after surrounding whitespace is removed.

Dates must be actual Gregorian `YYYY-MM-DD` dates in years 0001 through 9999. Use reliable message-time context in the stored workspace zone when available; otherwise propose and disclose the server context's current local date. Obtain acceptance of proposed dates, clarify relative/ambiguous wording, and freeze the concrete date before submission or retry. Ambient location never changes the stored workspace zone. There is no future-date ban or funds check: a ledger expense does not make a bank payment.

Each mutation uses its own UUID and commits resource rows, one successful book-linked Finance audit and one receipt atomically. `create_book` includes its owner ACL; `record_expense` retains its original `create_transaction` operation and version-one fingerprint. New ledger/domain/import operations have distinct operation identifiers and version-two canonical fingerprints; reusing a legacy UUID through a new contract conflicts instead of upgrading its receipt. The native allowed identifiers are defined in [operation_receipts.sql](../../apps/supabase/schemas/private/tables/operation_receipts.sql). Audit stores identifiers and changed-field names, not descriptions, source contents or amounts. Mutations lock the request before the actor/workspace/book, then sorted accounts and related resources, and recheck current session/consent and scope access around protected work.

Identical retries keep their original UUID, canonical payload and resolved date. Authorized recovery returns `already_processed`; successful first responses use each tool's closed action-specific status, preserving `created` for the original creation tools. Request IDs are global across actors and operations, with controlled conflicts for incompatible payloads/scopes. Current write rights are required even for recovery; a prior receipt cannot override revocation or viewer downgrade, and retired resources are never recreated. Lock timeouts are retryable with the same unchanged request. Distinct accepted UUIDs represent distinct actions even when names or amounts match; immutable recurrence/source identities additionally prevent duplicate occurrences or consumed source cells.

Setup calls are separate transactions. If a book commits and account creation, configuration or recording later fails, report the existing setup precisely, retain its IDs and retry only the uncertain action with its original key. An account created through the unchanged legacy contract starts with kind `unknown` and no opening date; a failed configuration does not mean account creation failed. Never claim an expense was recorded before committed success/recovery, delete completed setup to hide partial progress, or use a new key to guess at an uncertain result. Managed-person creation, sharing, files, Health, purge execution, external bank payments, automatic amortization, pricing feeds and currency conversion remain unsupported.

### Ledger and balance boundaries

Use `record_transaction` for new income, expense or transfer instructions; keep `record_expense` compatible for existing clients. Income has only a destination, expense only a source, and a transfer two distinct same-book accounts. Borrowing, principal repayment, card repayment and contributions to an owned investment are transfers. A card purchase, accepted interest or fee is an expense. Component groups have one parent request, distinct immutable child requests and no additional monetary effect. A correction retains the original entry and inserts a replacement after explicitly reconciling every dependent settlement; category changes use their own versioned relation rather than editing posted values.

Account type and opening date require explicit review. The opening amount is start-of-day; a supported balance includes effective movements on that date through the requested `as_of` date. Unknown or later opening boundaries produce unavailable/incomplete balances. Neither creation time nor a monthly spreadsheet total supplies an opening date. Posted amounts, dates and account references remain immutable; only controlled void/version metadata changes. Positive liability positions are credits, not amounts owed. `configure_account` does not edit opening amounts.

### Expected activity, repayment evidence and budgets

`manage_plan` stores either accepted typed component lines or a positive quoted total with unresolved components and no invented lines. Resolving a quoted total requires an exact component sum and current version. Plans never create actual money. A month-only expectation has a null due date and cannot be called overdue from an invented date. Monthly/annual rules require accepted interval, start/end periods, optional due day and explicit `last_day` or `reject` policy for short months. Each materialization is capped at 100 occurrences and occurrence identity prevents duplication even with fresh request keys. Rule revisions preserve settled history and update only eligible future unsettled occurrences.

Settlement references actual nonvoid compatible components and cannot exceed each movement's available amount across plans. Matching, reversal and correction use serialized transactions and retained allocation history. Plan inspection exposes bounded allocation identifiers and versions for explicit later reconciliation. Outstanding and excess amounts are calculated per component: overpaying principal does not settle an unpaid interest component. Partial/excess payments and independently derived overdue status do not imply a bank executed a payment. Cancellation preserves actual records and linked history. Budgets are independent interval/category/person limits; comparisons use each exact accepted inclusive interval. Unsupported summary precision or person coverage returns incomplete budget coverage with null used/remaining amounts instead of a guessed allocation. Whole-book and category caps overlap as comparisons and are never added as extra forecast expenses.

### Goals, assets and report assumptions

Goals earmark supported existing funds and create no account movement or additional asset. Eligible funding accounts are reviewed cash, bank or investment accounts with an accepted opening boundary. Active earmarks from one account use a shared accepted funding basis and cannot exceed available backing when set. Valuation funding requires an accepted applicable investment valuation; the disclosed freshness limit defaults to 90 days and accepts 1–3660 days. Later withdrawals or valuation changes can underfund goals; reads disclose the shortfall rather than rejecting genuine ledger activity.

Manual assets require accepted identity/ownership text and confirmation that they are distinct from ledger holdings. A valuation targets exactly one manual asset or investment account; zero is a known value, while no accepted valuation is unknown. Corrections append replacement evidence and retain the original. Net worth uses signed account positions once, replaces an investment's ledger value with its accepted applicable valuation and includes separately identified manual assets once. Future values, goals and planned purchases do not add current wealth; currencies are not converted or summed together.

Reports require explicit book scope, date interval and `as_of`, with a horizon at most 36 months. They return exact decimal totals and their coverage/issues using one bounded SQL snapshot with current authorization checked around it. Forecasts state their supported baseline and apply only outstanding expected components; missing dates/accounts, unresolved components and accountless monthly summaries limit completeness. Reports are scenarios, not promised balances or investment advice. Read pages default to 50, cap at 100 and bind continuation to scope and filters; oversized reports return a controlled limit outcome instead of silent truncation.

### Reviewed workbook import

Existing connected Sheets tools prepare a frozen, bounded manifest; Edge Functions do not fetch arbitrary URLs or gain new Google scopes. A preview contains at most 100 rows within the existing 32 KiB body limit, preserves original source text and cell/month identity, and evaluates neither formulas nor instructions contained in cells. Source selection starts empty. Derived Dashboard rows and hidden backup/archive candidates need explicit exclusion/selection review, not automatic duplication.

Only separately accepted role, currency, mapping, dates, parsing and reconciliation can make a batch ready. The parsing rule's optional `amount_sign` is `preserve` by default; `absolute` requires explicit review of the source's negative-expense convention and never silently changes a sign. Month-only actuals become provenance-preserving monthly summaries without invented day, account, person or bank effect; month-only plans retain null due dates. Coverage selects detail or summary authority for a book/month/kind/category key and detects new/changed overlapping detail. A commit needs the frozen digest, expected batch/target/coverage versions, cleared blockers and current writer access. Imported detailed entries with settlement links include the referenced `plan_line` and its current version in `expected_targets`. Bounded batches commit independently and report committed, blocked and pending progress truthfully. Changed source evidence needs explicit reviewed replacement, not a fresh UUID used as a duplicate workaround. The [synthetic acceptance cases](../changes/adapt-finance-to-personal-planning/synthetic-acceptance.md) explain the source discrepancy and review boundaries; the real workbook has not been imported or repaired.

## Guided conversational setup

The [conversational-onboarding specification](../specs/conversational-onboarding/spec.md) is the canonical behavior contract for session-state handling, suggested workspace names, preserved user names, city-based time-zone suggestions and acceptance of one complete review. Keep client guidance aligned with that spec rather than maintaining another normative copy here.

The wire contract remains `request_id`, `display_name`, `workspace_name` and canonical IANA `timezone`. The backend does not supply the user's location, time zone or display name; contextual suggestions come from the conversation or actual client context. Pending choices stay in conversation context, with no draft table, extra tool or location permission. After acceptance, identical retries reuse their UUID and unchanged payload; a changed submission needs a new UUID, and an uncertain earlier result calls for checking `get_session` first. Existing-workspace recovery does not rename the workspace or change its time zone.

### Conversational acceptance checklist

These are operational acceptance cases for the linked spec, not a claim that every connected client has passed them. Protocol tests verify advertised instructions and tool contracts; review actual conversation behavior separately. Use mocked responses or disposable local fixtures for account-state and write cases, and stop before creating a real user's workspace during a dry run.

| Case | Expected behavior |
| --- | --- |
| `required` setup | Retain the original request, explain the workspace and guide setup without claiming the original action succeeded. |
| `complete` or `unavailable` setup | Skip creation; explain `unavailable` without restoring resources. |
| No workspace name | Offer exactly Orbit/Momentum/Launchpad, recommend Orbit and accept a name or displayed number. |
| Supplied names | Preserve a custom name such as `Mi Universo`; ask for a display name only if missing. |
| Actual client zone hint | Suggest its friendly city-based time without claiming verified location or asking for IANA syntax. |
| Conflicting user preference | Prefer the user's explicit location over a different client hint. |
| No context | Ask for city/country and do not choose UTC or infer location from identity or infrastructure. |
| Ambiguous city or multi-zone country | Ask for a region or city before resolving the zone. |
| Fixed-offset-only input | Ask for a relevant city/region rather than treating the offset as a named time zone. |
| Natural-language correction | Resolve "Madrid, Spain" internally, then show an updated complete review before any write. |
| Complete review accepted | Submit accepted names and canonical IANA zone once with a UUID; do not ask the user to repeat all values. |
| Name selection, change or cancellation | A name choice alone and cancellation never call `onboard`; a change receives a revised review. |
| Retry or uncertain result | Preserve the UUID/payload for identical retries; check session state before a changed submission and use a new UUID for changed values. |

## Endpoints

The local base URL is `http://127.0.0.1:54321/functions/v1/impulso-api`.

| Request | Authentication | Response |
| --- | --- | --- |
| `GET /health` | Public | Service liveness: `status` and `service`. |
| `GET /session` | A verified user bearer token | Only the signed-in user's `id` and `email`. |
| `POST /onboard` | A verified Google OAuth user session | `workspace_id`, `person_id`, and `status`: `created` or `already_processed`. |
| `POST /mcp` | An authorized OAuth client session for a verified Google-linked account | MCP initialization and tool requests. |
| `GET /.well-known/oauth-protected-resource` | Public | The canonical MCP resource, authorization server and identity scopes. |

Unsupported paths, methods and query parameters are rejected. API keys and service credentials do not substitute for a user's bearer token. A direct browser session is not an MCP client grant. Session responses and errors have `Cache-Control: no-store`. Responses use English messages and never expose raw database errors or credentials.

The API function's platform `verify_jwt` is false because the same entry point serves public health and OAuth discovery. Authentication is implemented explicitly on every protected route: Supabase Auth verifies the token before its claims are used, and SQL checks the active session. MCP additionally requires a real OAuth client session and current consent. The authorization function also disables the platform check because a browser must load its screen before signing in; privileged Auth operations still require the user's verified session. These settings do not make protected operations public.

The authorization function's local base URL is `http://127.0.0.1:54321/functions/v1/impulso-auth`. Its home page explains client connection, `/oauth/consent` displays the requesting client and scopes, and `/auth/callback` completes the application's Google PKCE flow. Its browser assets are served by the same Edge Function, without a Node HTTP server or another local port.

## Code layout

```text
apps/supabase/functions/
  .env.example
  _shared/
    auth.ts
    database.ts
    currency_snapshot.ts
    finance_contracts.ts
    finance_contracts_test.ts
    finance.ts
    finance_common.ts
    ledger_contracts.ts
    ledger.ts
    planning_contracts.ts
    planning.ts
    report_contracts.ts
    reports.ts
    import_contracts.ts
    finance_imports.ts
    http.ts
    onboarding.ts
  impulso-api/
    deno.json
    deno.lock
    index.ts
    handler.ts
    runtime.ts
    mcp.ts
    *_test.ts
  impulso-auth/
    deno.json
    index.ts
    handler.ts
    browser/
      client.js
      client.test.mjs
      index.html
      styles.css
    _generated/
      assets.ts
  tests/
    integration_test.ts
    onboarding_integration_test.ts
    oauth_mcp_integration_test.ts
    finance_integration_test.ts
    ledger_integration_test.ts
    planning_integration_test.ts
    reports_integration_test.ts
    finance_imports_integration_test.ts
```

- `auth.ts` validates bearer syntax, the verified account, issuer, audience, role, subject, expiry, optional not-before time and active session. Anonymous Auth users are rejected. The actor comes from verified request credentials, not an input parameter.
- `database.ts` provides a pooled PostgreSQL connection and shared identity transactions. Mutations acquire a request lock before account/workspace locks, with current session/consent checks, statement/lock timeouts, controlled retry errors, and rollback. Workspace helpers check active membership; Finance separately checks its current book ACL.
- `http.ts` provides controlled errors and a JSON object reader limited to 32 KiB, with an explicit field whitelist. Future write handlers must also validate their field types and business rules.
- `handler.ts` defines HTTP routing independently from runtime configuration so request behavior can be tested without live credentials.
- `onboarding.ts` validates confirmed names and IANA time zones, serializes request keys and accounts, checks existing access, and creates all initial records with audit/receipt writes in one transaction.
- `finance_contracts.ts` validates closed Finance inputs, exact decimal spelling, UUIDs, user text and concrete calendar dates; `currency_snapshot.ts` packages reviewed supported precision metadata. `finance.ts` implements permission-scoped context/pagination and atomic book/account/expense actions with audit and receipts.
- `finance_common.ts` shares current scoped authorization, deterministic locks, exact minor-unit arithmetic, version checks and version-two audit/receipt transactions. `ledger.ts`, `planning.ts`, `reports.ts` and `finance_imports.ts` implement their fixed families using their corresponding closed contract files; they do not expose a table selector or SQL endpoint.
- `impulso-auth/browser/` contains the authorization screen's editable browser sources. `scripts/build-auth.mjs` bundles the pinned browser SDK and embeds the assets in ignored `impulso-auth/_generated/assets.ts`. It is a build tool, not a server. `supabase:serve-functions` runs this build before serving both Edge Functions; rerun it after changing browser sources.

## Google sign-in, consent and onboarding

The local home page is `http://127.0.0.1:54321/functions/v1/impulso-auth`. Supabase redirects OAuth requests to `/functions/v1/impulso-auth/oauth/consent?authorization_id=...`. The page preserves the request across Google PKCE sign-in at `/functions/v1/impulso-auth/auth/callback`, clears callback parameters and verifies the signed-in account. It retrieves client and scope details from Auth and lets the user allow or deny the request. A previously approved grant may redirect immediately when Supabase reports that no additional decision is needed. The page does not create a workspace or collect onboarding fields. Sessions are stored in browser session storage. The authorization screen and business services run through the local Edge Runtime.

Serving this screen locally does not deploy it to Supabase Cloud. The hosted platform rewrites HTML responses to plain text on its default function domain; the existing remote deployment serves authorization assets through a ChatGPT Site instead. See [remote-deployment.md](remote-deployment.md) and the [official Edge Function limits](https://supabase.com/docs/guides/functions/limits#other-limits--restrictions). This restriction does not require a separate local web server.

Google is the only enabled external identity provider. The browser consent flow requires Google sign-in. A direct `/onboard` request requires an Auth-verified Google identity, confirmed email and the signed social OAuth method. A delegated MCP request requires a confirmed Google-linked account, a signed OAuth-server method, `client_id`, matching session scopes, a nondeleted OAuth client and an unrevoked user consent. Supabase creates a new delegated session and does not copy the original Google authentication-method claim into it; the backend does not pretend that it proves the original sign-in method. User-editable metadata never authorizes access. Anonymous sign-in and manual identity linking remain disabled. Review the provider boundary before enabling additional identity providers.

The OAuth server advertises `openid`, `email`, `profile` and `offline_access`; MCP requires `openid`. These scopes describe identity and refresh access, not Finance or Health permissions. Every application operation still enforces its own database grants and resource rules. Session/client/consent state is checked on each request and again within onboarding, Finance context, and Finance mutation transactions. Finance adds no OAuth scopes.

The pinned local Supabase Auth version (v2.197.0) issues access tokens with audience `authenticated`. It also omits `resource` when parsing standard form-encoded token exchanges, even though the JSON path checks it. This local deployment therefore uses one OAuth issuer exclusively for the single Impulso resource and validates that issuer, audience, client and active grant. It does not claim resource-URL audiences or multi-resource isolation. Before sharing this issuer with another protected API or deploying broadly, add and test resource-specific token audiences using supported Auth capabilities. No custom SQL hook has been added. The [Supabase OAuth security guide](https://supabase.com/docs/guides/auth/oauth-server/token-security) explains the distinction between identity scopes and application authorization.

`POST /onboard` accepts exactly `request_id` (UUID), `display_name`, `workspace_name` and `timezone`. The backend creates one workspace, active owner membership, self person, verified `self_registration` identity link, basic-person owner grant and alias `me`. It also writes one creation audit event and a receipt. The normalized payload hash and request key make retries safe. A fresh request key for an already onboarded user returns the same authorized workspace without changing its names or creating another profile. Archived, revoked, purging and retired resources are never silently restored. Finance setup is a separate explicit MCP action; Health enablement remains pending.

Each database client uses one connection and disables prepared statements for transaction-pooler compatibility. Remote database hosts require TLS with certificate verification. Plaintext is limited to recognized local hosts. SQL transactions have a five-second statement timeout and a three-second lock timeout.

## Local configuration and commands

Install workspace dependencies with `npm ci`. Deno is pinned as a local development dependency; Supabase provides its own Edge Runtime for serving functions.

Copy `.env.example` to `.env.local` in `apps/supabase/functions` if the local file is missing. `.env.local` is ignored by Git. It contains the expected public JWT issuer:

```dotenv
IMPULSO_AUTH_ISSUER=http://127.0.0.1:54321/auth/v1
IMPULSO_MCP_RESOURCE_URL=http://127.0.0.1:54321/functions/v1/impulso-api/mcp
IMPULSO_ALLOWED_ORIGINS=http://127.0.0.1:54321
```

Supabase supplies its internal `SUPABASE_URL` and public API keys. The backend requires a separate server-only `IMPULSO_DATABASE_URL` for the limited `impulso_backend` role; it does not use the administrator database connection. After applying the migrations, `configure-backend` privately generates a local password and writes that URL to the ignored function environment file, using Docker's stable `db` alias. It only configures credentials. Four column-only views in the unexposed `private` schema allow account IDs, session IDs/expiry/client/scopes, OAuth client deletion state and user consent/revocation state to be checked. These `postgres`-owned views use owner permissions, and timestamp-only UPDATE privileges preserve the existing locks on underlying account/session rows. Password hashes, refresh tokens and OAuth client secrets are outside the views. Ordinary client roles have no view access. See [the database workflow](database-workflow.md) for migration and legacy-grant cleanup. Never send database credentials or secret keys to the browser, classifier or MCP caller. Hosted provisioning and deployment require separate environment setup and are not performed by these local helpers.

`[auth]` uses `site_url = "http://127.0.0.1:54321"` and allows the exact application callback `http://127.0.0.1:54321/functions/v1/impulso-auth/auth/callback`. `[auth.oauth_server]` is enabled with `authorization_url_path = "/functions/v1/impulso-auth/oauth/consent"` and dynamic client registration. Registering a client does not grant it user access. The local stack publishes ES256 signing keys. Auth's `/auth/v1/.well-known/openid-configuration` and `/auth/v1/.well-known/oauth-authorization-server` discovery paths work locally; the gateway's `/.well-known/oauth-authorization-server/auth/v1` path returns 404, so standards-compatible clients use discovery fallback. Restart the local stack after Auth configuration changes using `supabase:stop-local` followed by `supabase:start-local`; the stop target preserves volumes. No reset is required.

Google credentials are stored separately in ignored `apps/supabase/.env.local`, using `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID` and `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_SECRET`. Both values come from the existing Google Web OAuth client. Its local Google callback remains `http://127.0.0.1:54321/auth/v1/callback`; the existing client also allows the remote callback documented in [remote-deployment.md](remote-deployment.md). Its previously registered JavaScript origins on port 3000 are unused by this regular server OAuth flow, which does not use Google's browser JavaScript SDK. Supabase's local application callback points to the authorization Edge Function. Nonce checking remains enabled. The current Google consent app is in External Testing with the owner registered as a test user; additional users must be added to that list before testing. See the [official Google setup guide](https://supabase.com/docs/guides/auth/social-login/auth-google).

The configured Google project is `impulso-8f723`, consent app `Impulso`, and Web client `Impulso Local Web`. Only basic identity scopes (`openid`, email and profile) are enabled. This setup does not grant access to Google Drive, Gmail or other Google account data. The local commands below do not modify the hosted Supabase project.

Run from the repository root:

```powershell
npx nx run supabase:start-local
npx nx run supabase:migrate-local
npx nx run supabase:configure-backend
npx nx run supabase:serve-functions
```

Serving stays active in that terminal. The target runs `supabase:build-auth` first and starts the local runtime for both `impulso-api` and `impulso-auth`. There is no separate consent server. In another terminal:

```powershell
npx nx run supabase:check-functions
npx nx run supabase:lint-functions
npx nx run supabase:test-functions
npx nx run supabase:test-auth
npx nx run supabase:test-integration
```

The integration launcher obtains credentials from local CLI status without printing or saving them. It refuses remote API/database hosts and ports, then passes the credentials to the Deno test process. It automatically discovers the local integration directory, including ledger, planning, reporting and import fixtures. Integration tests create disposable local accounts, OAuth clients, workspaces and Finance fixtures and remove them in `finally` blocks. OAuth protocol tests use an explicitly synthetic Google-linked account inserted by the local administrator; this is not evidence of a real Google provider login. Real Google sign-in was verified separately. These tests never onboard the user's actual account, read live source cells or record real user finances.

For later database changes, use the declarative workflow in [database-workflow.md](database-workflow.md). Apply reviewed pending local migrations with `npx nx run supabase:migrate-local` and run `npx nx run supabase:test-db`. These targets are not cached because they depend on the live local environment.

## Verification status

The following authorization/onboarding results were recorded on October 13, 2026 and remain historical evidence. Finance implementation results are tracked separately below; earlier counts do not validate the new tools.

The earlier authorization Edge Function migration passed type checking, linting, 39 Edge Function unit tests, 13 consent UI tests and all three local integration suites (29 live checks). These are historical results, not results for the guided setup change. The live checks include public HTML/JavaScript/CSS/configuration delivery, browser security headers, public-key-only configuration, unknown/source-file denial and exact native Auth redirects into the function. Existing coverage includes OAuth discovery fallback, dynamic registration, PKCE, explicit consent, code exchange, MCP initialization/tool calls, onboarding retries, refresh and grant revocation.

That local browser verification confirmed real Google sign-in returned through the function callback and displayed Codex's requested scopes. Declining the disposable connection returned `access_denied` to Codex. The local authorization home page also rendered in the in-app browser. Disposable accounts, clients and application records were removed. The user's real account was not onboarded or granted that test-client connection. The separate remote deployment and its verified checks are documented in [remote-deployment.md](remote-deployment.md); its status must not be inferred from local test results.

The guided conversational setup change passed all 43 function unit tests, type checks and lint, plus all three local integration suites covering 30 steps. Remote `impulso-api` version 2 contains the reviewed guidance. After ChatGPT refreshed tool discovery, a fresh agent received the new naming, time-zone and review descriptions, and real authenticated plugin `get_session` calls returned `required`. That deployment-verification stage stopped before onboarding the real account.

A separate fresh connected Codex agent completed a synthetic client/model walkthrough. It offered the three numbered names with Orbit recommended; selecting number 2 resolved to Momentum without creating resources. With a supplied display name and a synthetic Mexico City client hint, it showed a complete review. A user correction to Madrid, Spain produced a revised review using Madrid time and the internal `Europe/Madrid` value; cancellation stopped without a write. Additional cases preserved `Mi Universo`, asked for city/country when context was absent, clarified Springfield, a multi-zone country and a fixed offset, and skipped or explained hypothetical `complete`/`unavailable` states.

The walkthrough used synthetic scenario replies. Its complete/unavailable states and location hints were fixtures; accepted writes and retries were covered by protocol/local integration tests. A later real conversation completed the reviewed setup, reported successful workspace creation and confirmed a complete setup state. That follow-up does not turn every synthetic scenario into a human test or establish another client's behavior. Clients can cache metadata or handle instructions and time-zone context differently; refresh discovery when needed and validate them separately. Remote denial and revocation tests remain pending as documented in [remote deployment](remote-deployment.md).

### Historical expense baseline verification

The reviewed fifth privilege migration has been applied locally. All 320 database pgTAP assertions, 67 function unit/protocol tests, and 53 integration steps across four suites passed. Function type checks and lint passed, and replaying the five reviewed migrations produced no difference from the declarative schema. The [verification record](../changes/add-conversational-expense-recording/verification.md) documents concurrency, OAuth/MCP, consent revocation, fixture cleanup, and synthetic conversation evidence. These local results do not deploy source, apply the privilege migration remotely, refresh the hosted plugin, or create a real expense.

### Personal planning extension verification

The current local model contains 40 application tables with RLS, ten reviewed chronological migrations and 20 MCP tools. The final frozen local run passed 533 native database assertions across two SQL test files, 112 function unit/protocol tests and 106 integration steps across eight suites. Function type checks, lint and the authorization build passed through Nx. Replaying all ten migrations produced no changes against the declarative schema; inspection found zero application SQL routines or triggers, and the tracked local baseline remained intact after fixture cleanup. The [verification record](../changes/adapt-finance-to-personal-planning/verification.md) records exact results, repaired failures and preserved boundaries. The [synthetic walkthrough](../changes/adapt-finance-to-personal-planning/synthetic-acceptance.md) separately distinguishes scenario review from actual external-client behavior. No remote rollout, real workbook import or source repair is included.

### Hosted Finance rollout verification

The later authorized rollout published `impulso-api` version 3 and applied the six pending remote migrations, bringing the hosted model to ten versions and 40 RLS-enabled tables. Native ChatGPT plugin refresh displayed 20 tools (five read and 15 write), and an actual OAuth `get_session` call confirmed completed onboarding. These checks are separate from the local test counts above; see [remote rollout verification](remote-deployment.md#finance-rollout-verification) for their scope. Existing user records were preserved, and no salary, financial records or live workbook imports were created. Clients that cache earlier metadata may need fresh discovery.

## Remaining application work

Remote rollout and native plugin discovery are verified separately in the [hosted record](remote-deployment.md#finance-rollout-verification); the local suites do not establish every hosted financial action or client behavior. Before importing real records, the user must review authoritative source ranges, currency, actual-versus-planned meaning, adjustment rows, account/category mappings, dated baselines and conflicting totals. Existing opening amounts are not overwritten by import. The user's stated salary still requires its accepted recurring-plan details before recording. Other excluded capabilities remain managed-person creation/access, sharing, Health, files, purge execution, bank execution, automatic statement retrieval/amortization, pricing feeds and foreign exchange. Future services must preserve current lock order, authorization and history through TypeScript; arbitrary SQL remains unavailable.

## Currency snapshot provenance and updates

The Finance validators package [currency_snapshot.ts](../../apps/supabase/functions/_shared/currency_snapshot.ts), derived from SIX's [current ISO 4217 List One](https://www.six-group.com/dam/download/financial-information/data-center/iso-currrency/lists/list-one.xml), publication date September 17, 2026, retrieved October 14, 2026. The file records the source URL, publication date, retrieval date, and source SHA-256. Its 165 distinct currency codes include only assigned current entries with an integer minor unit from zero through four. Repeated country entries are deduplicated by code; conflicting units must stop an update. Entries with `N.A.` units, unknown codes, and withdrawn codes are excluded. Runtime validation uses the bundled snapshot and makes no external currency request.

To update it, retrieve the official current XML over HTTPS, inspect its publication date and changes, verify that duplicate codes agree, and regenerate the sorted numeric-unit map with its new provenance. Review the resulting diff and rerun the Finance contract unit tests through `supabase:test-functions`, including JPY (zero places), MXN (two), BHD (three), and CLF/UYW (four), plus unsupported and noncanonical codes. A registry update must not rewrite existing book currency or precision: existing books retain their stored minor unit, and services validate raw monetary strings against that unit before normalization or hashing. No currency is selected from a user's language, location, time zone, or an ambiguous word such as pesos.
