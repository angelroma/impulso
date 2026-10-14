# Remote deployment

Impulso's remote project is `txoorpmblpvqveeudafv`. Its API origin is `https://txoorpmblpvqveeudafv.supabase.co` and its Auth issuer is `https://txoorpmblpvqveeudafv.supabase.co/auth/v1`.

The public authorization page is published at `https://impulso-authorization.marmstud6.chatgpt.site` using the existing ChatGPT Site `appgprj_6acebb194398819192eeb6ec946a8c7b`. Its durable identity is in [authorization-site.json](../reference/authorization-site.json); reuse this ID when recovering the ignored Site checkout. This guide records deployment procedures and evidence; current product requirements live in [MCP authentication](../specs/mcp-authentication/spec.md), [database model](../specs/database-model/spec.md) and [conversational onboarding](../specs/conversational-onboarding/spec.md).

## Finance rollout boundary

The current remote deployment is `impulso-api` version 3 with all 20 tools, 40 application tables and ten reviewed migrations. The authorized Finance rollout applied the six chronological migrations after the earlier four-version baseline, then deployed the matching backend and refreshed the existing ChatGPT plugin. Its authenticated session and Finance context reads passed. The [rollout verification](#finance-rollout-verification) below records observed results; the [personal planning change](../changes/adapt-finance-to-personal-planning/verification.md) preserves the preceding local implementation evidence.

For subsequent rollouts, verify the Personal identity and destination, inspect pending migrations and the dry-run diff, apply reviewed chronological changes before deploying matching `impulso-api` source, then refresh client tool discovery. Reverify the expected manifest, original contracts, OAuth/session protection and authorized reads without creating real financial activity. Before any real import, separately review the workbook's source ranges, explicit currency, actual versus planned roles, account/category mappings, opening cutoffs, coverage and unresolved reconciliation. This rollout changed neither OAuth scopes nor authorization hosting.

If a rollout must be reversed, redeploy the previous function first and preserve committed ledger and import evidence. Remove added privileges only through a reviewed forward migration after no deployed source needs them; do not reset the remote database or delete financial records as rollback. New managed people, sharing, Health, files, automatic bank/payment execution, exchange-rate conversion and purge execution remain outside this rollout.

## Verified status on October 13, 2026

These are recorded observations from the earlier implementation and connection work, not a live health check for the Finance source. Reverify the relevant stage after future changes.

The remote database was created and checked: 23 application tables across six schemas, RLS on all 23 tables, four private Auth views, and no custom application PostgreSQL functions or triggers. Four reviewed migration versions were reconciled with the deployed schema. The native CLI listed all four versions and its database push dry run reported that the remote database was up to date.

The guided onboarding change passed all 43 function unit tests, type checks and lint through the Nx targets. Its local integration rerun passed all three suites covering 30 steps. Earlier browser authorization/build checks passed 17 tests and the database suite passed 256 pgTAP assertions; those suites were not rerun for this metadata-only change. The static authorization page builds from the existing browser code without an additional frontend framework.

The remote Auth JWKS endpoint responds successfully with an ES256 signing key, and its public OpenID configuration reports the expected remote issuer. This confirms the required asymmetric signing capability.

The public ChatGPT Site's version 2 is published. Eight live HTTP checks passed: exact consent and callback GET/HEAD responses return `200` without redirects, JavaScript and public configuration load, unknown paths return `404`, and POST returns `405`. All checked responses include CSP, no-store caching, no-referrer policy, frame denial and MIME protections. Three local Worker response tests also passed.

The verified Site source commit is `d9d2e02bcba6ebd19731c857e363ef05728408a5`, saved version is `appgprj_6acebb194398819192eeb6ec946a8c7b~appgver_0230521648d88191ac176095cdc57ed2`, and deployment is `appgdep_6acebd0a88d0819192e61d00015e98ab`.

Personal-account CLI identity and access to the Impulso project are verified. The remote configuration push enabled Google, the OAuth server and dynamic client registration, set the hosted site and exact callback, and restricted Data API exposure to `api`. Undeclared MFA and email settings were preserved.

The remote security adviser reported no WARN or ERROR findings. Its one INFO finding, `rls_enabled_no_policy`, reflected the intentional denial of direct client access to application tables.

The recorded `impulso-api` Edge Function deployment is active at version 2, with bundle SHA-256 `8acc712544a04415f92a5ea420b02feef59b33a209085d3a616db3694d6e43f2`. At that verification stage, retrieved remote `mcp.ts` matched the then-reviewed account-tool source after line-ending normalization; it does not match the later local Finance additions. The initial deployment's health and MCP metadata checks returned `200`, unsigned session and MCP requests returned `401`, and the browser CORS preflight returned `204`.

Google sign-in, the backend `/session` check of the active Google session and hosted database, consent approval and the OAuth return completed successfully. ChatGPT plugin `plugin_asdk_app_6acec007862c81918453ab99b17d90a0` is connected: its native page shows `Try in chat` and no longer shows `Continue connecting app`.

Server logs on October 13 confirm `/session` returned `200` at 23:48:32 and 23:48:49 UTC. Post-consent MCP POSTs returned `200` at 23:48:56, 23:48:58 and 23:49:01 UTC, and `202` at 23:48:59 UTC. The handler requires an OAuth client, the `openid` scope and a Google identity before accepting MCP requests, so these responses verify authenticated MCP handshake/discovery.

After ChatGPT's native Refresh tools action, fresh agent tool metadata contained the guided Orbit/Momentum/Launchpad choices, city-based time-zone correction and complete-review instructions. Real authenticated `get_session` invocations through the connected Impulso plugin succeeded and reported onboarding as `required`. That deployment-verification stage stopped before account creation. A fresh connected Codex agent also completed a synthetic walkthrough covering name choice, custom names, missing/ambiguous context, a Madrid correction, a revised review and cancellation. A later real conversation completed the accepted setup, reported workspace creation and confirmed a complete setup state. These observations do not guarantee every MCP client's behavior. See the separate evidence scope in [local development](local-development.md#verification-status). Remote denial and revocation tests remain pending.

## Use the Personal CLI profile

The existing nonsecret profile file is `C:\Users\anr10\.supabase-impulso-personal\profile.yaml`. Use its separate CLI state directory in each shell that runs remote commands. Remove the process-level Studio token override without printing its value:

```powershell
$env:SUPABASE_HOME = 'C:\Users\anr10\.supabase-impulso-personal'
Remove-Item Env:SUPABASE_ACCESS_TOKEN -ErrorAction SilentlyContinue
$impulsoProfile = 'C:\Users\anr10\.supabase-impulso-personal\profile.yaml'
npx supabase@2.120.0 whoami --profile $impulsoProfile
npx supabase@2.120.0 projects list --profile $impulsoProfile
```

The Personal identity and access to `txoorpmblpvqveeudafv` have been verified. Continue using this profile for remote commands. `--profile` takes this YAML path; `login --name` only supplies a dashboard token label. The separate profile and state directory preserve the Studio account's default CLI state.

## Prepare the public remote configuration

The existing HTTPS authorization Site is published using the Worker ESM static-response wrapper described in [authorization hosting](authorization-hosting.md). The isolated checkout is `work/impulso-auth-site`; its manifest preserves the Site ID and omits `static`. `worker/index.js` embeds the generated public browser assets, and its dependency-free build produces `dist/server/index.js` and the hosting manifest. All authentication, consent and application business logic stay in Supabase; the Sites wrapper serves public responses only. It introduces no SQL routines or database behavior. Do not create a replacement Site if the ignored checkout is missing. The configured origin has no path, query, fragment or trailing slash:

```powershell
$env:IMPULSO_AUTH_SITE_URL = 'https://impulso-authorization.marmstud6.chatgpt.site'
npm exec nx run supabase:prepare-remote-config
npm exec nx run supabase:test-remote-config
```

The preparation command writes only `work/remote-setup/supabase/config.toml`, inside the ignored work directory. It validates the exact HTTPS origin and fixes the destination to the existing Impulso project; an optional `IMPULSO_REMOTE_PROJECT_REF` must match that same reference. It does not read credentials, log secret values or contact Supabase.

The generated file declares only the Data API `api` schema, disables automatic exposure of new public tables, sets the hosted Auth site and exact `https://impulso-authorization.marmstud6.chatgpt.site/auth/callback` redirect, enables Google using the existing environment references, and enables OAuth consent at `https://impulso-authorization.marmstud6.chatgpt.site/oauth/consent` with dynamic client registration. The Google callback is `https://txoorpmblpvqveeudafv.supabase.co/auth/v1/callback`. It does not copy local password, MFA, SMTP, rate-limit, seed or database settings.

Supply `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID` and `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_SECRET` to the CLI process from the existing private configuration. These values stay out of the generated TOML. Configure the same remote Supabase callback in the existing Google OAuth client.

The initial minimal configuration push is complete. Preview the exact diff before any subsequent configuration update:

```powershell
npx supabase@2.120.0 config diff --project-ref txoorpmblpvqveeudafv --workdir work/remote-setup --profile $impulsoProfile
npx supabase@2.120.0 config push --project-ref txoorpmblpvqveeudafv --workdir work/remote-setup --profile $impulsoProfile
```

CLI 2.120.0 changes only properties declared by this sparse configuration. Review the displayed diff and confirm the Google credential references resolved before accepting it. Keep using the minimal remote work directory for configuration commands; the local development configuration contains additional settings that are unnecessary for this deployment.

## Publish the API and validate the complete flow

The restricted `impulso_backend` LOGIN role is provisioned, and four Edge Function runtime settings have been uploaded through owner-private temporary files that were removed afterward. The remote database connection uses the shared transaction pooler at `aws-1-us-west-2.pooler.supabase.com:6543` with username `impulso_backend.txoorpmblpvqveeudafv`. Prepared statements are disabled, with `max = 1` and `max_pipeline = 1`. The official public Supabase 2021 CA is bundled and TLS certificate verification remains enabled with `rejectUnauthorized = true`.

For future runtime updates, `IMPULSO_DATABASE_URL` must identify this remote backend connection. The public runtime values are:

```dotenv
IMPULSO_AUTH_ISSUER=https://txoorpmblpvqveeudafv.supabase.co/auth/v1
IMPULSO_MCP_RESOURCE_URL=https://txoorpmblpvqveeudafv.supabase.co/functions/v1/impulso-api/mcp
IMPULSO_ALLOWED_ORIGINS=https://impulso-authorization.marmstud6.chatgpt.site
```

Use `supabase secrets set --env-file <private-deployment-file> --project-ref txoorpmblpvqveeudafv --profile $impulsoProfile` with a private file outside version control. Do not copy the local database connection into the remote runtime. The static browser configuration uses only `IMPULSO_AUTH_API_URL` and a publishable `IMPULSO_AUTH_PUBLIC_KEY`, as described in the hosting guide.

The version 3 Finance API is deployed. For future updates, review and apply every pending chronological migration to the verified remote destination before deploying matching source. The following command deploys code only; it does not apply database migrations:

```powershell
npx supabase@2.120.0 functions deploy impulso-api --project-ref txoorpmblpvqveeudafv --workdir apps --profile $impulsoProfile
```

Its configured gateway JWT check is disabled because the TypeScript handler validates the authenticated user, Google OAuth claims and active session itself. The authorization page is already published through the existing public ChatGPT Site's Worker response wrapper; Supabase Edge Functions continue to own the API behavior.

The published page's HTTP routes and security headers have passed verification. Repeat those delivery checks after publication changes. Windows source packaging requires Git for Windows' `bin` directory on the helper process PATH and `TAR_OPTIONS=--force-local`; see the hosting guide for the exact process settings.

The earlier browser OAuth connection, authenticated hosted `/session` check, MCP handshake/discovery and plugin `get_session` call passed; accepted conversational onboarding subsequently completed. The Finance rollout below additionally verified the refreshed 20-tool metadata and authenticated Finance context. After future metadata deployments, refresh discovery and verify a fresh client receives the [onboarding guidance](../specs/conversational-onboarding/spec.md) and [Finance guidance](local-development.md#finance-contracts-and-transactions). Remote real-data mutations and destructive consent-revocation testing are separate verification stages; local disposable integration covers those boundaries. Managed-person lifecycle, sharing, Health, files and purge execution remain unsupported.

## Finance rollout verification

Verified on October 14, 2026 UTC (October 13 in Mexico City), after the user explicitly authorized remote migrations, backend publication and plugin refresh. The destination was the existing healthy Personal-account project `txoorpmblpvqveeudafv`, running PostgreSQL 17.11. No new project, Site, OAuth client or credential was created.

The pinned CLI dry run identified exactly six pending migration files: `20261014010925`, `20261014015028`, `20261014015155`, `20261014015535`, `20261014020347` and `20261014021054`. A duplicate-budget compatibility query returned zero conflicts. All six files applied successfully in order with Vault updates skipped and without seed/reset. The post-deployment dry run reports `upToDate: true` and no pending migrations.

Only `impulso-api` was deployed, advancing version 2 to **version 3**, status `ACTIVE`, with bundle SHA-256 `4ce4dfcef78ee2b764a7190468828d3e2c25147f298a04b74f608a2ea32c8de7`. The deployed source retrieval includes all 21 runtime TypeScript files. Gateway JWT verification remains disabled because the handler verifies live user/session/client/Google authorization. Existing runtime secrets and the published authorization Site were retained.

Remote structural and privilege checks confirmed:

- **40 application tables, all with RLS**, and zero custom application PostgreSQL routines or triggers.
- Zero application-table SELECT grants for `anon`, `authenticated` or `service_role`.
- The backend cannot rewrite posted transaction amounts, delete transactions, or select Health/Finance file records.
- The backend can update only the required occurrence `rule_version` metadata while `rule_id` stays unwritable.
- Existing workspace, person, receipt and audit row digests are identical before and after deployment. Counts remain one workspace, one person and one receipt; books, accounts and transactions remain zero. No salary, financial record or workbook import was created by this rollout.

Public health and protected-resource metadata return `200`; unsigned session and MCP requests return `401` with no-store caching and the correct OAuth challenge. The existing ChatGPT plugin was refreshed in place and now shows **20 tools: 15 write-capable and five read-only**. No new OAuth consent or scope was requested. A fresh connected agent received the full manifest and successfully called native `get_session` and `get_finance_context` using the actual user's active OAuth session. Onboarding remained complete; Finance context returned the verified self, stored `America/Mexico_City` zone, zero books/accounts and permission to create a book. These reads establish hosted Finance authorization without inventing a financial setup or recording an income.

The security adviser returned no ERROR findings, the expected 40 `rls_enabled_no_policy` INFO findings reflecting deliberate direct-client denial, and one WARN for disabled leaked-password protection. This rollout did not change Auth password settings. Review the [password security remediation](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) separately; connected MCP access continues to require verified Google identity and live OAuth consent.

Clients can retain tool metadata for an existing conversation. Refresh the connection and start a new conversation when a client still presents the old tool list. The refreshed native plugin and fresh-agent Finance read above passed; there is no claim that this deployment imported the workbook, saved the user's salary, or validated real financial mutations. The prior 112 unit tests, 533 local native assertions and 106 disposable integration steps remain dated local evidence, not production writes.

## Sources

The [CLI configuration loading contract](https://github.com/supabase/cli/blob/v2.120.0/packages/config/docs/cli-config-loading.md) documents sparse inputs and environment references. The [Google sign-in guide](https://supabase.com/docs/guides/auth/social-login/auth-google) describes the provider callback, and the [OAuth server setup guide](https://supabase.com/docs/guides/auth/oauth-server/getting-started) describes the consent flow. Command flags above were checked against CLI 2.120.0 help.
