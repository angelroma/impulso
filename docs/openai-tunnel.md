# OpenAI tunnel for local Impulso

The OpenAI Secure MCP Tunnel connects the hosted client to Impulso's local MCP endpoint. Supabase, PostgreSQL and both Edge Functions remain on this computer. The registered tunnel belongs to the Personal OpenAI organization and is linked to its ChatGPT workspace.

| Setting                 | Value                                                 |
| ----------------------- | ----------------------------------------------------- |
| Tunnel name             | `Impulso`                                             |
| Tunnel ID               | `tunnel_6aceaecac7048191a405e1a511091710`             |
| OpenAI API organization | `org-U0ODhnVvMA2wOOZOTYj9JgOz`                        |
| ChatGPT workspace       | `ad96cf6f-84f8-47f8-b123-67f05cb9aaa1`                |
| Local MCP endpoint      | `http://127.0.0.1:54321/functions/v1/impulso-api/mcp` |
| Local OAuth issuer      | `http://127.0.0.1:54321/auth/v1`                      |

## Start the local connection

Keep the existing Supabase stack and `supabase:serve-functions` running. In a separate PowerShell terminal at the repository root, run:

```powershell
npx nx run supabase:run-tunnel
```

The launcher runs the client's diagnostic first and starts the connection only if it passes, using the same key input for both steps. To run diagnostics alone, use `npx nx run supabase:doctor-tunnel`.

Both targets use the installed official `tunnel-client` v0.0.16 in `work/tools/tunnel-client/v0.0.16/` and the local profile in `work/tunnel/profiles/impulso.yaml`. These ignored files contain the binary and nonsecret configuration; the profile references `env:CONTROL_PLANE_API_KEY` rather than a literal key. If these files are missing on another machine, install the verified official release and initialize a profile following the [official tunnel setup guide](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels).

Use a restricted OpenAI runtime key with **Tunnels Read and Use** permissions in the Personal organization. The launcher uses a preexisting process `CONTROL_PLANE_API_KEY` or asks for the key with masked input. Enter it directly in that terminal. Do not place it in chat, shell commands, YAML, tracked files or logs. The launcher makes it available to the client through its process environment, clears the temporary value when the client stops, and restores any value that existed before launch. It disables raw HTTP logging and payload capture. The runtime key is separate from a user's Supabase OAuth tokens.

The run command stays active until you stop it with Ctrl+C. It does not start or stop Supabase. The client writes its loopback health URL to `work/tunnel/health.url`; use that address for readiness inspection. Do not assume a saved health URL means a stopped client is still available. No auto-start service is installed.

## Connect through the custom MCP form

Use these settings in the client's custom MCP server form:

| Field               | Setting                                       |
| ------------------- | --------------------------------------------- |
| Name                | `Impulso`                                     |
| Description         | `Connect to the local Impulso assistant with Google sign-in.` |
| Connection          | `Tunnel`                                      |
| Tunnel ID           | `tunnel_6aceaecac7048191a405e1a511091710`     |
| Authentication      | `OAuth`                                       |
| Client registration | Dynamic client registration                   |
| OAuth scopes        | `openid email profile offline_access`         |
| Optional OIDC/domain claiming | Disabled for this local setup         |

Leave optional OpenID Connect (OIDC) and domain claiming disabled. Supabase advertises a loopback `userinfo_endpoint`, and the pinned tunnel client's [OAuth target registration](https://github.com/openai/tunnel-client/blob/v0.0.16/pkg/oauth/hostbundle.go#L341-L358) includes selected server metadata and JWKS targets but omits user information. This optional feature would therefore have no configured tunnel target for that local endpoint. OAuth remains enabled, and Impulso still verifies the JWT, user, session and active client grant. Use the four explicit scopes above to avoid requesting the additional `phone` scope advertised by Supabase.

Let the client discover the OAuth endpoints through the tunnel. Do not enter a Supabase administrator key, service key, Google client secret or the tunnel runtime key in the MCP authentication fields. Review the requesting client and scopes before approving its Supabase connection. To verify the completed connection, call `get_session`; this does not create a workspace or records. Call `onboard` only after confirming the requested names and time zone in the conversation.

The currently implemented tools are `get_session` for identity and setup status, and `onboard` for confirmed account setup. Finance and health tools are not available yet.

## How local OAuth reaches the hosted client

The tunnel client discovers Impulso's protected resource metadata and Supabase OAuth metadata. It registers the private registration and token endpoints as narrow Harpoon targets. OpenAI's OAuth shim relays dynamic registration and token exchange through those targets to local Supabase Auth. The profile does not expose the entire Supabase gateway, database or Studio, and there is no general-purpose HTTP proxy target.

The browser authorization endpoint remains a direct `127.0.0.1` URL. Complete Google sign-in and Impulso consent in a browser on **this computer**, where the local Supabase stack is reachable. Signing in from a different device will not reach this computer's loopback address. The local launcher allows plaintext Harpoon HTTP because these development endpoints are on loopback; it rejects plaintext URLs with other hosts in the profile. A future hosted deployment requires HTTPS and separate deployment configuration.

See the pinned official [OAuth tunnel onboarding](https://github.com/openai/tunnel-client/blob/v0.0.16/docs/onboarding.md#oauth-protected-mcp-supported) and [OAuth connector behavior](https://github.com/openai/tunnel-client/blob/v0.0.16/docs/connectors.md#oauth-protected-connector-behavior).

## Verification status

The tunnel registration and local profile exist. The launcher and Nx targets have been prepared and inspected without starting the client. Runtime readiness, hosted connector registration, OAuth approval and an authenticated `get_session` call still require verification with the restricted runtime key. Existing local MCP and OAuth checks are documented in [edge-functions.md](edge-functions.md).
