import assert from "node:assert/strict";
import type { User } from "@supabase/supabase-js";
import { createAuthenticator, type VerifiedIdentity } from "../_shared/auth.ts";
import { ApiError } from "../_shared/http.ts";

const userId = "11111111-1111-4111-8111-111111111111";
const sessionId = "22222222-2222-4222-8222-222222222222";
const issuer = "https://example.supabase.co/auth/v1";
const verifiedUser: User = {
  id: userId,
  email: "user@example.com",
  aud: "authenticated",
  app_metadata: {},
  user_metadata: {},
  created_at: "2026-01-01T00:00:00Z",
  is_anonymous: false,
};

function token(overrides: Record<string, unknown> = {}): string {
  const payload = btoa(JSON.stringify({
    iss: issuer,
    aud: "authenticated",
    role: "authenticated",
    sub: userId,
    session_id: sessionId,
    exp: 2_000,
    ...overrides,
  })).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
  return `header.${payload}.signature`;
}

function request(accessToken = token()): Request {
  return new Request("https://example.test/session", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

Deno.test("authentication requires a bearer user token before contacting Auth", async () => {
  let calls = 0;
  const authenticate = createAuthenticator({
    issuer,
    getUser: () => {
      calls++;
      return Promise.resolve({ user: verifiedUser, error: null });
    },
    hasActiveSession: () => Promise.resolve(true),
  });
  for (
    const header of [undefined, "Bearer sb_publishable_example", "Bearer anon_key", "Basic token"]
  ) {
    const headers: Record<string, string> = header ? { Authorization: header } : {};
    await assert.rejects(
      authenticate(new Request("https://example.test/session", { headers })),
      (error: unknown) => error instanceof ApiError && error.status === 401,
    );
  }
  assert.equal(calls, 0);
});

Deno.test("decoded claims cannot authenticate a token rejected by Supabase Auth", async () => {
  let sessionChecks = 0;
  const authenticate = createAuthenticator({
    issuer,
    getUser: () => Promise.resolve({ user: null, error: { status: 401 } }),
    hasActiveSession: () => {
      sessionChecks++;
      return Promise.resolve(true);
    },
  });
  await assert.rejects(authenticate(request()), (error: unknown) => {
    return error instanceof ApiError && error.code === "invalid_session";
  });
  assert.equal(sessionChecks, 0);
});

Deno.test("verified users still require issuer, audience, expiry, subject and session claims", async () => {
  const authenticate = createAuthenticator({
    issuer,
    getUser: () => Promise.resolve({ user: verifiedUser, error: null }),
    hasActiveSession: () => Promise.resolve(true),
    now: () => 1_000_000,
  });
  const invalidClaims = [
    { iss: "https://another.supabase.co/auth/v1" },
    { aud: "anon" },
    { aud: ["another_audience"] },
    { role: "service_role" },
    { role: "anon" },
    { sub: "33333333-3333-4333-8333-333333333333" },
    { sub: "not-a-uuid" },
    { session_id: undefined },
    { session_id: "not-a-uuid" },
    { exp: 1_000 },
    { exp: "2000" },
    { exp: 2_000.5 },
    { nbf: 1_001 },
    { nbf: "1000" },
  ];
  for (const claims of invalidClaims) {
    await assert.rejects(authenticate(request(token(claims))), (error: unknown) => {
      return error instanceof ApiError && error.status === 401;
    });
  }
});

Deno.test("anonymous accounts and signed anonymous claims cannot access registered-user routes", async () => {
  for (
    const [user, claims] of [
      [{ ...verifiedUser, is_anonymous: true }, {}],
      [verifiedUser, { is_anonymous: true }],
    ] as const
  ) {
    const authenticate = createAuthenticator({
      issuer,
      getUser: () => Promise.resolve({ user, error: null }),
      hasActiveSession: () => Promise.resolve(true),
      now: () => 1_000_000,
    });
    await assert.rejects(authenticate(request(token(claims))), (error: unknown) => {
      return error instanceof ApiError && error.status === 403;
    });
  }
});

Deno.test("session checks use verified IDs and reject a revoked session", async () => {
  let received: VerifiedIdentity | undefined;
  const authenticate = createAuthenticator({
    issuer,
    getUser: () => Promise.resolve({ user: verifiedUser, error: null }),
    hasActiveSession: (identity) => {
      received = identity;
      return Promise.resolve(false);
    },
    now: () => 1_000_000,
  });
  await assert.rejects(authenticate(request()), (error: unknown) => {
    return error instanceof ApiError && error.status === 401;
  });
  assert.deepEqual(received, {
    user_id: userId,
    session_id: sessionId,
    email: "user@example.com",
    google_authenticated: false,
  });
});

Deno.test("audience arrays work and user metadata never determines actor identity", async () => {
  const authenticate = createAuthenticator({
    issuer,
    getUser: () =>
      Promise.resolve({
        user: { ...verifiedUser, user_metadata: { user_id: "another-user", role: "owner" } },
        error: null,
      }),
    hasActiveSession: () => Promise.resolve(true),
    now: () => 1_000_000,
  });
  assert.deepEqual(await authenticate(request(token({ aud: ["authenticated"] }))), {
    user_id: userId,
    session_id: sessionId,
    email: "user@example.com",
    google_authenticated: false,
  });
});

Deno.test("an unavailable Auth provider fails closed without treating it as invalid credentials", async () => {
  const authenticate = createAuthenticator({
    issuer,
    getUser: () => Promise.resolve({ user: null, error: { status: 503 } }),
    hasActiveSession: () => Promise.resolve(true),
  });
  await assert.rejects(authenticate(request()), (error: unknown) => {
    return error instanceof ApiError && error.status === 503 && error.code === "auth_unavailable";
  });
});

Deno.test("Google onboarding requires a verified Google identity, confirmed email and OAuth session", async () => {
  const googleUser: User = {
    ...verifiedUser,
    email_confirmed_at: "2026-01-01T00:00:00Z",
    identities: [{
      identity_id: "33333333-3333-4333-8333-333333333333",
      id: "google-subject",
      user_id: userId,
      provider: "google",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    }],
  };
  const cases: Array<[User, string, boolean]> = [
    [googleUser, "oauth", true],
    [googleUser, "password", false],
    [{ ...googleUser, email_confirmed_at: undefined }, "oauth", false],
    [
      { ...verifiedUser, user_metadata: { provider: "google", email_verified: true } },
      "oauth",
      false,
    ],
    [{ ...googleUser, identities: [] }, "oauth", false],
  ];
  for (const [user, method, expected] of cases) {
    const authenticate = createAuthenticator({
      issuer,
      getUser: () => Promise.resolve({ user, error: null }),
      hasActiveSession: () => Promise.resolve(true),
      now: () => 1_000_000,
    });
    const identity = await authenticate(request(token({ amr: [{ method, timestamp: 900 }] })));
    assert.equal(identity.google_authenticated, expected);
  }
});

Deno.test("delegated OAuth verifies signed client and scope claims while preserving the server actor", async () => {
  const clientId = "33333333-3333-4333-8333-333333333333";
  let received: VerifiedIdentity | undefined;
  const authenticate = createAuthenticator({
    issuer,
    getUser: () =>
      Promise.resolve({
        user: {
          ...verifiedUser,
          email_confirmed_at: "2026-01-01T00:00:00Z",
          identities: [{
            identity_id: "44444444-4444-4444-8444-444444444444",
            id: "google-subject",
            user_id: userId,
            provider: "google",
            created_at: "2026-01-01T00:00:00Z",
            updated_at: "2026-01-01T00:00:00Z",
          }],
          user_metadata: { client_id: "attacker", scope: "admin" },
        },
        error: null,
      }),
    hasActiveSession: (identity) => {
      received = identity;
      return Promise.resolve(true);
    },
    now: () => 1_000_000,
  });
  const identity = await authenticate(request(token({
    client_id: clientId,
    scope: "openid email offline_access",
    amr: [{ method: "oauth_provider/authorization_code", timestamp: 900 }],
  })));
  assert.equal(identity.google_authenticated, true);
  assert.equal(identity.oauth_client_id, clientId);
  assert.deepEqual(identity.oauth_scopes, ["openid", "email", "offline_access"]);
  assert.equal(received, identity);
  assert.equal(Object.isFrozen(identity.oauth_scopes), true);
  for (
    const overrides of [
      { client_id: "attacker" },
      { scope: "admin" },
      { scope: undefined },
      { amr: [{ method: "password" }] },
      { amr: [{ method: "oauth" }] },
    ]
  ) {
    await assert.rejects(
      authenticate(request(token({
        client_id: clientId,
        scope: "openid",
        amr: [{ method: "oauth_provider/authorization_code", timestamp: 900 }],
        ...overrides,
      }))),
      (error: unknown) => error instanceof ApiError && error.status === 401,
    );
  }
});
