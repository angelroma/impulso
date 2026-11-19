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
const expense = {
  request_id: "44444444-4444-4444-8444-444444444444",
  kind: "expense",
  amount: "200.50",
  payee: "Oxxo",
};

function handler(overrides: Partial<HandlerDependencies> = {}) {
  return createHandler({
    authenticate: () => Promise.resolve(identity),
    mcp: { resourceUrl, authorizationServer },
    runFinance: (_identity, name) => Promise.resolve({ tool: name }),
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
  const response = await handler()(new Request(resourceUrl.replace(/\/mcp$/, "/session")));
  assert.equal(response.status, 403);
  assert.equal((await response.json()).error.code, "oauth_route_not_allowed");
});

Deno.test("MCP initializes with short guidance and the ten Finance tools", async () => {
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
  const instructions: string = initialized.result.instructions;
  assert.match(instructions, /Call get_context before the first action/);
  assert.match(instructions, /one or two lines/);
  assert.match(instructions, /Never ask the user in plain text.*choice prompt/s);
  assert.match(
    instructions,
    /statement: true.*Date \| Concept \| Category \| Account \| Income \| Expense \| Balance/s,
  );
  assert.ok(instructions.length < 2000, "Guidance must stay short.");
  assert.equal((await handle(rpc("notifications/initialized", undefined, null))).status, 202);
  const listed = await (await handle(rpc("tools/list"))).json();
  const tools = listed.result.tools as {
    name: string;
    inputSchema: { additionalProperties?: boolean; required?: string[] };
    annotations: { readOnlyHint: boolean };
  }[];
  assert.deepEqual(tools.map((tool) => tool.name), [
    "get_context",
    "manage_workspace",
    "manage_account",
    "manage_category",
    "manage_payee",
    "manage_project",
    "record_transaction",
    "update_transaction",
    "list_transactions",
    "get_summary",
  ]);
  for (const tool of tools) {
    assert.equal(tool.inputSchema.additionalProperties, false, `${tool.name} must be closed`);
    assert.equal(
      tool.annotations.readOnlyHint,
      ["get_context", "list_transactions", "get_summary"].includes(tool.name),
    );
  }
  const record = tools.find((tool) => tool.name === "record_transaction")!;
  assert.deepEqual(record.inputSchema.required, ["request_id", "kind", "amount"]);
  assert.equal((await handle(new Request(resourceUrl))).status, 405);
});

Deno.test("MCP passes validated input and the verified actor to the Finance service", async () => {
  const calls: { actor: VerifiedIdentity; name: string; input: unknown }[] = [];
  const handle = handler({
    runFinance: (actor, name, value) => {
      calls.push({ actor, name, input: value });
      return Promise.resolve({ status: "created" });
    },
  });
  const { result } = await (await handle(rpc("tools/call", {
    name: "record_transaction",
    arguments: expense,
  }))).json();
  assert.deepEqual(result.structuredContent, { status: "created" });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].actor, identity);
  assert.equal(calls[0].name, "record_transaction");
  assert.deepEqual(calls[0].input, expense);
  for (
    const argumentsValue of [
      { ...expense, user_id: "other" },
      { ...expense, amount: 200 },
      { ...expense, amount: "-5" },
      { ...expense, amount: "1.234" },
      { ...expense, kind: "refund" },
      { ...expense, request_id: "not-a-uuid" },
      { ...expense, date: "09/11/2026" },
    ]
  ) {
    const reply = await (await handle(rpc("tools/call", {
      name: "record_transaction",
      arguments: argumentsValue,
    }))).json();
    assert.ok(reply.error || reply.result.isError, JSON.stringify(argumentsValue));
  }
  assert.equal(calls.length, 1, "Invalid input must never reach the service.");
});

Deno.test("MCP returns controlled service errors and isolates simultaneous callers", async () => {
  const handle = handler({
    authenticate: (request) =>
      Promise.resolve({ ...identity, user_id: request.headers.get("test-user")! }),
    runFinance: (actor, name) =>
      name === "get_context"
        ? Promise.resolve({ user: actor.user_id })
        : Promise.reject(new ApiError(409, "name_taken", "That name is already used here.")),
  });
  const responses = await Promise.all(["first", "second"].map(async (userId) => {
    const request = rpc("tools/call", { name: "get_context", arguments: {} });
    request.headers.set("test-user", userId);
    return await (await handle(request)).json();
  }));
  assert.deepEqual(responses.map((body) => body.result.structuredContent.user), [
    "first",
    "second",
  ]);
  const request = rpc("tools/call", {
    name: "manage_workspace",
    arguments: { action: "create", name: "Yo", currency: "MXN", timezone: "UTC" },
  });
  request.headers.set("test-user", "first");
  const { result } = await (await handle(request)).json();
  assert.equal(result.isError, true);
  assert.deepEqual(JSON.parse(result.content[0].text), {
    error: { code: "name_taken", message: "That name is already used here." },
  });
  const unconfigured = await (await handler({ runFinance: undefined })(rpc("tools/call", {
    name: "get_context",
    arguments: {},
  }))).json();
  assert.equal(unconfigured.result.isError, true);
});

Deno.test("MCP rejects oversized bodies, unexpected origins, URL tokens and unsupported protocol versions", async () => {
  const handle = handler();
  const oversized = rpc("tools/call", {
    name: "record_transaction",
    arguments: { ...expense, notes: "x".repeat(33_000) },
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
