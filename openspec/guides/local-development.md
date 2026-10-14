# Local MCP, OAuth and Edge Functions

Impulso's backend lives in `apps/supabase/functions` and runs in Supabase Edge Functions. A local MCP client initiates OAuth, the browser handles Google sign-in and connection consent, and the conversation collects the confirmed onboarding values. The MCP tools call the existing transactional TypeScript service. Finance/Health operations, sharing and files are subsequent stages. No custom PostgreSQL functions, procedures or application triggers are created.

This guide covers the local development endpoints. The checked-in client entries now use the hosted deployment; see [remote-deployment.md](remote-deployment.md) for its endpoint and verified status. The same conversational setup guidance applies to both environments.

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

Tool descriptions and initialization instructions guide the conversation; they do not enforce conversational consent or replace authorization. The server independently validates identity, fields, current access and idempotency. Users cannot select an actor by providing a user ID. There are no arbitrary SQL, Finance or Health tools, and completing setup does not record an expense or medical event. The durable requirements are in [MCP authentication](../specs/mcp-authentication/spec.md) and [conversational onboarding](../specs/conversational-onboarding/spec.md).

The transport uses a pinned official MCP SDK and stateless Streamable HTTP. Its protected resource metadata is served at `/functions/v1/impulso-api/.well-known/oauth-protected-resource`; unauthenticated MCP responses advertise that URL in `WWW-Authenticate`. OAuth authorization, registration, code exchange and refresh remain Supabase Auth responsibilities.

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
```

- `auth.ts` validates bearer syntax, the verified account, issuer, audience, role, subject, expiry, optional not-before time and active session. Anonymous Auth users are rejected. The actor comes from verified request credentials, not an input parameter.
- `database.ts` provides a pooled PostgreSQL connection and transactional helpers. It checks and locks the session, locks the workspace, then checks current active membership. It rejects inaccessible or archived workspaces and rolls back failed operations. Workspace membership alone does not grant Finance or Health access; future domain services must verify the corresponding ACLs.
- `http.ts` provides controlled errors and a JSON object reader limited to 32 KiB, with an explicit field whitelist. Future write handlers must also validate their field types and business rules.
- `handler.ts` defines HTTP routing independently from runtime configuration so request behavior can be tested without live credentials.
- `onboarding.ts` validates confirmed names and IANA time zones, serializes request keys and accounts, checks existing access, and creates all initial records with audit/receipt writes in one transaction.
- `impulso-auth/browser/` contains the authorization screen's editable browser sources. `scripts/build-auth.mjs` bundles the pinned browser SDK and embeds the assets in ignored `impulso-auth/_generated/assets.ts`. It is a build tool, not a server. `supabase:serve-functions` runs this build before serving both Edge Functions; rerun it after changing browser sources.

## Google sign-in, consent and onboarding

The local home page is `http://127.0.0.1:54321/functions/v1/impulso-auth`. Supabase redirects OAuth requests to `/functions/v1/impulso-auth/oauth/consent?authorization_id=...`. The page preserves the request across Google PKCE sign-in at `/functions/v1/impulso-auth/auth/callback`, clears callback parameters and verifies the signed-in account. It retrieves client and scope details from Auth and lets the user allow or deny the request. A previously approved grant may redirect immediately when Supabase reports that no additional decision is needed. The page does not create a workspace or collect onboarding fields. Sessions are stored in browser session storage. The authorization screen and business services run through the local Edge Runtime.

Serving this screen locally does not deploy it to Supabase Cloud. The hosted platform rewrites HTML responses to plain text on its default function domain; the existing remote deployment serves authorization assets through a ChatGPT Site instead. See [remote-deployment.md](remote-deployment.md) and the [official Edge Function limits](https://supabase.com/docs/guides/functions/limits#other-limits--restrictions). This restriction does not require a separate local web server.

Google is the only enabled external identity provider. The browser consent flow requires Google sign-in. A direct `/onboard` request requires an Auth-verified Google identity, confirmed email and the signed social OAuth method. A delegated MCP request requires a confirmed Google-linked account, a signed OAuth-server method, `client_id`, matching session scopes, a nondeleted OAuth client and an unrevoked user consent. Supabase creates a new delegated session and does not copy the original Google authentication-method claim into it; the backend does not pretend that it proves the original sign-in method. User-editable metadata never authorizes access. Anonymous sign-in and manual identity linking remain disabled. Review the provider boundary before enabling additional identity providers.

The OAuth server advertises `openid`, `email`, `profile` and `offline_access`; MCP requires `openid`. These scopes describe identity and refresh access, not Finance or Health permissions. Every application operation still enforces its own database grants and resource rules. Session/client/consent state is checked on each request and again within the onboarding transaction.

The pinned local Supabase Auth version (v2.197.0) issues access tokens with audience `authenticated`. It also omits `resource` when parsing standard form-encoded token exchanges, even though the JSON path checks it. This local deployment therefore uses one OAuth issuer exclusively for the single Impulso resource and validates that issuer, audience, client and active grant. It does not claim resource-URL audiences or multi-resource isolation. Before sharing this issuer with another protected API or deploying broadly, add and test resource-specific token audiences using supported Auth capabilities. No custom SQL hook has been added. The [Supabase OAuth security guide](https://supabase.com/docs/guides/auth/oauth-server/token-security) explains the distinction between identity scopes and application authorization.

`POST /onboard` accepts exactly `request_id` (UUID), `display_name`, `workspace_name` and `timezone`. The backend creates one workspace, active owner membership, self person, verified `self_registration` identity link, basic-person owner grant and alias `me`. It also writes one creation audit event and a receipt. The normalized payload hash and request key make retries safe. A fresh request key for an already onboarded user returns the same authorized workspace without changing its names or creating another profile. Archived, revoked, purging and retired resources are never silently restored. Health and Finance are enabled explicitly in later operations.

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

The integration launcher obtains credentials from local CLI status without printing or saving them. It refuses remote API/database hosts and ports, then passes the credentials to the Deno test process. Integration tests create disposable local accounts, OAuth clients and workspace fixtures and remove them in `finally` blocks. OAuth protocol tests use an explicitly synthetic Google-linked account inserted by the local administrator; this is not evidence of a real Google provider login. Real Google sign-in was verified separately. These tests never onboard the user's actual account.

For later database changes, use the declarative workflow in [database-workflow.md](database-workflow.md). Apply reviewed pending local migrations with `npx nx run supabase:migrate-local` and run `npx nx run supabase:test-db`. These targets are not cached because they depend on the live local environment.

## Verification status

The following results were recorded during implementation on October 13, 2026. They are historical evidence; this documentation migration did not rerun services, integration tests or remote requests.

The earlier authorization Edge Function migration passed type checking, linting, 39 Edge Function unit tests, 13 consent UI tests and all three local integration suites (29 live checks). These are historical results, not results for the guided setup change. The live checks include public HTML/JavaScript/CSS/configuration delivery, browser security headers, public-key-only configuration, unknown/source-file denial and exact native Auth redirects into the function. Existing coverage includes OAuth discovery fallback, dynamic registration, PKCE, explicit consent, code exchange, MCP initialization/tool calls, onboarding retries, refresh and grant revocation.

That local browser verification confirmed real Google sign-in returned through the function callback and displayed Codex's requested scopes. Declining the disposable connection returned `access_denied` to Codex. The local authorization home page also rendered in the in-app browser. Disposable accounts, clients and application records were removed. The user's real account was not onboarded or granted that test-client connection. The separate remote deployment and its verified checks are documented in [remote-deployment.md](remote-deployment.md); its status must not be inferred from local test results.

The guided conversational setup change passed all 43 function unit tests, type checks and lint, plus all three local integration suites covering 30 steps. Remote `impulso-api` version 2 contains the reviewed guidance. After ChatGPT refreshed tool discovery, a fresh agent received the new naming, time-zone and review descriptions, and real authenticated plugin `get_session` calls returned `required`. That deployment-verification stage stopped before onboarding the real account.

A separate fresh connected Codex agent completed a synthetic client/model walkthrough. It offered the three numbered names with Orbit recommended; selecting number 2 resolved to Momentum without creating resources. With a supplied display name and a synthetic Mexico City client hint, it showed a complete review. A user correction to Madrid, Spain produced a revised review using Madrid time and the internal `Europe/Madrid` value; cancellation stopped without a write. Additional cases preserved `Mi Universo`, asked for city/country when context was absent, clarified Springfield, a multi-zone country and a fixed offset, and skipped or explained hypothetical `complete`/`unavailable` states.

The walkthrough used synthetic scenario replies. Its complete/unavailable states and location hints were fixtures; accepted writes and retries were covered by protocol/local integration tests. A later real conversation completed the reviewed setup, reported successful workspace creation and confirmed a complete setup state. That follow-up does not turn every synthetic scenario into a human test or establish another client's behavior. Clients can cache metadata or handle instructions and time-zone context differently; refresh discovery when needed and validate them separately. Remote denial and revocation tests remain pending as documented in [remote deployment](remote-deployment.md).

## Remaining application work

Before adding other writes, implement module-specific authorization, immutable fields, row versions, financial precision and opening-balance rules, ongoing owner existence, audit/receipt writes, archive checks and purge workflows. Related changes must use the transaction and lock order shared by all mutation paths. These rules belong in TypeScript services; the current public API exposes only onboarding as a mutation and never arbitrary SQL.
