# Hosted authorization page

The hosted page uses the same browser code as the local `impulso-auth` Edge Function. Authentication, consent, session verification and application business logic stay in TypeScript Supabase Edge Functions and Supabase Auth. A small Sites Worker ESM response wrapper embeds the public HTML, JavaScript, CSS and configuration and returns them with explicit security headers. It contains no account, session, database or application business logic.

The authorization page is published at `https://impulso-authorization.marmstud6.chatgpt.site` under the existing public ChatGPT Site `appgprj_6acebb194398819192eeb6ec946a8c7b`. Version 2 is published and eight live HTTP checks passed. Personal-account CLI access and the remote Auth configuration are verified, and `impulso-api` is active. Google sign-in, the authenticated backend `/session` check, consent approval, OAuth return and authenticated MCP handshake/discovery succeeded. ChatGPT shows the plugin connected; an individual ChatGPT MCP tool invocation and remote denial/revocation tests remain unverified. The durable public Site identity is recorded in [`docs/authorization-site.json`](../../docs/authorization-site.json).

The verified publication uses source commit `d9d2e02bcba6ebd19731c857e363ef05728408a5`, saved version `appgprj_6acebb194398819192eeb6ec946a8c7b~appgver_0230521648d88191ac176095cdc57ed2`, and deployment `appgdep_6acebd0a88d0819192e61d00015e98ab`.

Set the public deployment configuration and build from the workspace root:

```powershell
$env:IMPULSO_AUTH_API_URL = 'https://txoorpmblpvqveeudafv.supabase.co'
$env:IMPULSO_AUTH_PUBLIC_KEY = '<publishable-key>'
npm exec nx run supabase:build-auth-static
```

The build requires a publishable API key and rejects privileged credentials. `config.json` intentionally contains only public browser configuration.

Use the isolated Site checkout at `work/impulso-auth-site`. Its `worker/index.js` embeds the public browser assets from `dist/apps/impulso-auth`; refresh those embedded values when the canonical browser build changes. Every Site build input is inside the isolated checkout. Its tracked hosting manifest is:

```json
{
  "project_id": "appgprj_6acebb194398819192eeb6ec946a8c7b"
}
```

The Worker build omits the `static` manifest field and produces only `dist/server/index.js` plus `dist/.openai/hosting.json`. The runtime entry exports `default.fetch`. Package and publish through the existing Site's source workflow using these ordered validation commands:

```json
[
  ["node", "scripts/build.mjs"],
  ["node", "--test", "scripts/worker.test.mjs"],
  ["node", "scripts/validate-artifact.mjs"]
]
```

For the Windows publishing helper, add Git for Windows' `bin` directory to the process PATH and force GNU tar to treat Windows drive paths as local:

```powershell
$env:Path = 'C:\Program Files\Git\bin;' + $env:Path
$env:TAR_OPTIONS = '--force-local'
```

If the ignored checkout is lost, recover the same Site using the durable project ID and open its existing source repository. Do not call `create_site` again for this page.

The initial static publication did not apply `_headers` or `_redirects`. The Worker now attaches CSP, `Cache-Control: no-store`, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY` and `X-Content-Type-Options: nosniff` directly to every response. Exact `/oauth/consent` and `/auth/callback` routes return `200` for GET and HEAD without redirects; slash aliases also work. Eight live checks verified these routes, JavaScript and public configuration, unknown-path `404` responses, and `405` for POST, with all five headers present. Repeat these checks after publication changes.

The remote Supabase Auth site URL is configured as `https://impulso-authorization.marmstud6.chatgpt.site`, the OAuth server authorization path is `/oauth/consent`, and the exact allowed authentication redirect URL is `https://impulso-authorization.marmstud6.chatgpt.site/auth/callback`. Google and dynamic OAuth client registration are enabled. Google must continue to allow the Supabase callback `https://txoorpmblpvqveeudafv.supabase.co/auth/v1/callback`. The browser keeps the pending consent request and Google PKCE state in the current tab's session storage; consent is shown only after the API verifies the Google session. Complete sign-in in a top-level tab on the same Site origin.

The existing ChatGPT plugin is `plugin_asdk_app_6acec007862c81918453ab99b17d90a0`. Its native page now shows `Try in chat` and no longer shows `Continue connecting app`, confirming the completed browser connection. The backend `/session` check verified the active Google session against the hosted database, and post-consent server logs confirm authenticated MCP handshake/discovery with `200` and `202` responses. A ChatGPT `get_session` MCP invocation remains unverified because the private plugin's callable tools were unavailable to the verifying agents.

`npm exec nx run supabase:test-auth` checks both local and hosted paths, PKCE redirects, refreshed static routes, explicit approval and denial, unsafe callbacks, account changes, expired requests and public deployment configuration. `npm exec nx run supabase:build-auth` continues to produce the original local Edge Function assets.
