# Remote deployment

Impulso's remote project is `txoorpmblpvqveeudafv`. Its API origin is `https://txoorpmblpvqveeudafv.supabase.co` and its Auth issuer is `https://txoorpmblpvqveeudafv.supabase.co/auth/v1`.

The public authorization page is published at `https://impulso-authorization.marmstud6.chatgpt.site` using the existing ChatGPT Site `appgprj_6acebb194398819192eeb6ec946a8c7b`. Its durable identity is in [authorization-site.json](authorization-site.json); reuse this ID when recovering the ignored Site checkout.

## Verified status on October 13, 2026

The remote database has been created and checked: 23 application tables across six schemas, RLS on all 23 tables, four private Auth views, and no custom application PostgreSQL functions or triggers. Four reviewed migration versions have been reconciled with the deployed schema. The native CLI lists all four versions and its database push dry run reports that the remote database is up to date.

Function unit tests, type checks and lint pass. The latest local integration rerun passed all three suites covering 30 steps; the browser authorization/build suite passed 17 tests and the database suite passed 256 pgTAP assertions. The static authorization page builds from the existing browser code without an additional frontend framework.

The remote Auth JWKS endpoint responds successfully with an ES256 signing key, and its public OpenID configuration reports the expected remote issuer. This confirms the required asymmetric signing capability.

The public ChatGPT Site's version 2 is published. Eight live HTTP checks passed: exact consent and callback GET/HEAD responses return `200` without redirects, JavaScript and public configuration load, unknown paths return `404`, and POST returns `405`. All checked responses include CSP, no-store caching, no-referrer policy, frame denial and MIME protections. Three local Worker response tests also passed.

The verified Site source commit is `d9d2e02bcba6ebd19731c857e363ef05728408a5`, saved version is `appgprj_6acebb194398819192eeb6ec946a8c7b~appgver_0230521648d88191ac176095cdc57ed2`, and deployment is `appgdep_6acebd0a88d0819192e61d00015e98ab`.

Personal-account CLI identity and access to the Impulso project are verified. The remote configuration push enabled Google, the OAuth server and dynamic client registration, set the hosted site and exact callback, and restricted Data API exposure to `api`. Undeclared MFA and email settings were preserved.

The remote security adviser reports no WARN or ERROR findings. Its one INFO finding, `rls_enabled_no_policy`, reflects the intentional denial of direct client access to application tables.

The `impulso-api` Edge Function is deployed and active at version 1. Its health and MCP metadata endpoints returned `200`, unsigned session and MCP requests returned `401`, and the browser CORS preflight returned `204`.

Google sign-in, the backend `/session` check of the active Google session and hosted database, consent approval and the OAuth return completed successfully. ChatGPT plugin `plugin_asdk_app_6acec007862c81918453ab99b17d90a0` is connected: its native page shows `Try in chat` and no longer shows `Continue connecting app`.

Server logs on October 13 confirm `/session` returned `200` at 23:48:32 and 23:48:49 UTC. Post-consent MCP POSTs returned `200` at 23:48:56, 23:48:58 and 23:49:01 UTC, and `202` at 23:48:59 UTC. The handler requires an OAuth client, the `openid` scope and a Google identity before accepting MCP requests, so these responses verify authenticated MCP handshake/discovery.

No ChatGPT `get_session` MCP invocation has been verified. The private plugin's callable tools were absent from both the current and fresh agent tool metadata. Remote denial and revocation tests also remain pending.

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

The existing HTTPS authorization Site is published using the Worker ESM static-response wrapper described in [the hosting guide](../apps/supabase/auth-hosting.md). The isolated checkout is `work/impulso-auth-site`; its manifest preserves the Site ID and omits `static`. `worker/index.js` embeds the generated public browser assets, and its dependency-free build produces `dist/server/index.js` and the hosting manifest. All authentication, consent and application business logic stay in Supabase; the Sites wrapper serves public responses only. It introduces no SQL routines or database behavior. Do not create a replacement Site if the ignored checkout is missing. The configured origin has no path, query, fragment or trailing slash:

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

The API function is already deployed and active. Redeploy source changes from the existing configuration:

```powershell
npx supabase@2.120.0 functions deploy impulso-api --project-ref txoorpmblpvqveeudafv --workdir apps --profile $impulsoProfile
```

Its configured gateway JWT check is disabled because the TypeScript handler validates the authenticated user, Google OAuth claims and active session itself. The authorization page is already published through the existing public ChatGPT Site's Worker response wrapper; Supabase Edge Functions continue to own the API behavior.

The published page's HTTP routes and security headers have passed verification. Repeat those delivery checks after publication changes. Windows source packaging requires Git for Windows' `bin` directory on the helper process PATH and `TAR_OPTIONS=--force-local`; see the hosting guide for the exact process settings.

The browser OAuth connection, authenticated hosted `/session` check and authenticated MCP handshake/discovery have passed. When the private plugin's tools become available to the verifying client, invoke `get_session` through ChatGPT and record its result separately. Test denial on a separate request and confirm a revoked session is rejected; these remote checks remain pending.

## Sources

The [CLI configuration loading contract](https://github.com/supabase/cli/blob/v2.120.0/packages/config/docs/cli-config-loading.md) documents sparse inputs and environment references. The [Google sign-in guide](https://supabase.com/docs/guides/auth/social-login/auth-google) describes the provider callback, and the [OAuth server setup guide](https://supabase.com/docs/guides/auth/oauth-server/getting-started) describes the consent flow. Command flags above were checked against CLI 2.120.0 help.
