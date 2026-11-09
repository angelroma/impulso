import assert from "node:assert/strict";
import { ApiError } from "../_shared/http.ts";
import { createHandler } from "./handler.ts";

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

Deno.test("browser origins and preflights use an exact allowlist without credentials", async () => {
  const origin = "http://127.0.0.1:54321";
  const handler = createHandler({
    authenticate: () => {
      throw new Error("Preflights must not authenticate.");
    },
    allowedOrigins: [origin],
  });
  const response = await handler(
    new Request("https://example.test/session", {
      method: "OPTIONS",
      headers: {
        Origin: origin,
        "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Headers": "authorization, content-type",
      },
    }),
  );
  assert.equal(response.status, 204);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), origin);
  assert.equal(response.headers.get("Access-Control-Allow-Credentials"), null);
  const denied = await handler(
    new Request("https://example.test/session", {
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
      ["/onboard", "POST", 404],
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
