import { createClient } from "@supabase/supabase-js";
import { discoverOAuthServerInfo } from "@modelcontextprotocol/sdk/client/auth.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createDatabase } from "../_shared/database.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function object(value: unknown, message: string): Record<string, unknown> {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), message);
  return value as Record<string, unknown>;
}

function text(value: unknown, message: string): string {
  assert(typeof value === "string" && value.length > 0, message);
  return value;
}

function localEnvironment() {
  function required(name: string): string {
    return text(Deno.env.get(name), `The local OAuth test environment is missing ${name}.`);
  }
  const api = new URL(required("SUPABASE_URL"));
  const databaseUrl = required("SUPABASE_DB_URL");
  const database = new URL(databaseUrl);
  const loopback = ["localhost", "127.0.0.1"];
  assert(
    api.protocol === "http:" && loopback.includes(api.hostname) && api.port === "54321" &&
      api.username === "" && api.password === "" && api.pathname === "/" &&
      api.search === "" && api.hash === "" &&
      ["postgres:", "postgresql:"].includes(database.protocol) &&
      loopback.includes(database.hostname) && database.port === "54322" &&
      required("IMPULSO_AUTH_ISSUER") === `${api.origin}/auth/v1`,
    "OAuth fixtures may only be created in the local Impulso stack.",
  );
  return {
    apiUrl: api.origin,
    issuer: `${api.origin}/auth/v1`,
    resource: `${api.origin}/functions/v1/impulso-api/mcp`,
    metadata: `${api.origin}/functions/v1/impulso-api/.well-known/oauth-protected-resource`,
    authorizationBase: `${api.origin}/functions/v1/impulso-auth`,
    databaseUrl,
    anonymousKey: required("SUPABASE_ANON_KEY"),
    serviceKey: required("SUPABASE_SERVICE_ROLE_KEY"),
  };
}

function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_")
    .replaceAll("=", "");
}

function claims(token: string): Record<string, unknown> {
  const payload = token.split(".")[1].replaceAll("-", "+").replaceAll("_", "/");
  return object(
    JSON.parse(atob(payload.padEnd(Math.ceil(payload.length / 4) * 4, "="))),
    "Auth must return a JWT payload.",
  );
}

async function requestJson(url: string, init: RequestInit = {}) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(15_000) });
  const body = await response.json();
  return { response, body: object(body, "The protocol endpoint must return a JSON object.") };
}

Deno.test("Local MCP uses consented OAuth, PKCE and conversational onboarding", async (test) => {
  const environment = localEnvironment();
  const options = {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  };
  const admin = createClient(environment.apiUrl, environment.serviceKey, options);
  const database = createDatabase(environment.databaseUrl);
  const users: string[] = [];
  const oauthClients: string[] = [];
  const authClients: { auth: { stopAutoRefresh(): Promise<void> } }[] = [];
  let mcpClient: Client | undefined;
  const redirectUri = "http://127.0.0.1:39876/oauth/callback";
  let authorizationEndpoint = "";
  let tokenEndpoint = "";
  let registrationEndpoint = "";
  let rpcId = 0;
  let waitingImport: Record<string, unknown> | undefined;

  async function step(name: string, operation: () => Promise<void>) {
    assert(
      await test.step(name, operation),
      "The OAuth protocol step failed; dependent checks stopped.",
    );
  }

  async function rpc(method: string, params: Record<string, unknown>, token?: string) {
    return await requestJson(environment.resource, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        "MCP-Protocol-Version": "2025-06-18",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params }),
    });
  }

  async function fixture(googleLinked: boolean) {
    const client = createClient(environment.apiUrl, environment.anonymousKey, options);
    authClients.push(client);
    const email = `oauth-mcp-${crypto.randomUUID()}@impulso.test.invalid`;
    const password = `${crypto.randomUUID()}aA1!`;
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    assert(
      !created.error && created.data.user,
      "The disposable local OAuth account was not created.",
    );
    const userId = created.data.user.id;
    users.push(userId);
    if (googleLinked) {
      // This administrator-owned synthetic identity only tests our OAuth boundary. It does not
      // prove a real Google login and cannot be added through client-controlled metadata.
      const providerId = `impulso-oauth-test-${crypto.randomUUID()}`;
      await database`
        INSERT INTO auth.identities (id, user_id, provider_id, provider, identity_data,
          created_at, updated_at)
        VALUES (${crypto.randomUUID()}, ${userId}, ${providerId}, 'google',
          ${database.json({ sub: providerId, email, email_verified: true })}, now(), now())
      `;
    }
    const signedIn = await client.auth.signInWithPassword({ email, password });
    assert(
      !signedIn.error && signedIn.data.session,
      "The disposable local account did not sign in.",
    );
    return { client, userId, token: signedIn.data.session.access_token };
  }

  async function register() {
    const result = await requestJson(registrationEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: environment.anonymousKey },
      body: JSON.stringify({
        client_name: `Impulso integration ${crypto.randomUUID()}`,
        redirect_uris: [redirectUri],
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        token_endpoint_auth_method: "none",
        client_type: "public",
      }),
    });
    assert(result.response.status === 201, "Local dynamic client registration must succeed.");
    const clientId = text(result.body.client_id, "Dynamic registration must return a client ID.");
    oauthClients.push(clientId);
    assert(
      result.body.token_endpoint_auth_method === "none",
      "A public client cannot require a secret.",
    );
    return clientId;
  }

  async function authorization(clientId: string) {
    const verifier = base64url(crypto.getRandomValues(new Uint8Array(48)));
    const challenge = base64url(
      new Uint8Array(
        await crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(verifier),
        ),
      ),
    );
    const state = crypto.randomUUID();
    const url = new URL(authorizationEndpoint);
    url.search = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "openid email profile",
      state,
      code_challenge: challenge,
      code_challenge_method: "S256",
      resource: environment.resource,
    }).toString();
    const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(15_000) });
    await response.arrayBuffer();
    assert([302, 303].includes(response.status), "Auth must redirect to the local consent page.");
    const destination = new URL(
      text(response.headers.get("location"), "Consent requires a redirect."),
    );
    assert(
      destination.origin === environment.apiUrl &&
        destination.pathname === "/functions/v1/impulso-auth/oauth/consent" &&
        destination.username === "" && destination.password === "" && destination.hash === "",
      "Auth must redirect to the exact local authorization Edge Function route.",
    );
    const authorizationId = text(
      destination.searchParams.get("authorization_id"),
      "The local consent page must receive an authorization ID.",
    );
    return { clientId, verifier, state, authorizationId };
  }

  async function approve(user: Awaited<ReturnType<typeof fixture>>, clientId: string) {
    const flow = await authorization(clientId);
    const details = await user.client.auth.oauth.getAuthorizationDetails(flow.authorizationId);
    assert(!details.error && details.data, "The signed-in user must be able to inspect consent.");
    let redirect: string;
    if ("redirect_url" in details.data) {
      redirect = details.data.redirect_url;
    } else {
      assert(
        details.data.client.id === clientId && details.data.user.id === user.userId,
        "Consent details must identify the registered client and current user.",
      );
      const consent = await user.client.auth.oauth.approveAuthorization(flow.authorizationId, {
        skipBrowserRedirect: true,
      });
      assert(
        !consent.error && consent.data,
        "The disposable user must be able to approve consent.",
      );
      redirect = consent.data.redirect_url;
    }
    const destination = new URL(redirect);
    assert(
      `${destination.origin}${destination.pathname}` === redirectUri &&
        destination.searchParams.get("state") === flow.state,
      "The authorization response must preserve the registered callback and state.",
    );
    return {
      ...flow,
      code: text(destination.searchParams.get("code"), "Approval must issue a code."),
    };
  }

  async function exchange(
    flow: Awaited<ReturnType<typeof approve>>,
    overrides: Record<string, string> = {},
    encoding: "form" | "json" = "form",
  ) {
    const parameters = {
      grant_type: "authorization_code",
      client_id: flow.clientId,
      code: flow.code,
      redirect_uri: redirectUri,
      code_verifier: flow.verifier,
      resource: environment.resource,
      ...overrides,
    };
    return await requestJson(tokenEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": encoding === "json"
          ? "application/json"
          : "application/x-www-form-urlencoded",
        apikey: environment.anonymousKey,
      },
      body: encoding === "json" ? JSON.stringify(parameters) : new URLSearchParams(parameters),
    });
  }

  try {
    await step(
      "The authorization Edge Function publicly serves only its approved assets",
      async () => {
        const assets = [
          { path: "/", mime: "text/html" },
          { path: "/oauth/consent", mime: "text/html" },
          { path: "/auth/callback", mime: "text/html" },
          { path: "/auth.js", mime: "application/javascript" },
          { path: "/styles.css", mime: "text/css" },
          { path: "/config.json", mime: "application/json" },
        ];
        for (const asset of assets) {
          const response = await fetch(`${environment.authorizationBase}${asset.path}`, {
            signal: AbortSignal.timeout(15_000),
          });
          const body = await response.text();
          assert(
            response.status === 200 && body.length > 0,
            `The public authorization asset ${asset.path} must load without a bearer token.`,
          );
          assert(
            response.headers.get("content-type")?.startsWith(asset.mime),
            `The authorization asset ${asset.path} must retain its browser MIME type.`,
          );
          assert(
            response.headers.get("cache-control")?.includes("no-store") &&
              response.headers.get("x-content-type-options") === "nosniff" &&
              response.headers.get("referrer-policy") === "no-referrer" &&
              response.headers.get("x-frame-options") === "DENY",
            `The authorization asset ${asset.path} must prevent caching, sniffing and framing.`,
          );
          const policy = text(
            response.headers.get("content-security-policy"),
            "Every authorization response needs a content security policy.",
          );
          assert(
            policy.includes("frame-ancestors 'none'") && policy.includes("base-uri 'none'") &&
              !policy.includes("'unsafe-inline'") && !policy.includes("'unsafe-eval'"),
            "The authorization content security policy must block framing and unsafe script execution.",
          );
          assert(
            !body.includes(environment.serviceKey) &&
              !/\bsb_secret_[A-Za-z0-9_-]{20,}\b/.test(body),
            `The public authorization asset ${asset.path} must not expose privileged credentials.`,
          );
          if (asset.path === "/config.json") {
            const configuration = object(
              JSON.parse(body),
              "The browser configuration must be a JSON object.",
            );
            assert(
              Object.keys(configuration).sort().join(",") === "api_url,public_key" &&
                configuration.api_url === environment.apiUrl,
              "Browser configuration must expose only the canonical public API URL and public key.",
            );
            const publicKey = text(
              configuration.public_key,
              "The browser needs a public Supabase key.",
            );
            assert(
              publicKey !== environment.serviceKey &&
                (publicKey.startsWith("sb_publishable_") || claims(publicKey).role === "anon"),
              "Browser configuration may expose only an anonymous or publishable key.",
            );
          }
        }
        const head = await fetch(`${environment.authorizationBase}/oauth/consent`, {
          method: "HEAD",
          signal: AbortSignal.timeout(15_000),
        });
        assert(
          head.status === 200 && head.headers.get("content-type")?.startsWith("text/html") &&
            (await head.text()) === "",
          "HEAD must preserve the consent page headers without returning its content.",
        );
        const deniedMethod = await fetch(`${environment.authorizationBase}/config.json`, {
          method: "POST",
          signal: AbortSignal.timeout(15_000),
        });
        await deniedMethod.arrayBuffer();
        assert(
          deniedMethod.status === 405,
          "The static authorization routes must reject unsupported request methods.",
        );
        for (
          const path of [
            "/unknown",
            "/.env",
            "/.env.local",
            "/client.js",
            "/index.ts",
            "/auth.js.map",
          ]
        ) {
          const denied = await fetch(`${environment.authorizationBase}${path}`, {
            signal: AbortSignal.timeout(15_000),
          });
          const body = await denied.text();
          assert(
            denied.status === 404 && !body.includes(environment.serviceKey),
            `The authorization Edge Function must not publish ${path}.`,
          );
        }
        const forwarded = await requestJson(`${environment.authorizationBase}/config.json`, {
          headers: { "X-Forwarded-Host": "attacker.test.invalid", "X-Forwarded-Proto": "https" },
        });
        assert(
          forwarded.response.status === 200 && forwarded.body.api_url === environment.apiUrl,
          "Untrusted forwarding headers must not change the browser's canonical API configuration.",
        );
      },
    );

    await step("Protected-resource and authorization-server discovery stay local", async () => {
      const metadata = await requestJson(environment.metadata);
      assert(
        metadata.response.status === 200 && metadata.body.resource === environment.resource,
        "Protected-resource discovery must identify the exact MCP endpoint.",
      );
      assert(
        Array.isArray(metadata.body.authorization_servers) &&
          metadata.body.authorization_servers.includes(environment.issuer),
        "Protected-resource discovery must advertise local Supabase Auth.",
      );
      const challenge = await rpc("tools/list", {});
      const challengeUrl = challenge.response.headers.get("www-authenticate")
        ?.match(/resource_metadata="([^"]+)"/)?.[1];
      assert(
        challengeUrl === environment.metadata,
        "The unauthenticated MCP challenge must link to its metadata document.",
      );
      const discovery = await discoverOAuthServerInfo(environment.resource, {
        resourceMetadataUrl: new URL(challengeUrl),
        fetchFn: (input: string | URL | Request, init?: RequestInit) => {
          const url = new URL(input instanceof Request ? input.url : String(input));
          assert(url.origin === environment.apiUrl, "SDK discovery must not leave local Supabase.");
          return fetch(input, { ...init, signal: AbortSignal.timeout(15_000) });
        },
      });
      const server = discovery.authorizationServerMetadata;
      assert(
        server?.issuer === environment.issuer,
        "The official SDK must discover the issuer through its standard OAuth/OIDC fallback.",
      );
      authorizationEndpoint = text(
        server.authorization_endpoint,
        "Discovery needs authorization endpoint.",
      );
      tokenEndpoint = text(server.token_endpoint, "Discovery needs token endpoint.");
      registrationEndpoint = text(
        server.registration_endpoint,
        "Discovery needs dynamic registration.",
      );
      for (const endpoint of [authorizationEndpoint, tokenEndpoint, registrationEndpoint]) {
        assert(
          new URL(endpoint).origin === environment.apiUrl,
          "OAuth endpoints must remain local.",
        );
      }
      assert(
        Array.isArray(server.code_challenge_methods_supported) &&
          server.code_challenge_methods_supported.includes("S256"),
        "Discovery must advertise PKCE S256.",
      );
    });

    const user = await fixture(true);
    const clientId = await register();
    const otherClientId = await register();
    await step("MCP challenges missing credentials and rejects direct Auth sessions", async () => {
      for (const token of [undefined, user.token]) {
        const denied = await rpc("tools/list", {}, token);
        assert(denied.response.status === 401, "MCP requires a delegated OAuth access token.");
        assert(
          denied.response.headers.get("www-authenticate")?.includes("resource_metadata="),
          "An MCP authentication challenge must expose protected-resource discovery.",
        );
      }
    });

    await step("Consent can be denied without issuing a code", async () => {
      const flow = await authorization(otherClientId);
      const details = await user.client.auth.oauth.getAuthorizationDetails(flow.authorizationId);
      assert(
        !details.error && details.data && "authorization_id" in details.data,
        "A new client must first present its authorization details to the signed-in user.",
      );
      const denied = await user.client.auth.oauth.denyAuthorization(flow.authorizationId, {
        skipBrowserRedirect: true,
      });
      assert(!denied.error && denied.data, "The user must be able to deny a client.");
      const redirect = new URL(denied.data.redirect_url);
      assert(
        redirect.searchParams.get("error") === "access_denied" &&
          redirect.searchParams.get("state") === flow.state && !redirect.searchParams.has("code"),
        "Denied consent must preserve state and return no authorization code.",
      );
    });

    let oauthToken = "";
    let refreshToken = "";
    await step("PKCE and client checks bind the single-use authorization code", async () => {
      const flow = await approve(user, clientId);
      const mismatches: Record<string, string>[] = [
        { code_verifier: base64url(crypto.getRandomValues(new Uint8Array(48))) },
        { client_id: otherClientId },
      ];
      for (const override of mismatches) {
        const rejected = await exchange(flow, override);
        const protocolError = typeof rejected.body.error === "string" &&
            /^[a-z_]{1,64}$/.test(rejected.body.error)
          ? rejected.body.error
          : "unrecognized_error";
        assert(
          rejected.response.status === 400 && rejected.body.error === "invalid_grant",
          `An authorization code must reject ${
            Object.keys(override)[0]
          } (${rejected.response.status}, ${protocolError}).`,
        );
      }
      const wrongJsonResource = await exchange(flow, {
        resource: `${environment.apiUrl}/functions/v1/unrelated/mcp`,
      }, "json");
      assert(
        wrongJsonResource.response.status === 400 &&
          wrongJsonResource.body.error === "invalid_grant",
        "Auth's JSON token endpoint must reject a resource different from the authorization request.",
      );
      const exchanged = await exchange(flow);
      assert(exchanged.response.status === 200, "A matching PKCE code exchange must succeed.");
      oauthToken = text(exchanged.body.access_token, "Code exchange must issue an access token.");
      refreshToken = text(
        exchanged.body.refresh_token,
        "Code exchange must issue a refresh token.",
      );
      const payload = claims(oauthToken);
      assert(
        payload.client_id === clientId && payload.sub === user.userId,
        "The signed access token must name the consenting user and OAuth client.",
      );
      // Auth v2.197.0 ignores form-encoded resource and does not mint resource-specific aud.
      // Impulso therefore uses this local issuer for one MCP resource only.
      assert(
        payload.aud === "authenticated",
        "Review resource isolation if Auth changes its token audience.",
      );
      const reused = await exchange(flow);
      assert(
        reused.response.status === 400 && reused.body.error === "invalid_grant",
        "An authorization code must not be usable twice.",
      );
    });

    await step("The OAuth client initializes MCP and discovers conversation tools", async () => {
      mcpClient = new Client({ name: "Impulso integration", version: "1.0.0" });
      await mcpClient.connect(
        new StreamableHTTPClientTransport(new URL(environment.resource), {
          requestInit: { headers: { Authorization: `Bearer ${oauthToken}` } },
        }),
      );
      const listed = await mcpClient.listTools();
      const names = listed.tools.map((tool: unknown) =>
        object(tool, "Each tool needs a definition.").name
      );
      assert(
        names.includes("get_session") && names.includes("onboard"),
        "MCP must expose identity and onboarding through the conversation.",
      );
      const session = await mcpClient.callTool({ name: "get_session", arguments: {} });
      assert(!session.isError, "The consented OAuth identity must be accepted.");
      const sessionData = object(
        session.structuredContent,
        "The identity tool needs structured data.",
      );
      assert(
        object(sessionData.user, "The tool must identify its user.").id === user.userId &&
          object(sessionData.onboarding, "The tool must expose onboarding state.").status ===
            "required",
        "A fresh client must see only its own identity and a required onboarding state.",
      );
    });

    await step(
      "Signed client and scope claims must match the active session and client",
      async () => {
        const sessionId = text(
          claims(oauthToken).session_id,
          "OAuth must issue a session identifier.",
        );
        const [session] = await database<{ oauth_client_id: string; scopes: string }[]>`
        SELECT oauth_client_id, scopes FROM auth.sessions
        WHERE id = ${sessionId} AND user_id = ${user.userId}
      `;
        assert(
          session?.oauth_client_id === clientId,
          "Auth must bind the session to its OAuth client.",
        );
        try {
          await database`UPDATE auth.sessions SET oauth_client_id = ${otherClientId} WHERE id = ${sessionId}`;
          const wrongClient = await rpc("tools/list", {}, oauthToken);
          assert(
            wrongClient.response.status === 401,
            "A session/client mismatch must reject the token.",
          );
        } finally {
          await database`UPDATE auth.sessions SET oauth_client_id = ${session.oauth_client_id} WHERE id = ${sessionId}`;
        }
        try {
          await database`UPDATE auth.sessions SET scopes = 'openid' WHERE id = ${sessionId}`;
          const wrongScope = await rpc("tools/list", {}, oauthToken);
          assert(
            wrongScope.response.status === 401,
            "Changed session scopes must invalidate older tokens.",
          );
        } finally {
          await database`UPDATE auth.sessions SET scopes = ${session.scopes} WHERE id = ${sessionId}`;
        }
        try {
          await database`UPDATE auth.oauth_clients SET deleted_at = now() WHERE id = ${clientId}`;
          const deletedClient = await rpc("tools/list", {}, oauthToken);
          assert(
            deletedClient.response.status === 401,
            "A removed OAuth client must lose access immediately.",
          );
        } finally {
          await database`UPDATE auth.oauth_clients SET deleted_at = NULL WHERE id = ${clientId}`;
        }
      },
    );

    const onboarding = {
      request_id: crypto.randomUUID(),
      display_name: "MCP integration user",
      workspace_name: "Personal workspace",
      timezone: "UTC",
    };
    await step("Conversational onboarding creates one scope and safely replays", async () => {
      const first = await rpc("tools/call", { name: "onboard", arguments: onboarding }, oauthToken);
      const repeated = await rpc(
        "tools/call",
        { name: "onboard", arguments: onboarding },
        oauthToken,
      );
      const firstResult = object(first.body.result, "Onboarding must return a tool result.");
      const repeatedResult = object(repeated.body.result, "A replay must return a tool result.");
      assert(
        !firstResult.isError && !repeatedResult.isError,
        "A matching conversation retry must succeed without duplicate data.",
      );
      const initialData = object(
        firstResult.structuredContent,
        "Onboarding needs structured data.",
      );
      const replayData = object(
        repeatedResult.structuredContent,
        "An onboarding replay needs structured data.",
      );
      assert(
        initialData.status === "created" && replayData.status === "already_processed" &&
          initialData.workspace_id === replayData.workspace_id &&
          initialData.person_id === replayData.person_id,
        "A conversational retry must return the same existing workspace and person.",
      );
      const [counts] = await database`
        SELECT
          (SELECT count(*)::int FROM core.workspaces WHERE created_by_user_id = ${user.userId}) AS workspaces,
          (SELECT count(*)::int FROM core.people WHERE created_by_user_id = ${user.userId}) AS people,
          (SELECT count(*)::int FROM private.operation_receipts WHERE actor_user_id = ${user.userId}) AS receipts,
          (SELECT count(*)::int FROM audit.events WHERE actor_user_id = ${user.userId}) AS events
      `;
      assert(
        counts.workspaces === 1 && counts.people === 1 && counts.receipts === 1 &&
          counts.events === 1,
        "MCP onboarding and its retry must create one personal scope, receipt and event.",
      );
      const invalid = await rpc("tools/call", {
        name: "onboard",
        arguments: { ...onboarding, user_id: crypto.randomUUID() },
      }, oauthToken);
      assert(
        Boolean(invalid.body.error) ||
          object(invalid.body.result, "Invalid calls need a result.").isError,
        "A caller cannot select another account by adding a user_id argument.",
      );
      assert(mcpClient, "The official MCP client must be initialized.");
      const session = await mcpClient.callTool({ name: "get_session", arguments: {} });
      const sessionData = object(
        session.structuredContent,
        "The identity tool needs structured data.",
      );
      const scope = object(sessionData.onboarding, "The identity tool needs onboarding state.");
      assert(
        scope.status === "complete" && scope.workspace_id === initialData.workspace_id &&
          scope.person_id === initialData.person_id,
        "After onboarding the same client must discover its existing personal scope.",
      );
    });

    await step(
      "Delegated MCP records an expense through the real runtime and safely retries",
      async () => {
        async function call(name: string, argumentsValue: Record<string, unknown>) {
          const reply = await rpc("tools/call", { name, arguments: argumentsValue }, oauthToken);
          assert(
            reply.response.status === 200,
            "The delegated Finance tool must respond successfully.",
          );
          const result = object(reply.body.result, "Finance must return a tool result.");
          assert(!result.isError, "A valid delegated Finance action must succeed.");
          return object(result.structuredContent, "Finance needs structured output.");
        }
        const listed = await rpc("tools/list", {}, oauthToken);
        const tools = object(listed.body.result, "Tool discovery needs a result.").tools;
        assert(
          Array.isArray(tools) && tools.length === 20,
          "The runtime must advertise twenty tools.",
        );
        const session = await call("get_session", {});
        const scope = object(session.onboarding, "Setup must be complete.");
        const workspace_id = text(scope.workspace_id, "Setup needs a workspace identifier.");
        const person_id = text(scope.person_id, "Setup needs a self identifier.");
        const context = await call("get_finance_context", { workspace_id });
        assert(
          Array.isArray(context.books) && context.books.length === 0,
          "Context must not create a book.",
        );
        const book = await call("create_book", {
          request_id: crypto.randomUUID(),
          workspace_id,
          name: "Everyday",
          currency: "MXN",
        });
        const book_id = text(book.book_id, "The created book needs its identifier.");
        const account = await call("create_account", {
          request_id: crypto.randomUUID(),
          workspace_id,
          book_id,
          name: "Main account",
          currency: "MXN",
          opening_balance: "0",
          person_id,
        });
        const source_account_id = text(
          account.account_id,
          "The created account needs its identifier.",
        );
        const expense = {
          request_id: crypto.randomUUID(),
          workspace_id,
          book_id,
          source_account_id,
          amount: "100.00",
          currency: "MXN",
          occurred_on: "2026-10-13",
          description: "Hamburguesa",
          beneficiary_person_id: person_id,
        };
        const first = await call("record_expense", expense);
        const repeated = await call("record_expense", expense);
        assert(
          first.status === "created" && repeated.status === "already_processed" &&
            first.transaction_id === repeated.transaction_id && first.amount === "100.00" &&
            first.description === "Hamburguesa" && first.occurred_on === expense.occurred_on,
          "The real MCP runtime must preserve exact expense details and its retry identity.",
        );
        const [count] = await database`
        SELECT (SELECT count(*)::int FROM finance.transactions WHERE request_id = ${expense.request_id}) AS transactions,
          (SELECT count(*)::int FROM audit.events WHERE request_id = ${expense.request_id}) AS events,
          (SELECT count(*)::int FROM private.operation_receipts WHERE request_id = ${expense.request_id}) AS receipts
      `;
        assert(
          count.transactions === 1 && count.events === 1 && count.receipts === 1,
          "A delegated MCP retry must not duplicate its expense, audit, or receipt.",
        );
        const accounts = await call("get_finance_context", { workspace_id, book_id });
        assert(
          Array.isArray(accounts.accounts) && accounts.accounts.length === 1 &&
            !("transactions" in accounts) && !("balance" in accounts),
          "Authorized context must return the configured account without exposing a ledger.",
        );
        await call("configure_account", {
          request_id: crypto.randomUUID(),
          workspace_id,
          book_id,
          account_id: source_account_id,
          expected_version: 1,
          account_kind: "bank",
          opening_balance_on: "2026-01-01",
        });
        const cash = await call("create_account", {
          request_id: crypto.randomUUID(),
          workspace_id,
          book_id,
          name: "Cash",
          currency: "MXN",
          opening_balance: "0",
          person_id,
        });
        const cashId = text(cash.account_id, "Cash needs an identifier.");
        await call("configure_account", {
          request_id: crypto.randomUUID(),
          workspace_id,
          book_id,
          account_id: cashId,
          expected_version: 1,
          account_kind: "cash",
          opening_balance_on: "2026-01-01",
        });
        const base = {
          currency: "MXN",
          occurred_on: "2026-10-13",
          beneficiary_person_id: person_id,
          category_id: null,
        };
        const income = {
          request_id: crypto.randomUUID(),
          workspace_id,
          book_id,
          action: "single",
          entry: {
            ...base,
            kind: "income",
            destination_account_id: source_account_id,
            amount: "500.00",
            description: "Synthetic salary",
          },
        };
        const received = await call("record_transaction", income);
        const recovered = await call("record_transaction", income);
        assert(
          received.status === "created" && recovered.status === "already_processed",
          "Income must recover through OAuth without duplication.",
        );
        await call("record_transaction", {
          request_id: crypto.randomUUID(),
          workspace_id,
          book_id,
          action: "single",
          entry: {
            ...base,
            kind: "transfer",
            source_account_id,
            destination_account_id: cashId,
            amount: "20.00",
            description: "Synthetic cash transfer",
          },
        });
        const report = await call("get_finance_report", {
          workspace_id,
          book_id,
          report: "cash_flow",
          starts_on: "2026-10-01",
          ends_on: "2026-10-31",
          as_of: "2026-10-13",
        });
        assert(
          report.income === "500.00" && report.expense === "100.00" &&
            report.transferred === "20.00" && report.income_less_expense === "400.00",
          "The HTTP report must count salary and hamburger once and keep transfers neutral.",
        );
        const preview = await call("preview_finance_import", {
          request_id: crypto.randomUUID(),
          workspace_id,
          book_id,
          manifest: {
            workbook_id: "synthetic-oauth-workbook",
            source_version: "fixture-v1",
            captured_at: "2026-10-13T12:00:00Z",
            sheets: [{
              sheet_id: 1,
              title: "Synthetic 2026",
              visibility: "visible",
              source_kind: "active",
              selection: "authoritative",
              acknowledged_overlap: false,
              ranges: ["D2"],
            }],
            rows: [{
              sheet_id: 1,
              source_cell: "D2",
              period_start: "2026-09-01",
              date_precision: "month",
              observed_on: null,
              original_text: "Hamburguesas",
              displayed_value: "75.00",
              raw_value: "75.00",
              formula: null,
              selected: true,
              parser: "plain",
              currency: "MXN",
              expected_targets: [],
              replacement: null,
              mapping: {
                role: "actual_summary",
                accepted: true,
                kind: "expense",
                category_id: null,
                coverage_scope: "complete",
                coverage: {
                  authority: "summary",
                  expected_version: 0,
                  reviewed_detail_count: 0,
                  reviewed_detail_digest:
                    "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
                  accepted: true,
                },
              },
            }],
            reconciliation: {
              annual_net: null,
              monthly_net: null,
              missing_annual_cells: [],
              resolution: "unresolved",
              excluded_cells: [],
              accepted: true,
            },
          },
        });
        assert(
          preview.status === "ready" && Array.isArray(preview.blockers) &&
            preview.blockers.length === 0,
          "A fully reviewed synthetic monthly row must be ready without posting a transaction.",
        );
        const commitInput = {
          request_id: crypto.randomUUID(),
          workspace_id,
          book_id,
          batch_id: preview.batch_id,
          expected_version: preview.version,
          review_digest: preview.review_digest,
          accepted: true,
        };
        const committed = await call("commit_finance_import", commitInput);
        const again = await call("commit_finance_import", commitInput);
        assert(
          committed.status === "committed" && again.action_status === "already_processed",
          "The accepted HTTP import must commit once and recover its exact result.",
        );
        const [facts] =
          await database`SELECT (SELECT count(*)::int FROM finance.transactions WHERE book_id=${book_id}) AS entries,
          (SELECT count(*)::int FROM finance.monthly_summaries WHERE book_id=${book_id}) AS summaries`;
        assert(
          facts.entries === 3 && facts.summaries === 1,
          "Month-only history must remain a summary without an invented daily movement.",
        );
        const [saved] =
          await database`SELECT manifest FROM finance.import_batches WHERE id=${preview
            .batch_id as string}`;
        const manifest = object(saved.manifest, "The synthetic batch needs its frozen manifest.");
        const rows = manifest.rows as Record<string, unknown>[];
        const pending = await call("preview_finance_import", {
          request_id: crypto.randomUUID(),
          workspace_id,
          book_id,
          manifest: {
            ...manifest,
            sheets: [{
              sheet_id: 1,
              title: "Synthetic 2026",
              visibility: "visible",
              source_kind: "active",
              selection: "authoritative",
              acknowledged_overlap: false,
              ranges: ["D3"],
            }],
            rows: [{ ...rows[0], source_cell: "D3", period_start: "2026-08-01" }],
          },
        });
        assert(
          pending.status === "ready",
          "The consent-wait fixture must start with an uncommitted ready batch.",
        );
        waitingImport = {
          request_id: crypto.randomUUID(),
          workspace_id,
          book_id,
          batch_id: pending.batch_id,
          expected_version: pending.version,
          review_digest: pending.review_digest,
          accepted: true,
        };
      },
    );

    await step(
      "OAuth consent does not let a password-only account bypass Google identity",
      async () => {
        const passwordUser = await fixture(false);
        const flow = await approve(passwordUser, clientId);
        const exchanged = await exchange(flow);
        assert(
          exchanged.response.status === 200,
          "The password fixture must obtain a real OAuth token.",
        );
        const denied = await rpc(
          "tools/list",
          {},
          text(exchanged.body.access_token, "Auth must issue a token."),
        );
        assert(
          denied.response.status === 403,
          "OAuth alone cannot replace the verified Google account requirement.",
        );
      },
    );

    await step("Only the original OAuth client can refresh its delegated session", async () => {
      async function refresh(client: string) {
        return await requestJson(tokenEndpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            apikey: environment.anonymousKey,
          },
          body: new URLSearchParams({
            grant_type: "refresh_token",
            client_id: client,
            refresh_token: refreshToken,
            resource: environment.resource,
          }),
        });
      }
      const denied = await refresh(otherClientId);
      assert(
        denied.response.status >= 400 && denied.response.status < 500,
        "A different OAuth client cannot redeem another client's refresh token.",
      );
      const refreshed = await refresh(clientId);
      assert(
        refreshed.response.status === 200,
        "The original client must be able to refresh its session.",
      );
      oauthToken = text(refreshed.body.access_token, "Refresh must return an access token.");
      refreshToken = text(refreshed.body.refresh_token, "Refresh must return a refresh token.");
      assert(
        claims(oauthToken).client_id === clientId && claims(oauthToken).sub === user.userId,
        "Refreshed claims must preserve the authorized client and user.",
      );
      const accepted = await rpc("tools/list", {}, oauthToken);
      assert(
        accepted.response.status === 200 && !accepted.body.error,
        "The refreshed delegated token must continue to authorize MCP.",
      );
    });

    await step(
      "Revoking OAuth consent while an import waits rolls back its facts and receipt",
      async () => {
        assert(waitingImport, "A reviewed synthetic batch must be ready for the wait fixture.");
        const blocker = createDatabase(environment.databaseUrl);
        let release!: () => void;
        let acquired!: () => void;
        const locked = new Promise<void>((resolve) => {
          acquired = resolve;
        });
        const unlock = new Promise<void>((resolve) => {
          release = resolve;
        });
        const holding = blocker.begin(async (sql) => {
          await sql`SELECT id FROM core.workspaces WHERE id=${waitingImport!
            .workspace_id as string} FOR UPDATE`;
          acquired();
          await unlock;
        });
        await locked;
        const pending = rpc("tools/call", {
          name: "commit_finance_import",
          arguments: waitingImport,
        }, oauthToken);
        const outcomes = Promise.allSettled([holding, pending]);
        let failure: unknown;
        try {
          let blocked = false;
          const deadline = Date.now() + 2000;
          while (Date.now() < deadline) {
            const [activity] = await database`SELECT count(*)::int AS count FROM pg_stat_activity
            WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%FROM core.workspaces%'`;
            if (activity.count > 0) {
              blocked = true;
              break;
            }
            await new Promise((resolve) => setTimeout(resolve, 20));
          }
          assert(
            blocked,
            "The delegated import must actually wait on its workspace before consent revocation.",
          );
          await database`UPDATE auth.oauth_consents SET revoked_at=now() WHERE user_id=${user.userId} AND client_id=${clientId}`;
        } catch (error) {
          failure = error;
        } finally {
          release();
        }
        const results = await outcomes;
        await blocker.end({ timeout: 5 });
        if (failure) throw failure;
        assert(
          results[1].status === "fulfilled",
          "The waiting HTTP request must return a controlled denial.",
        );
        const reply = results[1].value as Awaited<ReturnType<typeof rpc>>;
        const error = reply.body.result
          ? JSON.parse((reply.body.result as { content: { text: string }[] }).content[0].text).error
          : reply.body.error;
        assert(
          error?.code === "invalid_session",
          "Live consent must be checked after the resource lock wait.",
        );
        const [unchanged] = await database`SELECT
        (SELECT count(*)::int FROM private.operation_receipts WHERE request_id=${waitingImport
          .request_id as string}) AS receipts,
        (SELECT count(*)::int FROM audit.events WHERE request_id=${waitingImport
          .request_id as string}) AS events,
        (SELECT count(*)::int FROM finance.monthly_summaries WHERE book_id=${waitingImport
          .book_id as string} AND period_start='2026-08-01') AS facts`;
        assert(
          unchanged.receipts === 0 && unchanged.events === 0 && unchanged.facts === 0,
          "Revocation while waiting must leave no imported fact, success receipt or audit.",
        );
      },
    );

    await step("Revoking client consent immediately rejects tokens and refresh", async () => {
      // Restore only this disposable consent so the separate native Auth revocation is exercised too.
      await database`UPDATE auth.oauth_consents SET revoked_at=NULL WHERE user_id=${user.userId} AND client_id=${clientId}`;
      const restored = await rpc("tools/list", {}, oauthToken);
      assert(
        restored.response.status === 200,
        "The isolated native revocation fixture must start with active consent.",
      );
      const revoked = await user.client.auth.oauth.revokeGrant({ clientId });
      assert(!revoked.error, "The user must be able to revoke a client grant.");
      const denied = await rpc("tools/list", {}, oauthToken);
      assert(
        denied.response.status === 401,
        "A revoked OAuth grant must immediately lose MCP access.",
      );
      const refresh = await requestJson(tokenEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          apikey: environment.anonymousKey,
        },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          client_id: clientId,
          refresh_token: refreshToken,
        }),
      });
      assert(
        refresh.response.status >= 400 && refresh.response.status < 500,
        "A revoked OAuth session must not refresh its tokens.",
      );
    });
  } finally {
    const cleanupFailures: string[] = [];
    await mcpClient?.close();
    try {
      if (users.length > 0) {
        await database.begin(async (sql) => {
          const scopes = await sql<{ id: string }[]>`
            SELECT id FROM core.workspaces WHERE created_by_user_id = ANY(${sql.array(users, 2950)})
          `;
          const ids = scopes.map((scope) => scope.id);
          await sql`DELETE FROM audit.events WHERE actor_user_id = ANY(${sql.array(users, 2950)})`;
          await sql`DELETE FROM private.operation_receipts WHERE actor_user_id = ANY(${
            sql.array(users, 2950)
          })`;
          if (ids.length > 0) {
            await sql`DELETE FROM finance.report_coverage WHERE workspace_id = ANY(${
              sql.array(ids, 2950)
            })`;
            await sql`UPDATE finance.import_rows SET result_summary_id=NULL, consumed_at=NULL WHERE workspace_id = ANY(${
              sql.array(ids, 2950)
            })`;
            await sql`DELETE FROM finance.monthly_summaries WHERE workspace_id = ANY(${
              sql.array(ids, 2950)
            })`;
            await sql`DELETE FROM finance.import_rows WHERE workspace_id = ANY(${
              sql.array(ids, 2950)
            })`;
            await sql`DELETE FROM finance.import_batches WHERE workspace_id = ANY(${
              sql.array(ids, 2950)
            })`;
            await sql`DELETE FROM finance.transaction_classifications WHERE workspace_id = ANY(${
              sql.array(ids, 2950)
            })`;
            await sql`DELETE FROM finance.transaction_groups WHERE workspace_id = ANY(${
              sql.array(ids, 2950)
            })`;
            await sql`DELETE FROM finance.transactions WHERE workspace_id = ANY(${
              sql.array(ids, 2950)
            })`;
            await sql`DELETE FROM finance.accounts WHERE workspace_id = ANY(${
              sql.array(ids, 2950)
            })`;
            await sql`DELETE FROM finance.book_access WHERE workspace_id = ANY(${
              sql.array(ids, 2950)
            })`;
            await sql`DELETE FROM finance.books WHERE workspace_id = ANY(${sql.array(ids, 2950)})`;
            await sql`DELETE FROM core.person_aliases WHERE workspace_id = ANY(${
              sql.array(ids, 2950)
            })`;
            await sql`DELETE FROM core.person_access WHERE workspace_id = ANY(${
              sql.array(ids, 2950)
            })`;
            await sql`DELETE FROM core.person_user_links WHERE workspace_id = ANY(${
              sql.array(ids, 2950)
            })`;
            await sql`DELETE FROM core.people WHERE workspace_id = ANY(${sql.array(ids, 2950)})`;
            await sql`DELETE FROM core.workspace_members WHERE workspace_id = ANY(${
              sql.array(ids, 2950)
            })`;
            await sql`DELETE FROM core.workspaces WHERE id = ANY(${sql.array(ids, 2950)})`;
          }
        });
      }
    } catch {
      cleanupFailures.push("MCP application fixtures");
    }
    for (const userId of users) {
      try {
        const deleted = await admin.auth.admin.deleteUser(userId);
        if (deleted.error) cleanupFailures.push("MCP Auth user");
      } catch {
        cleanupFailures.push("MCP Auth user");
      }
    }
    for (const clientId of oauthClients) {
      try {
        const deleted = await admin.auth.admin.oauth.deleteClient(clientId);
        if (deleted.error) cleanupFailures.push("MCP OAuth client");
      } catch {
        cleanupFailures.push("MCP OAuth client");
      }
    }
    try {
      if (oauthClients.length > 0) {
        await database.begin(async (sql) => {
          await sql`DELETE FROM auth.oauth_authorizations WHERE client_id = ANY(${
            sql.array(oauthClients, 2950)
          })`;
          await sql`DELETE FROM auth.oauth_consents WHERE client_id = ANY(${
            sql.array(oauthClients, 2950)
          })`;
          await sql`DELETE FROM auth.oauth_clients WHERE id = ANY(${
            sql.array(oauthClients, 2950)
          })`;
        });
      }
    } catch {
      cleanupFailures.push("MCP OAuth records");
    }
    for (const client of [...authClients, admin]) await client.auth.stopAutoRefresh();
    await database.end({ timeout: 5 });
    assert(cleanupFailures.length === 0, `OAuth cleanup failed: ${cleanupFailures.join(", ")}.`);
  }
});
