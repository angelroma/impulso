import assert from "node:assert/strict";
import { authorizationConfiguration, createAuthorizationHandler } from "./handler.ts";

const issuer = "http://127.0.0.1:54321/auth/v1";
const publicKey = "sb_publishable_test_key";
const assets = {
  html: '<!doctype html><html lang="en"></html>',
  script: "export {};",
  styles: "body {}",
};
const handler = createAuthorizationHandler(authorizationConfiguration(issuer, publicKey), assets);
const base = "http://127.0.0.1:54321/functions/v1/impulso-auth";

Deno.test("authorization pages and assets are public and served with restrictive browser headers", async () => {
  for (
    const [path, mime, body] of [
      ["", "text/html", assets.html],
      ["/", "text/html", assets.html],
      ["/oauth/consent?authorization_id=request", "text/html", assets.html],
      ["/auth/callback?code=private_code", "text/html", assets.html],
      ["/auth.js", "application/javascript", assets.script],
      ["/styles.css", "text/css", assets.styles],
    ]
  ) {
    const response = handler(new Request(`${base}${path}`));
    assert.equal(response.status, 200);
    assert.ok(response.headers.get("Content-Type")?.startsWith(mime));
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    assert.equal(response.headers.get("X-Content-Type-Options"), "nosniff");
    assert.equal(response.headers.get("Referrer-Policy"), "no-referrer");
    assert.equal(response.headers.get("X-Frame-Options"), "DENY");
    assert.match(response.headers.get("Content-Security-Policy") ?? "", /frame-ancestors 'none'/);
    assert.equal(await response.text(), body);
  }
  assert.equal(handler(new Request("http://edge-runtime/impulso-auth/oauth/consent")).status, 200);
});

Deno.test("browser configuration uses trusted public settings and never reflected proxy headers", async () => {
  const response = handler(
    new Request(`${base}/config.json`, {
      headers: {
        Host: "untrusted.example",
        "X-Forwarded-Host": "untrusted.example",
        "X-Forwarded-Proto": "https",
      },
    }),
  );
  assert.deepEqual(await response.json(), {
    api_url: "http://127.0.0.1:54321",
    public_key: publicKey,
  });
});

Deno.test("authorization routes support HEAD and reject writes, source files and unknown paths", async () => {
  const head = handler(new Request(`${base}/auth/callback`, { method: "HEAD" }));
  assert.equal(head.status, 200);
  assert.equal(await head.text(), "");
  const post = handler(new Request(`${base}/oauth/consent`, { method: "POST" }));
  assert.equal(post.status, 405);
  assert.equal(post.headers.get("Allow"), "GET, HEAD");
  for (
    const path of ["/.env.local", "/browser/client.js", "/index.ts", "/auth.js.map", "/unknown"]
  ) {
    assert.equal(handler(new Request(`${base}${path}`)).status, 404);
  }
  assert.equal(
    handler(new Request("http://127.0.0.1:54321/other/impulso-auth/auth.js")).status,
    404,
  );
});

Deno.test("authorization configuration rejects privileged keys and unsafe or noncanonical issuers", () => {
  const jwt = (role: string) =>
    `e30.${btoa(JSON.stringify({ role })).replaceAll("=", "")}.signature`;
  assert.equal(authorizationConfiguration(issuer, jwt("anon")).publicKey, jwt("anon"));
  for (
    const key of [
      "",
      "sb_secret_private_key",
      jwt("service_role"),
      jwt("authenticated"),
      "a.invalid.c",
    ]
  ) {
    assert.throws(() => authorizationConfiguration(issuer, key));
  }
  for (
    const invalid of [
      "http://remote.example/auth/v1",
      "http://user:password@127.0.0.1:54321/auth/v1",
      `${issuer}/`,
      `${issuer}?host=other`,
      `${issuer}#fragment`,
      "http://127.0.0.1:54321/other",
    ]
  ) assert.throws(() => authorizationConfiguration(invalid, publicKey));
});
