import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  buildAuthorizationAssets,
  buildStaticSite,
  LOCAL_BASE_PATH,
  LOCAL_MCP_URL,
  renderPage,
  staticConfiguration,
} from "./build-auth.mjs";

const environment = {
  IMPULSO_AUTH_API_URL: "https://project.supabase.co",
  IMPULSO_AUTH_PUBLIC_KEY: "sb_publishable_public_test_key",
};

test("templates fail loudly when a value is missing", () => {
  assert.equal(renderPage('<a href="{{BASE_PATH}}/x">', { BASE_PATH: "/p" }), '<a href="/p/x">');
  assert.throws(() => renderPage("{{MCP_URL}}", {}), /needs a value for MCP_URL/);
});

test("the local build points at the local Edge Function and MCP server", async () => {
  const { html } = await buildAuthorizationAssets({
    basePath: LOCAL_BASE_PATH,
    mcpUrl: LOCAL_MCP_URL,
  });
  assert.match(html, /data-authorization-base-path="\/functions\/v1\/impulso-auth"/);
  assert.match(html, /src="\/functions\/v1\/impulso-auth\/auth.js"/);
  assert.ok(html.includes(LOCAL_MCP_URL));
  assert.doesNotMatch(html, /\{\{/);
});

test("the static build emits root assets, route aliases and restrictive headers", async (t) => {
  const outputRoot = await mkdtemp(join(tmpdir(), "impulso-auth-"));
  t.after(() => rm(outputRoot, { recursive: true, force: true }));
  await buildStaticSite(outputRoot, environment);
  const html = await readFile(join(outputRoot, "index.html"), "utf8");
  assert.match(html, /data-authorization-base-path=""/);
  assert.match(html, /href="\/styles.css"/);
  assert.match(html, /https:\/\/project.supabase.co\/functions\/v1\/impulso-api\/mcp/);
  assert.doesNotMatch(html, /127\.0\.0\.1|functions\/v1\/impulso-auth|\{\{/);
  for (const route of ["oauth/consent", "auth/callback"]) {
    assert.equal(await readFile(join(outputRoot, route, "index.html"), "utf8"), html);
  }
  assert.deepEqual(JSON.parse(await readFile(join(outputRoot, "config.json"), "utf8")), {
    api_url: environment.IMPULSO_AUTH_API_URL,
    public_key: environment.IMPULSO_AUTH_PUBLIC_KEY,
  });
  const headers = await readFile(join(outputRoot, "_headers"), "utf8");
  for (
    const expected of [
      /Cache-Control: no-store/,
      /Referrer-Policy: no-referrer/,
      /X-Frame-Options: DENY/,
      /connect-src 'self' https:\/\/project.supabase.co;/,
      /frame-ancestors 'none'; base-uri 'none'; form-action 'none'/,
    ]
  ) assert.match(headers, expected);
  assert.equal(
    await readFile(join(outputRoot, "_redirects"), "utf8"),
    "/oauth/consent /index.html 200\n/auth/callback /index.html 200\n",
  );
});

test("static configuration rejects secret keys and non-origin URLs without echoing them", () => {
  for (const key of [undefined, "sb_secret_private_test_key", "private-service-role-key"]) {
    assert.throws(
      () => staticConfiguration({ ...environment, IMPULSO_AUTH_PUBLIC_KEY: key }),
      { message: "IMPULSO_AUTH_PUBLIC_KEY must be a Supabase publishable key." },
    );
  }
  for (
    const url of [
      undefined,
      "http://project.supabase.co",
      "https://project.supabase.co/",
      "https://project.supabase.co/auth/v1",
      "https://project.supabase.co?key=private",
      "https://user:private@project.supabase.co",
    ]
  ) {
    assert.throws(
      () => staticConfiguration({ ...environment, IMPULSO_AUTH_API_URL: url }),
      { message: "IMPULSO_AUTH_API_URL must be the HTTPS Supabase API origin." },
    );
  }
});
