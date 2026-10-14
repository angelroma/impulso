import assert from "node:assert/strict";
import { ApiError } from "../_shared/http.ts";
import type { VerifiedIdentity } from "../_shared/auth.ts";
import { createHandler, type HandlerDependencies } from "./handler.ts";

const resourceUrl = "http://127.0.0.1:54321/functions/v1/impulso-api/mcp";
const metadataUrl = resourceUrl.replace(/\/mcp$/, "/.well-known/oauth-protected-resource");
const authorizationServer = "http://127.0.0.1:54321/auth/v1";
const identity: VerifiedIdentity = {
  user_id: "11111111-1111-4111-8111-111111111111",
  session_id: "22222222-2222-4222-8222-222222222222",
  oauth_client_id: "33333333-3333-4333-8333-333333333333",
  oauth_scopes: ["openid", "email", "profile"],
  google_authenticated: true,
  email: "user@example.com",
};
const input = {
  request_id: "44444444-4444-4444-8444-444444444444",
  display_name: "Test user",
  workspace_name: "Personal workspace",
  timezone: "UTC",
};

function handler(overrides: Partial<HandlerDependencies> = {}) {
  return createHandler({
    authenticate: () => Promise.resolve(identity),
    mcp: { resourceUrl, authorizationServer },
    onboardingStatus: () => Promise.resolve({ status: "required" }),
    ...overrides,
  });
}

function rpc(method: string, params?: Record<string, unknown>, id: number | null = 1): Request {
  return new Request(resourceUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "Mcp-Protocol-Version": "2025-11-25",
    },
    body: JSON.stringify({ jsonrpc: "2.0", ...(id === null ? {} : { id }), method, params }),
  });
}

Deno.test("MCP discovery is public and never reflects a caller-selected authority", async () => {
  const response = await handler({
    authenticate: () => {
      throw new Error("Discovery must not authenticate.");
    },
  })(new Request(metadataUrl, { headers: { "X-Forwarded-Host": "attacker.example" } }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    resource: resourceUrl,
    resource_name: "Impulso",
    authorization_servers: [authorizationServer],
    bearer_methods_supported: ["header"],
    scopes_supported: ["openid", "email", "profile", "offline_access"],
  });
});

Deno.test("MCP discovery challenges missing tokens and direct browser sessions", async () => {
  for (
    const authenticate of [
      () => Promise.reject(new ApiError(401, "invalid_session", "Sign in.")),
      () => Promise.resolve({ ...identity, oauth_client_id: undefined, oauth_scopes: undefined }),
    ]
  ) {
    const handle = handler({ authenticate });
    for (const request of [new Request(resourceUrl), rpc("tools/list")]) {
      const response = await handle(request);
      assert.equal(response.status, 401);
      assert.equal(
        response.headers.get("WWW-Authenticate"),
        `Bearer resource_metadata="${metadataUrl}", scope="openid"`,
      );
    }
  }
});

Deno.test("MCP requires openid and a server-verified Google-linked account", async () => {
  for (
    const [overrides, expectedCode] of [
      [{ oauth_scopes: ["profile"] }, "insufficient_scope"],
      [{ google_authenticated: false }, "google_sign_in_required"],
    ] as const
  ) {
    const response = await handler({
      authenticate: () => Promise.resolve({ ...identity, ...overrides }),
    })(rpc("tools/list"));
    assert.equal(response.status, 403);
    assert.equal((await response.json()).error.code, expectedCode);
    if (expectedCode === "insufficient_scope") {
      assert.match(response.headers.get("WWW-Authenticate")!, /error="insufficient_scope"/);
    }
  }
});

Deno.test("delegated OAuth clients cannot bypass MCP identity scopes through direct HTTP routes", async () => {
  const handle = handler();
  for (const [path, method] of [["/session", "GET"], ["/onboard", "POST"]]) {
    const response = await handle(new Request(resourceUrl.replace(/\/mcp$/, path), { method }));
    assert.equal(response.status, 403);
    assert.equal((await response.json()).error.code, "oauth_route_not_allowed");
  }
});

Deno.test("MCP initializes with the SDK and advertises only conversational setup tools", async () => {
  const handle = handler();
  const response = await handle(rpc("initialize", {
    protocolVersion: "2025-11-25",
    capabilities: {},
    clientInfo: { name: "Local test", version: "1.0.0" },
  }));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("mcp-session-id"), null);
  const initialized = await response.json();
  assert.equal(initialized.result.serverInfo.name, "Impulso");
  const instructions = initialized.result.instructions;
  assert.match(instructions, /Use get_session before the first Impulso action/);
  assert.match(instructions, /If complete, skip initial setup; if unavailable/);
  assert.match(instructions, /workspace organizes the user's data/);
  assert.match(instructions, /1\. Orbit \(recommended\), 2\. Momentum, 3\. Launchpad/);
  assert.match(instructions, /Ask for a display name only when missing/);
  assert.match(instructions, /Preserve user-provided names and their language/);
  assert.match(instructions, /Call onboard only after acceptance of the complete review/);
  assert.match(instructions, /Only account setup is currently available/);
  assert.doesNotMatch(instructions, /this local version/);
  assert.equal((await handle(rpc("notifications/initialized", undefined, null))).status, 202);
  const listed = await (await handle(rpc("tools/list"))).json();
  assert.deepEqual(listed.result.tools.map((tool: { name: string }) => tool.name), [
    "get_session",
    "onboard",
  ]);
  const [session, onboard] = listed.result.tools;
  assert.deepEqual(session.inputSchema.properties, {});
  assert.equal(session.inputSchema.additionalProperties, false);
  assert.match(session.description, /before the first Impulso action/);
  assert.match(session.description, /preserve supplied names and their language/);
  assert.match(
    session.description,
    /Ask for a display name only when missing; never derive it from email/,
  );
  assert.match(session.description, /If the workspace name is missing, offer Orbit/);
  assert.match(
    session.description,
    /This response contains no display name, time-zone hint, or location/,
  );
  assert.deepEqual(onboard.inputSchema.required, [
    "request_id",
    "display_name",
    "workspace_name",
    "timezone",
  ]);
  assert.deepEqual(Object.keys(onboard.inputSchema.properties), onboard.inputSchema.required);
  assert.equal(onboard.inputSchema.additionalProperties, false);
  assert.match(onboard.description, /accept a complete review/);
  assert.match(onboard.description, /Resolve city corrections internally to a canonical IANA zone/);
  assert.match(onboard.description, /cancellation performs no write/);
  assert.match(onboard.inputSchema.properties.timezone.description, /Resolve it for the user/);
  assert.equal(onboard.annotations.readOnlyHint, false);
  assert.equal(onboard.annotations.idempotentHint, true);
  assert.equal((await handle(new Request(resourceUrl))).status, 405);
});

Deno.test("MCP advertises contextual time suggestions and a single complete setup review", async () => {
  const response = await handler()(rpc("initialize", {
    protocolVersion: "2025-11-25",
    capabilities: {},
    clientInfo: { name: "Guided setup test", version: "1.0.0" },
  }));
  const { instructions } = (await response.json()).result;
  assert.match(instructions, /user's explicit preference.*city and country first/);
  assert.match(instructions, /hint actually available in the current client context/);
  assert.match(instructions, /backend does not know the user's location/);
  assert.match(instructions, /Never infer it from email, language, IP address/);
  assert.match(instructions, /never silently default to UTC/);
  assert.match(instructions, /city or regional label/);
  assert.match(instructions, /do not require the user to type an IANA identifier/);
  assert.match(instructions, /If context is missing, ask for a city/);
  assert.match(instructions, /Clarify ambiguous cities, multi-zone countries, fixed offsets/);
  assert.match(instructions, /correction overrides a hint/);
  assert.match(
    instructions,
    /review containing the display name, workspace name, and city-based time zone/,
  );
  assert.match(instructions, /ask the user to confirm whether to continue or change/);
  assert.match(
    instructions,
    /Show a revised review after a correction\. Cancellation performs no write/,
  );
  assert.match(instructions, /Preserve that UUID and the unchanged payload for an identical retry/);
  assert.match(instructions, /changed submission needs a fresh UUID/);
});

Deno.test("MCP get_session reports setup state without creating resources or inventing hints", async () => {
  for (
    const status of [
      { status: "required" as const },
      { status: "complete" as const, workspace_id: "workspace", person_id: "person" },
      { status: "unavailable" as const },
    ]
  ) {
    let writes = 0;
    const handle = handler({
      onboardingStatus: () => Promise.resolve(status),
      onboard: () => {
        writes++;
        throw new Error("A session check must not create resources.");
      },
    });
    const { result } = await (await handle(rpc("tools/call", {
      name: "get_session",
      arguments: {},
    }))).json();
    assert.deepEqual(result.structuredContent, {
      user: { id: identity.user_id, email: identity.email },
      onboarding: status,
    });
    assert.equal(writes, 0);
    const invalid = await (await handle(rpc("tools/call", {
      name: "get_session",
      arguments: { timezone: "America/Mexico_City" },
    }))).json();
    assert.equal(invalid.result.isError, true);
  }
  const fallback = await (await handler({ onboardingStatus: undefined })(rpc("tools/call", {
    name: "get_session",
    arguments: {},
  }))).json();
  assert.deepEqual(fallback.result.structuredContent.onboarding, { status: "unavailable" });
});

Deno.test("MCP get_session honors email scope and does not expose tokens or internal session IDs", async () => {
  for (const scopes of [["openid"], ["openid", "email"]]) {
    const response = await handler({
      authenticate: () => Promise.resolve({ ...identity, oauth_scopes: scopes }),
    })(rpc("tools/call", { name: "get_session", arguments: {} }));
    const { result } = await response.json();
    assert.deepEqual(result.structuredContent, {
      user: {
        id: identity.user_id,
        ...(scopes.includes("email") ? { email: identity.email } : {}),
      },
      onboarding: { status: "required" },
    });
    assert.equal(JSON.stringify(result).includes(identity.session_id), false);
    assert.equal(JSON.stringify(result).includes(identity.oauth_client_id!), false);
  }
});

Deno.test("MCP onboarding preserves the verified actor and rejects invented identity fields", async () => {
  let calls = 0;
  const handle = handler({
    onboard: (actor, requestInput) => {
      calls++;
      assert.equal(actor, identity);
      assert.deepEqual(requestInput, input);
      return Promise.resolve({ workspace_id: "workspace", person_id: "person", status: "created" });
    },
  });
  for (
    const argumentsValue of [
      { ...input, actor_user_id: "other" },
      { ...input, timezone: "Invalid/Zone" },
      { ...input, timezone: "Madrid, Spain" },
      { ...input, timezone: "Mexico City time" },
      { ...input, timezone: "-06:00" },
      { ...input, display_name: " " },
    ]
  ) {
    const { result } =
      await (await handle(rpc("tools/call", { name: "onboard", arguments: argumentsValue })))
        .json();
    assert.equal(result.isError, true);
  }
  assert.equal(calls, 0);
  const { result } = await (await handle(rpc("tools/call", { name: "onboard", arguments: input })))
    .json();
  assert.equal(calls, 1);
  assert.deepEqual(result.structuredContent, {
    workspace_id: "workspace",
    person_id: "person",
    status: "created",
  });
});

Deno.test("MCP onboarding passes accepted names and canonical city zones through the strict contract", async () => {
  const acceptedInputs = [
    { ...input, workspace_name: "Orbit", timezone: "America/Mexico_City" },
    { ...input, display_name: "Ángel", workspace_name: "Mi Universo", timezone: "Europe/Madrid" },
  ];
  for (const accepted of acceptedInputs) {
    let calls = 0;
    const handle = handler({
      onboard: (actor, requestInput) => {
        calls++;
        assert.equal(actor, identity);
        assert.deepEqual(requestInput, accepted);
        return Promise.resolve({
          workspace_id: "workspace",
          person_id: "person",
          status: "created",
        });
      },
    });
    const response = await handle(rpc("tools/call", { name: "onboard", arguments: accepted }));
    const { result } = await response.json();
    assert.equal(response.status, 200);
    assert.equal(result.isError, undefined);
    assert.deepEqual(result.structuredContent, {
      workspace_id: "workspace",
      person_id: "person",
      status: "created",
    });
    assert.equal(calls, 1);
  }
});

Deno.test("MCP isolates simultaneous callers and returns controlled application errors", async () => {
  const handle = handler({
    authenticate: (request) =>
      Promise.resolve({ ...identity, user_id: request.headers.get("test-user")! }),
    onboard: () =>
      Promise.reject(new ApiError(409, "request_conflict", "This request has changed.")),
  });
  const responses = await Promise.all(["first", "second"].map(async (userId) => {
    const request = rpc("tools/call", { name: "get_session", arguments: {} });
    request.headers.set("test-user", userId);
    return await (await handle(request)).json();
  }));
  assert.deepEqual(responses.map((body) => body.result.structuredContent.user.id), [
    "first",
    "second",
  ]);
  const { result } = await (await handle(rpc("tools/call", { name: "onboard", arguments: input })))
    .json();
  assert.equal(result.isError, true);
  assert.deepEqual(JSON.parse(result.content[0].text), {
    error: { code: "request_conflict", message: "This request has changed." },
  });
});

Deno.test("MCP rejects oversized bodies, unexpected origins, URL tokens and unsupported protocol versions", async () => {
  const handle = handler();
  const oversized = rpc("tools/call", {
    name: "onboard",
    arguments: { ...input, display_name: "x".repeat(33_000) },
  });
  assert.equal((await handle(oversized)).status, 413);
  const originRequest = rpc("tools/list");
  originRequest.headers.set("Origin", "https://attacker.example");
  assert.equal((await handle(originRequest)).status, 403);
  assert.equal((await handle(new Request(resourceUrl + "?access_token=secret"))).status, 400);
  const wrongVersion = rpc("tools/list");
  wrongVersion.headers.set("Mcp-Protocol-Version", "1900-01-01");
  assert.equal((await handle(wrongVersion)).status, 400);
});
