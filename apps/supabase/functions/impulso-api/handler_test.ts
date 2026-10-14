import assert from "node:assert/strict";
import { ApiError } from "../_shared/http.ts";
import { createHandler } from "./handler.ts";

const onboardingInput = {
  request_id: "33333333-3333-4333-8333-333333333333",
  display_name: "Test user",
  workspace_name: "Personal workspace",
  timezone: "UTC",
};
const googleIdentity = {
  user_id: "11111111-1111-4111-8111-111111111111",
  session_id: "22222222-2222-4222-8222-222222222222",
  email: "user@example.com",
  google_authenticated: true,
};

Deno.test("health is public and does not initialize authentication or disclose runtime details", async () => {
  const handler = createHandler({
    authenticate: () => {
      throw new Error("Authentication must not run for health.");
    },
  });
  for (const prefix of ["", "/impulso-api", "/functions/v1/impulso-api"]) {
    const response = await handler(new Request(`https://example.test${prefix}/health`));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    assert.deepEqual(await response.json(), { status: "ok", service: "Impulso" });
  }
});

Deno.test("onboarding authenticates Google and validates input before invoking the service", async () => {
  let calls = 0;
  const handler = createHandler({
    authenticate: () => Promise.resolve(googleIdentity),
    onboard: (identity, input) => {
      calls++;
      assert.equal(identity, googleIdentity);
      assert.deepEqual(input, onboardingInput);
      return Promise.resolve({ workspace_id: "workspace", person_id: "person", status: "created" });
    },
  });
  const submit = (body: unknown) =>
    handler(
      new Request("https://example.test/onboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    );
  assert.equal((await submit({ ...onboardingInput, actor_user_id: "other-user" })).status, 400);
  assert.equal((await submit({ ...onboardingInput, timezone: "Unknown/Zone" })).status, 400);
  assert.equal(calls, 0);
  const response = await submit(onboardingInput);
  assert.equal(response.status, 200);
  assert.equal(calls, 1);
  assert.deepEqual(await response.json(), {
    workspace_id: "workspace",
    person_id: "person",
    status: "created",
  });
});

Deno.test("password sessions cannot invoke onboarding even with a valid payload", async () => {
  const handler = createHandler({
    authenticate: () => Promise.resolve({ ...googleIdentity, google_authenticated: false }),
    onboard: () => {
      throw new Error("Non-Google sessions must not invoke the service.");
    },
  });
  const response = await handler(
    new Request("https://example.test/onboard", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(onboardingInput),
    }),
  );
  assert.equal(response.status, 403);
  assert.equal((await response.json()).error.code, "google_sign_in_required");
});

Deno.test("browser origins and preflights use an exact allowlist without credentials", async () => {
  const origin = "http://127.0.0.1:54321";
  const handler = createHandler({
    authenticate: () => {
      throw new Error("Preflights must not authenticate.");
    },
    allowedOrigins: [origin],
  });
  const response = await handler(
    new Request("https://example.test/onboard", {
      method: "OPTIONS",
      headers: {
        Origin: origin,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "authorization, content-type",
      },
    }),
  );
  assert.equal(response.status, 204);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), origin);
  assert.equal(response.headers.get("Access-Control-Allow-Credentials"), null);
  const denied = await handler(
    new Request("https://example.test/onboard", {
      method: "POST",
      headers: { Origin: "https://untrusted.example" },
    }),
  );
  assert.equal(denied.status, 403);
  assert.equal(denied.headers.get("Access-Control-Allow-Origin"), null);
});

Deno.test("session returns only the authenticated user's identity", async () => {
  let calls = 0;
  const handler = createHandler({
    authenticate: () => {
      calls++;
      return Promise.resolve({
        user_id: "verified-user",
        session_id: "private-session",
        email: "user@example.com",
      });
    },
  });
  const response = await handler(new Request("https://example.test/session"));
  assert.equal(calls, 1);
  assert.deepEqual(await response.json(), {
    user: { id: "verified-user", email: "user@example.com" },
  });
});

Deno.test("unknown routes, methods and caller-selected identity parameters are rejected", async () => {
  const handler = createHandler({
    authenticate: () => {
      throw new Error("Invalid routes must not authenticate.");
    },
  });
  for (
    const [path, method, status] of [
      ["/sql", "POST", 404],
      ["/session", "POST", 405],
      ["/health", "DELETE", 405],
      ["/session?user_id=another-user", "GET", 400],
      ["/health?verbose=true", "GET", 400],
      ["/other/health", "GET", 404],
    ] as const
  ) {
    const response = await handler(new Request(`https://example.test${path}`, { method }));
    assert.equal(response.status, status);
    if (status === 405) assert.equal(response.headers.get("Allow"), "GET");
  }
});

Deno.test("authentication and database failures use controlled responses without secret details", async () => {
  for (
    const [failure, status, code] of [
      [
        new ApiError(401, "invalid_session", "A valid signed-in user session is required."),
        401,
        "invalid_session",
      ],
      [
        new Error("postgres://secret:password@database/private SQL parameter token"),
        500,
        "internal_error",
      ],
    ] as const
  ) {
    const handler = createHandler({ authenticate: () => Promise.reject(failure) });
    const response = await handler(new Request("https://example.test/session"));
    assert.equal(response.status, status);
    const body = await response.json();
    assert.equal(body.error.code, code);
    assert.equal(JSON.stringify(body).includes("password"), false);
    if (status === 401) assert.equal(response.headers.get("WWW-Authenticate"), "Bearer");
  }
});
