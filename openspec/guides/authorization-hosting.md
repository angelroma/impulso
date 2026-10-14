# Hosted authorization page

The hosted page uses the same browser code as the local `impulso-auth` Edge Function. Authentication, consent, session verification and application business logic stay in TypeScript Supabase Edge Functions and Supabase Auth. A small Sites Worker ESM response wrapper embeds the public HTML, JavaScript, CSS and configuration and returns them with explicit security headers. It contains no account, session, database or application business logic.

The authorization page is published at `https://impulso-authorization.marmstud6.chatgpt.site` under the existing public ChatGPT Site `appgprj_6acebb194398819192eeb6ec946a8c7b`. Its durable public identity is recorded in [authorization-site.json](../reference/authorization-site.json). See [remote deployment](remote-deployment.md#verified-status-on-october-13-2026) for the publication version, source commit, deployment identity and dated browser/MCP/onboarding verification results. Those observations were recorded during implementation; this documentation migration performed no publication or remote health check.

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

For future connection checks, use the existing ChatGPT plugin documented in the remote guide. Complete Google sign-in and consent, then verify an authenticated `get_session` call. The browser authorization page does not collect onboarding fields or create account resources; the client follows the [conversational-onboarding specification](../specs/conversational-onboarding/spec.md) after connecting. Remote denial and revoked-session behavior require separate checks and remain unverified in the recorded deployment evidence.

`npm exec nx run supabase:test-auth` checks both local and hosted paths, PKCE redirects, refreshed static routes, explicit approval and denial, unsafe callbacks, account changes, expired requests and public deployment configuration. `npm exec nx run supabase:build-auth` continues to produce the original local Edge Function assets.
