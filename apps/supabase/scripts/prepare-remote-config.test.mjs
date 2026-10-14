import assert from 'node:assert/strict';
import test from 'node:test';
import {
  remoteConfiguration,
  remoteProjectRef,
} from './prepare-remote-config.mjs';

test('remote configuration fixes the project and exact HTTPS callbacks without reading credentials or copying defaults', () => {
  const environment = { IMPULSO_AUTH_SITE_URL: 'https://auth.example.invalid' };
  for (const name of [
    'SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID',
    'SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_SECRET',
  ]) {
    Object.defineProperty(environment, name, {
      get() {
        throw new Error('Credentials must not be read.');
      },
    });
  }
  const configuration = remoteConfiguration(environment);
  assert.match(
    configuration,
    /schemas = \["api"\]\nauto_expose_new_tables = false/,
  );
  assert.match(configuration, /site_url = "https:\/\/auth.example.invalid"/);
  assert.match(
    configuration,
    /additional_redirect_urls = \["https:\/\/auth.example.invalid\/auth\/callback"\]/,
  );
  assert.match(
    configuration,
    /client_id = "env\(SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID\)"/,
  );
  assert.match(
    configuration,
    /secret = "env\(SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_SECRET\)"/,
  );
  assert.ok(
    configuration.includes(
      `redirect_uri = "https://${remoteProjectRef}.supabase.co/auth/v1/callback"`,
    ),
  );
  assert.match(
    configuration,
    /\[auth.oauth_server\]\nenabled = true\nauthorization_url_path = "\/oauth\/consent"\nallow_dynamic_registration = true/,
  );
  assert.doesNotMatch(
    configuration,
    /password|smtp|mfa|rate_limit|major_version|seed|localhost|127\.0\.0\.1/,
  );
  for (const siteUrl of [
    undefined,
    'http://auth.example.invalid',
    'https://auth.example.invalid/',
    'https://auth.example.invalid/callback',
    'https://auth.example.invalid?code=private',
    'https://user:private@auth.example.invalid',
    'https://auth.example.invalid#private',
    'https://*.example.invalid',
    'https://AUTH.example.invalid',
  ]) {
    assert.throws(
      () => remoteConfiguration({ IMPULSO_AUTH_SITE_URL: siteUrl }),
      {
        message:
          'IMPULSO_AUTH_SITE_URL must be an exact HTTPS origin without a trailing slash.',
      },
    );
  }
  assert.throws(
    () =>
      remoteConfiguration({
        ...environment,
        IMPULSO_REMOTE_PROJECT_REF: 'another-project',
      }),
    {
      message: `IMPULSO_REMOTE_PROJECT_REF must identify the existing Impulso project ${remoteProjectRef}.`,
    },
  );
});
