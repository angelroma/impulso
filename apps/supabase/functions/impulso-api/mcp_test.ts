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

Deno.test("MCP initializes with twenty strict account and Finance tools", async () => {
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
  assert.match(instructions, /Finance supports the advertised closed tools/);
  assert.match(instructions, /Never count summary coverage together with its detail/);
  assert.doesNotMatch(instructions, /this local version/);
  assert.equal((await handle(rpc("notifications/initialized", undefined, null))).status, 202);
  const listed = await (await handle(rpc("tools/list"))).json();
  assert.deepEqual(listed.result.tools.map((tool: { name: string }) => tool.name), [
    "get_session",
    "onboard",
    "get_finance_context",
    "create_book",
    "create_account",
    "record_expense",
    "configure_account",
    "manage_category",
    "record_transaction",
    "correct_transaction",
    "list_transactions",
    "manage_budget",
    "manage_plan",
    "manage_debt",
    "manage_goal",
    "manage_asset",
    "get_finance_report",
    "preview_finance_import",
    "commit_finance_import",
    "get_finance_import",
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

Deno.test("MCP Finance discovery advertises closed inputs and outputs", async () => {
  const { result } = await (await handler()(rpc("tools/list"))).json();
  const expected: Record<string, string[]> = {
    get_finance_context: ["workspace_id"],
    create_book: ["request_id", "workspace_id", "name", "currency"],
    create_account: [
      "request_id",
      "workspace_id",
      "book_id",
      "name",
      "currency",
      "opening_balance",
      "person_id",
    ],
    record_expense: [
      "request_id",
      "workspace_id",
      "book_id",
      "source_account_id",
      "amount",
      "currency",
      "occurred_on",
      "description",
      "beneficiary_person_id",
    ],
  };
  for (const name of Object.keys(expected)) {
    const tool = result.tools.find((entry: { name: string }) => entry.name === name);
    assert.deepEqual(tool.inputSchema.required, expected[name]);
    assert.equal(tool.inputSchema.additionalProperties, false);
    assert.equal(tool.outputSchema.additionalProperties, false);
    assert.equal(tool.annotations.readOnlyHint, name === "get_finance_context");
    assert.equal(tool.annotations.idempotentHint, true);
    assert.equal(tool.annotations.openWorldHint, false);
  }
});

Deno.test("MCP Finance guidance resolves missing details and preserves truthful outcomes", async () => {
  const { result } = await (await handler()(rpc("initialize", {
    protocolVersion: "2025-11-25",
    capabilities: {},
    clientInfo: { name: "Finance walkthrough", version: "1" },
  }))).json();
  const instructions = result.instructions;
  for (
    const phrase of [
      "retain the original request",
      "Follow next_cursor",
      "Ask only missing or ambiguous details",
      "Never infer MXN",
      "exact decimal strings",
      "Everyday",
      "Main account",
      "suggestions, not automatic defaults",
      "verified self",
      "shared or unassigned choice",
      "never create or guess another person",
      "Complete explicit expense instructions need no redundant confirmation",
      "reliable message time",
      "current_local_date",
      "freeze the accepted date across midnight",
      "Each call commits separately",
      "never blindly use a fresh key",
      "never claim a bank payment occurred",
    ]
  ) assert.ok(instructions.toLowerCase().includes(phrase.toLowerCase()), phrase);
  assert.doesNotMatch(instructions, /Finance and Health writes are not implemented/);
});

Deno.test("MCP Finance tools pass only validated fields and the verified actor", async () => {
  const workspace_id = "55555555-5555-4555-8555-555555555555";
  const book_id = "66666666-6666-4666-8666-666666666666";
  const account_id = "77777777-7777-4777-8777-777777777777";
  const transaction_id = "88888888-8888-4888-8888-888888888888";
  const request_id = input.request_id;
  const cases = [
    {
      name: "create_book",
      value: { request_id, workspace_id, name: "Mi libro", currency: "MXN" },
      result: {
        status: "created",
        workspace_id,
        book_id,
        name: "Mi libro",
        currency: "MXN",
        minor_unit: 2,
      },
    },
    {
      name: "create_account",
      value: {
        request_id,
        workspace_id,
        book_id,
        name: "Efectivo",
        currency: "MXN",
        opening_balance: "0.00",
        person_id: null,
      },
      result: {
        status: "created",
        workspace_id,
        book_id,
        account_id,
        name: "Efectivo",
        currency: "MXN",
        opening_balance: "0.00",
        person_id: null,
      },
    },
    {
      name: "record_expense",
      value: {
        request_id,
        workspace_id,
        book_id,
        source_account_id: account_id,
        amount: "100.00",
        currency: "MXN",
        occurred_on: "2026-10-13",
        description: "Hamburguesa",
        beneficiary_person_id: null,
      },
      result: {
        status: "created",
        workspace_id,
        book_id,
        source_account_id: account_id,
        transaction_id,
        amount: "100.00",
        currency: "MXN",
        occurred_on: "2026-10-13",
        description: "Hamburguesa",
        beneficiary_person_id: null,
      },
    },
  ];
  for (const testCase of cases) {
    let calls = 0;
    const operation = (actor: VerifiedIdentity, value: unknown) => {
      calls++;
      assert.equal(actor, identity);
      assert.deepEqual(value, testCase.value);
      return Promise.resolve(testCase.result);
    };
    const dependencies = {
      create_book: { createBook: operation },
      create_account: { createAccount: operation },
      record_expense: { recordExpense: operation },
    }[testCase.name];
    const handle = handler(dependencies as Partial<HandlerDependencies>);
    for (
      const bad of [{ ...testCase.value, actor_user_id: identity.user_id }, {
        ...testCase.value,
        kind: "income",
      }, { ...testCase.value, workspace_id: "invalid" }]
    ) {
      const { result } =
        await (await handle(rpc("tools/call", { name: testCase.name, arguments: bad }))).json();
      assert.equal(result.isError, true);
    }
    assert.equal(calls, 0);
    const { result } =
      await (await handle(rpc("tools/call", { name: testCase.name, arguments: testCase.value })))
        .json();
    assert.equal(result.isError, undefined);
    assert.deepEqual(result.structuredContent, testCase.result);
    assert.equal(calls, 1);
  }
});

Deno.test("MCP Finance validation and service errors never trigger fallback actions", async () => {
  let calls = 0;
  const expense = {
    request_id: input.request_id,
    workspace_id: identity.user_id,
    book_id: identity.session_id,
    source_account_id: identity.oauth_client_id!,
    amount: "100.00",
    currency: "MXN",
    occurred_on: "2026-10-13",
    description: "Lunch",
    beneficiary_person_id: null,
  };
  const handle = handler({
    recordExpense: () => {
      calls++;
      throw new ApiError(409, "request_conflict", "This request identifier cannot be reused.");
    },
  });
  for (
    const changed of [{ amount: 100 }, { occurred_on: "2026-02-30" }, {
      beneficiary_person_id: "unknown",
    }, { currency: "mxn" }]
  ) {
    const { result } = await (await handle(
      rpc("tools/call", { name: "record_expense", arguments: { ...expense, ...changed } }),
    )).json();
    assert.equal(result.isError, true);
  }
  assert.equal(calls, 0);
  const { result } =
    await (await handle(rpc("tools/call", { name: "record_expense", arguments: expense }))).json();
  assert.equal(result.isError, true);
  assert.equal(JSON.parse(result.content[0].text).error.code, "request_conflict");
  assert.equal(calls, 1);
  assert.equal(
    (await handler()(new Request(resourceUrl.replace(/\/mcp$/, "/finance")))).status,
    404,
  );
});

Deno.test("MCP Finance context remains read-only and isolates concurrent callers", async () => {
  const workspace_id = identity.user_id;
  const callers: string[] = [];
  const handle = handler({
    authenticate: (request) =>
      Promise.resolve({ ...identity, user_id: request.headers.get("test-user")! }),
    getFinanceContext: (actor, value) => {
      callers.push(actor.user_id);
      assert.deepEqual(value, { workspace_id });
      return Promise.resolve({
        workspace_id,
        timezone: "America/Mexico_City",
        current_local_date: "2026-10-13",
        self: null,
        books: [],
        accounts: [],
        selected_book: null,
        next_cursor: null,
        can_create_book: true,
      });
    },
    createBook: () => {
      throw new Error("Context must not create resources.");
    },
  });
  await Promise.all([identity.user_id, identity.session_id].map(async (user) => {
    const request = rpc("tools/call", { name: "get_finance_context", arguments: { workspace_id } });
    request.headers.set("test-user", user);
    const { result } = await (await handle(request)).json();
    assert.equal(result.isError, undefined);
    assert.equal(result.structuredContent.self, null);
  }));
  assert.deepEqual(callers.sort(), [identity.user_id, identity.session_id].sort());
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

Deno.test("MCP planning families advertise closed branches and truthful read annotations", async () => {
  const { result } = await (await handler()(rpc("tools/list"))).json();
  function closedObjects(value: unknown): number {
    if (!value || typeof value !== "object") return 0;
    let count = 0;
    const node = value as Record<string, unknown>;
    if (node.properties) {
      assert.equal(node.additionalProperties, false);
      count++;
    }
    for (const child of Object.values(node)) {
      if (Array.isArray(child)) { for (const item of child) count += closedObjects(item); }
      else count += closedObjects(child);
    }
    return count;
  }
  for (const tool of result.tools.slice(6)) {
    assert.ok(closedObjects(tool.inputSchema) > 0, tool.name);
    assert.ok(closedObjects(tool.outputSchema) > 0, tool.name);
    assert.equal(
      tool.annotations.readOnlyHint,
      ["list_transactions", "get_finance_report", "get_finance_import"].includes(tool.name),
    );
    assert.equal(tool.annotations.openWorldHint, false);
    assert.equal(tool.annotations.idempotentHint, true);
  }
  const initialized = await (await handler()(rpc("initialize", {
    protocolVersion: "2025-11-25",
    capabilities: {},
    clientInfo: { name: "Planning", version: "1" },
  }))).json();
  for (
    const phrase of [
      "version conflicts",
      "cancellation writes nothing",
      "Transfers and loan principal",
      "never the whole workbook",
      "separate accepted commit",
      "Unknown opening dates",
    ]
  ) {
    assert.ok(initialized.result.instructions.toLowerCase().includes(phrase.toLowerCase()), phrase);
  }
});

Deno.test("MCP rejects nested cross-branch fields and leaves unsupported actions uncalled", async () => {
  let calls = 0;
  const handle = handler({
    runExtendedFinance: () => {
      calls++;
      return Promise.resolve({});
    },
  });
  const scope = {
    workspace_id: input.request_id,
    book_id: identity.user_id,
    request_id: identity.session_id,
  };
  const entry = {
    kind: "income",
    destination_account_id: identity.user_id,
    amount: "100.00",
    currency: "MXN",
    occurred_on: "2026-10-13",
    description: "Salary",
    beneficiary_person_id: null,
    category_id: null,
  };
  for (
    const [name, value] of [
      ["record_transaction", {
        ...scope,
        action: "single",
        entry: { ...entry, source_account_id: identity.user_id },
      }],
      ["record_transaction", {
        ...scope,
        action: "group",
        description: "Too many",
        currency: "MXN",
        total_amount: "1100",
        entries: Array(11).fill(entry),
      }],
      ["manage_budget", { ...scope, action: "delete", sql: "SELECT secret" }],
      ["get_finance_report", {
        workspace_id: scope.workspace_id,
        book_id: scope.book_id,
        report: "balances",
        starts_on: "2026-01-01",
        ends_on: "2026-12-31",
        as_of: "2026-10-13",
        actor_user_id: identity.user_id,
      }],
    ] as const
  ) {
    const response = await (await handle(rpc("tools/call", { name, arguments: value }))).json();
    assert.ok(response.result?.isError || response.error);
  }
  assert.equal(calls, 0);
});

Deno.test("MCP extended Finance validates actor, normalized input and closed output", async () => {
  const value = {
    workspace_id: input.request_id,
    book_id: identity.user_id,
    request_id: identity.session_id,
    account_id: identity.oauth_client_id!,
    expected_version: 1,
    account_kind: "bank",
    opening_balance_on: "2026-01-01",
  };
  const output = {
    workspace_id: value.workspace_id,
    book_id: value.book_id,
    status: "updated",
    account_id: value.account_id,
    account_kind: "bank",
    opening_balance_on: value.opening_balance_on,
    version: 2,
  };
  let calls = 0;
  const handle = handler({
    runExtendedFinance: (actor, name, parsed) => {
      calls++;
      assert.equal(actor, identity);
      assert.equal(name, "configure_account");
      assert.deepEqual(parsed, value);
      return Promise.resolve(calls === 1 ? output : { ...output, sql: "private evidence" });
    },
  });
  const request = () => rpc("tools/call", { name: "configure_account", arguments: value });
  const accepted = await (await handle(request())).json();
  assert.deepEqual(accepted.result.structuredContent, output);
  const rejected = await (await handle(request())).json();
  assert.equal(rejected.result.isError, true);
  assert.equal(JSON.parse(rejected.result.content[0].text).error.code, "invalid_service_response");
  assert.doesNotMatch(JSON.stringify(rejected), /private evidence/);
  const missing = await (await handler()(request())).json();
  assert.equal(JSON.parse(missing.result.content[0].text).error.code, "service_unavailable");
});
