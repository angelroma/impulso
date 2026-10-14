import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  buildStaticAuthorizationSite,
  staticAuthorizationConfiguration,
} from './build-auth-static.mjs';

const environment = {
  IMPULSO_AUTH_API_URL: 'https://project.supabase.co',
  IMPULSO_AUTH_PUBLIC_KEY: 'sb_publishable_public_test_key',
};

test('static build emits root assets, refreshed route aliases and restrictive hosting headers', async (t) => {
  const outputRoot = await mkdtemp(join(tmpdir(), 'impulso-auth-'));
  t.after(() => rm(outputRoot, { recursive: true, force: true }));
  await buildStaticAuthorizationSite(outputRoot, environment);
  const html = await readFile(join(outputRoot, 'index.html'), 'utf8');
  assert.match(html, /data-authorization-base-path=""/);
  assert.match(html, /href="\/styles.css"/);
  assert.match(html, /src="\/auth.js"/);
  assert.match(
    html,
    /https:\/\/project.supabase.co\/functions\/v1\/impulso-api\/mcp/,
  );
  assert.doesNotMatch(html, /Local|127\.0\.0\.1|functions\/v1\/impulso-auth/);
  for (const route of ['oauth/consent', 'auth/callback']) {
    assert.equal(
      await readFile(join(outputRoot, route, 'index.html'), 'utf8'),
      html,
    );
  }
  assert.deepEqual(
    JSON.parse(await readFile(join(outputRoot, 'config.json'), 'utf8')),
    {
      api_url: environment.IMPULSO_AUTH_API_URL,
      public_key: environment.IMPULSO_AUTH_PUBLIC_KEY,
    },
  );
  const headers = await readFile(join(outputRoot, '_headers'), 'utf8');
  assert.match(headers, /Cache-Control: no-store/);
  assert.match(headers, /Referrer-Policy: no-referrer/);
  assert.match(headers, /X-Frame-Options: DENY/);
  assert.match(
    headers,
    /script-src 'self'; style-src 'self'; connect-src 'self' https:\/\/project.supabase.co/,
  );
  assert.match(
    headers,
    /frame-ancestors 'none'; base-uri 'none'; form-action 'none'/,
  );
  assert.equal(
    await readFile(join(outputRoot, '_redirects'), 'utf8'),
    '/oauth/consent /index.html 200\n/auth/callback /index.html 200\n',
  );
  assert.ok((await readFile(join(outputRoot, 'auth.js'), 'utf8')).length > 0);
  assert.ok(
    (await readFile(join(outputRoot, 'styles.css'), 'utf8')).length > 0,
  );
});

test('static configuration rejects privileged keys and noncanonical API origins without echoing them', () => {
  for (const publicKey of [
    undefined,
    'sb_secret_private_test_key',
    'private-service-role-key',
  ]) {
    assert.throws(
      () =>
        staticAuthorizationConfiguration({
          ...environment,
          IMPULSO_AUTH_PUBLIC_KEY: publicKey,
        }),
      {
        message: 'IMPULSO_AUTH_PUBLIC_KEY must be a Supabase publishable key.',
      },
    );
  }
  for (const apiUrl of [
    undefined,
    'http://project.supabase.co',
    'https://project.supabase.co/auth/v1',
    'https://project.supabase.co?key=private',
    'https://user:private@project.supabase.co',
    'https://project.supabase.co/#private',
  ]) {
    assert.throws(
      () =>
        staticAuthorizationConfiguration({
          ...environment,
          IMPULSO_AUTH_API_URL: apiUrl,
        }),
      {
        message: 'IMPULSO_AUTH_API_URL must be the HTTPS Supabase API origin.',
      },
    );
  }
});
