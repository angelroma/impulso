import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { renderPage } from '../../../scripts/build-auth.mjs';

const source = readFileSync(new URL('./client.js', import.meta.url), 'utf8')
  .replace(/^import .*?;\r?\n/, '')
  .replace('\ninitialize().catch(', '\nglobalThis.ready = initialize().catch(');
const authorizationBasePath = '/functions/v1/impulso-auth';
const html = renderPage(readFileSync(new URL('./index.html', import.meta.url), 'utf8'), {
  BASE_PATH: authorizationBasePath,
  MCP_URL: 'http://127.0.0.1:54321/functions/v1/impulso-api/mcp',
});
const requestId = '8cf62009-29bc-432b-9f57-0bb0a4c25a3e';
const authorizationBaseUrl = `http://127.0.0.1:54321${authorizationBasePath}`;
const consentUrl = `${authorizationBaseUrl}/oauth/consent?authorization_id=${requestId}`;
const storageKey = 'impulso-oauth-authorization';

async function page(options = {}) {
  const calls = [];
  const assigned = [];
  const replaced = [];
  const store = new Map(Object.entries(options.storage ?? {}));
  const user = {
    id: 'user-1',
    email: 'test@example.invalid',
    email_confirmed_at: '2026-10-12T00:00:00Z',
    identities: [{ provider: 'google' }],
    ...options.user,
  };
  const claims = {
    sub: user.id,
    amr: [{ method: 'oauth' }],
    ...options.claims,
  };
  const details = options.details ?? {
    authorization_id: requestId,
    redirect_uri: 'http://127.0.0.1:9000/callback',
    client: { id: 'local-test-client', name: '<img src=x onerror=alert(1)>' },
    user: { id: user.id },
    scope: 'openid email profile',
  };
  const sessionStorage = {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => store.set(key, value),
    removeItem: (key) => store.delete(key),
  };
  const elements = new Map();
  for (const match of html.matchAll(/<[^>]+\bid="([^"]+)"[^>]*>/g)) {
    elements.set(match[1], {
      hidden: /\bhidden\b/.test(match[0]),
      disabled: false,
      textContent: '',
      children: [],
      handlers: new Map(),
      addEventListener(event, callback) {
        this.handlers.set(event, callback);
      },
      replaceChildren(...children) {
        this.children = children;
      },
    });
  }
  const record = (name, data) => {
    calls.push({ name, data });
  };
  const auth = {
    async getSession() {
      return {
        data: {
          session: options.signedOut
            ? null
            : { access_token: 'private-test-token' },
        },
      };
    },
    async getUser() {
      return { data: { user }, error: options.userError };
    },
    async getClaims() {
      return { data: { claims }, error: options.claimError };
    },
    async exchangeCodeForSession(code) {
      record('exchange', code);
      return { error: options.exchangeError };
    },
    async signInWithOAuth(settings) {
      record('signIn', settings);
      return { error: null };
    },
    async signOut() {
      record('signOut');
      return { error: null };
    },
    oauth: {
      async getAuthorizationDetails(id) {
        record('details', id);
        return { data: details, error: options.detailsError };
      },
      async approveAuthorization(id, settings) {
        record('approve', { id, ...settings });
        return {
          data: {
            redirect_url:
              options.redirect ??
              'http://127.0.0.1:9000/callback?code=private-code&state=client-state',
          },
        };
      },
      async denyAuthorization(id, settings) {
        record('deny', { id, ...settings });
        return {
          data: {
            redirect_url:
              'http://127.0.0.1:9000/callback?error=access_denied&state=client-state',
          },
        };
      },
    },
  };
  const url = new URL(options.url ?? consentUrl);
  const basePath = options.basePath ?? authorizationBasePath;
  const apiUrl = options.apiUrl ?? 'http://127.0.0.1:54321';
  const context = {
    URL,
    Date,
    sessionStorage,
    document: {
      documentElement: { dataset: { authorizationBasePath: basePath } },
      getElementById: (id) => elements.get(id),
      createElement: () => ({ textContent: '' }),
    },
    location: {
      href: url.href,
      origin: url.origin,
      assign: (destination) => assigned.push(destination),
    },
    history: {
      replaceState: (_state, _title, destination) => replaced.push(destination),
    },
    createClient: (_url, _key, settings) => {
      record('client', settings);
      return { auth };
    },
    fetch: async (resource, settings) => {
      record('fetch', resource);
      if (resource === `${basePath}/config.json`)
        return {
          ok: true,
          json: async () => ({
            api_url: apiUrl,
            public_key: 'public-test-key',
          }),
        };
      assert.equal(resource, `${apiUrl}/functions/v1/impulso-api/session`);
      assert.equal(settings.headers.Authorization, 'Bearer private-test-token');
      return {
        ok: !options.revoked,
        json: async () => ({ user: { id: user.id } }),
      };
    },
  };
  vm.runInNewContext(source, context);
  await context.ready;
  return {
    calls,
    assigned,
    replaced,
    store,
    user,
    claims,
    elements,
    click: async (id) => elements.get(id).handlers.get('click')(),
    text: (id) => elements.get(id).textContent,
    count: (name) => calls.filter((call) => call.name === name).length,
  };
}

test('home directs the user to their MCP client without signing in or creating a workspace', async () => {
  for (const suffix of ['', '/']) {
    const ui = await page({ url: `${authorizationBaseUrl}${suffix}` });
    assert.equal(ui.calls.length, 0);
    assert.equal(ui.elements.get('sign-in').hidden, true);
    assert.equal(ui.elements.get('consent').hidden, true);
    assert.match(ui.text('message'), /MCP server/);
  }
  assert.ok(html.includes(`href="${authorizationBasePath}/styles.css"`));
  assert.ok(html.includes(`src="${authorizationBasePath}/auth.js"`));
  assert.doesNotMatch(html, /<form|Create my workspace|name="display_name"/);
});

test('signed-out consent preserves the request across Google PKCE sign-in', async () => {
  const ui = await page({ signedOut: true });
  assert.equal(ui.elements.get('sign-in').hidden, false);
  await ui.click('sign-in');
  const signIn = ui.calls.find((call) => call.name === 'signIn').data;
  assert.equal(signIn.provider, 'google');
  assert.equal(
    signIn.options.redirectTo,
    `${authorizationBaseUrl}/auth/callback`,
  );
  assert.equal(
    ui.calls.find((call) => call.name === 'fetch').data,
    `${authorizationBasePath}/config.json`,
  );
  assert.equal(JSON.parse(ui.store.get(storageKey)).id, requestId);
  assert.equal(ui.count('approve'), 0);
});

test('hosted consent uses its site origin for PKCE and the public API origin for session checks', async () => {
  const hosted = {
    basePath: '',
    apiUrl: 'https://project.supabase.co',
    url: `https://auth.example.invalid/oauth/consent?authorization_id=${requestId}`,
  };
  const signedOut = await page({ ...hosted, signedOut: true });
  await signedOut.click('sign-in');
  const signIn = signedOut.calls.find((call) => call.name === 'signIn').data;
  assert.equal(
    signIn.options.redirectTo,
    'https://auth.example.invalid/auth/callback',
  );
  assert.equal(
    signedOut.calls.find((call) => call.name === 'fetch').data,
    '/config.json',
  );
  const client = signedOut.calls.find((call) => call.name === 'client').data;
  assert.equal(client.auth.flowType, 'pkce');
  assert.equal(client.auth.detectSessionInUrl, false);
  const signedIn = await page(hosted);
  assert.equal(signedIn.elements.get('consent').hidden, false);
  assert.ok(
    signedIn.calls.some(
      (call) =>
        call.name === 'fetch' &&
        call.data ===
          'https://project.supabase.co/functions/v1/impulso-api/session',
    ),
  );
  assert.equal(signedIn.count('approve'), 0);
});

test('static folder aliases preserve consent and callbacks across browser refresh', async () => {
  const hosted = { basePath: '', apiUrl: 'https://project.supabase.co' };
  const refreshed = await page({
    ...hosted,
    url: `https://auth.example.invalid/oauth/consent/?authorization_id=${requestId}`,
  });
  assert.equal(refreshed.elements.get('consent').hidden, false);
  const callback = await page({
    ...hosted,
    url: 'https://auth.example.invalid/auth/callback/?code=private-code',
    storage: {
      [storageKey]: JSON.stringify({ id: requestId, created_at: Date.now() }),
    },
  });
  assert.equal(callback.count('exchange'), 1);
  assert.equal(
    callback.replaced[0],
    `/oauth/consent?authorization_id=${requestId}`,
  );
  assert.equal(callback.elements.get('consent').hidden, false);
  const refreshedCallback = await page({
    ...hosted,
    url: `https://auth.example.invalid${callback.replaced[0]}`,
  });
  assert.equal(refreshedCallback.count('exchange'), 0);
  assert.equal(refreshedCallback.elements.get('consent').hidden, false);
});

test('verified client details render as text and approval requires an explicit click', async () => {
  const ui = await page();
  assert.equal(ui.elements.get('consent').hidden, false);
  assert.equal(ui.text('client-name'), '<img src=x onerror=alert(1)>');
  assert.equal(ui.elements.get('scopes').children.length, 3);
  assert.equal(ui.count('approve'), 0);
  assert.equal(ui.assigned.length, 0);
  await ui.click('approve');
  const approval = ui.calls.find((call) => call.name === 'approve').data;
  assert.equal(approval.id, requestId);
  assert.equal(approval.skipBrowserRedirect, true);
  assert.match(ui.assigned[0], /^http:\/\/127\.0\.0\.1:9000\/callback\?code=/);
  assert.equal(ui.store.has(storageKey), false);
});

test('denial returns access_denied without approving the request', async () => {
  const ui = await page();
  await ui.click('deny');
  assert.equal(ui.count('deny'), 1);
  assert.equal(ui.count('approve'), 0);
  assert.match(ui.assigned[0], /error=access_denied/);
});

test('missing, duplicate and malformed authorization identifiers cannot start a flow', async () => {
  for (const suffix of [
    '',
    '?authorization_id=bad/path',
    `?authorization_id=${requestId}&authorization_id=${requestId}`,
  ]) {
    const ui = await page({
      url: `${authorizationBaseUrl}/oauth/consent${suffix}`,
    });
    assert.equal(ui.calls.length, 0);
    assert.equal(ui.elements.get('consent').hidden, true);
  }
});

test('unverified identities, password sign-in and revoked sessions cannot load consent', async () => {
  for (const options of [
    { user: { identities: [{ provider: 'email' }] } },
    { user: { email_confirmed_at: null } },
    { user: { is_anonymous: true } },
    { claims: { amr: [{ method: 'password' }] } },
    { userError: { message: 'Private upstream detail' } },
    { claimError: { message: 'Private upstream detail' } },
    { revoked: true },
  ]) {
    const ui = await page(options);
    assert.equal(ui.count('details'), 0);
    assert.equal(ui.elements.get('consent').hidden, true);
    assert.doesNotMatch(ui.text('message'), /Private upstream detail/);
  }
});

test('approval rechecks the session and rejects an account changed after the page loaded', async () => {
  const ui = await page();
  ui.user.id = 'another-user';
  ui.claims.sub = 'another-user';
  await ui.click('approve');
  assert.equal(ui.count('approve'), 0);
  assert.equal(ui.assigned.length, 0);
  assert.match(ui.text('message'), /account changed/);
});

test('unsafe callbacks and callbacks changed by an unexpected response are not followed', async () => {
  for (const redirect of [
    'javascript:alert(1)',
    'http://evil.example/callback',
    'https://evil.example/callback',
    'http://127.0.0.1:9000/changed',
  ]) {
    const ui = await page({ redirect });
    await ui.click('approve');
    assert.equal(ui.assigned.length, 0);
  }
});

test('a previous grant resumes only through the server response and never calls approval', async () => {
  const ui = await page({
    details: {
      redirect_url: 'http://localhost:9000/callback?code=existing-grant',
    },
  });
  assert.equal(ui.count('approve'), 0);
  assert.equal(
    ui.assigned[0],
    'http://localhost:9000/callback?code=existing-grant',
  );
  const unsafe = await page({
    details: { redirect_url: 'javascript:alert(1)' },
  });
  assert.equal(unsafe.assigned.length, 0);
});

test('callback restores only a recent per-tab request and clears the authorization code from the URL', async () => {
  const ui = await page({
    url: `${authorizationBaseUrl}/auth/callback?code=private-code&redirect_uri=https://evil.example`,
    storage: {
      [storageKey]: JSON.stringify({ id: requestId, created_at: Date.now() }),
    },
  });
  assert.equal(ui.count('exchange'), 1);
  assert.equal(
    ui.replaced[0],
    `${authorizationBasePath}/oauth/consent?authorization_id=${requestId}`,
  );
  assert.equal(ui.assigned.length, 0);
  assert.equal(ui.elements.get('consent').hidden, false);
  for (const saved of [
    null,
    '{bad-json',
    JSON.stringify({ id: requestId, created_at: Date.now() - 11 * 60 * 1000 }),
  ]) {
    const expired = await page({
      url: `${authorizationBaseUrl}/auth/callback?code=private-code`,
      storage: saved === null ? {} : { [storageKey]: saved },
    });
    assert.equal(expired.count('exchange'), 0);
    assert.equal(expired.replaced[0], `${authorizationBasePath}/`);
  }
});

test('expired authorization details do not reveal upstream messages or show an approval action', async () => {
  const ui = await page({
    detailsError: { message: 'Private upstream detail' },
  });
  assert.equal(ui.elements.get('consent').hidden, true);
  assert.match(ui.text('message'), /expired/);
  assert.doesNotMatch(ui.text('message'), /Private upstream detail/);
});

test('Google denial scrubs the callback URL without exchanging or authorizing anything', async () => {
  const ui = await page({
    url: `${authorizationBaseUrl}/auth/callback?error=access_denied&error_description=private-detail&code=ignored-code`,
    storage: {
      [storageKey]: JSON.stringify({ id: requestId, created_at: Date.now() }),
    },
  });
  assert.equal(ui.count('exchange'), 0);
  assert.equal(ui.count('details'), 0);
  assert.equal(ui.count('approve'), 0);
  assert.equal(
    ui.replaced[0],
    `${authorizationBasePath}/oauth/consent?authorization_id=${requestId}`,
  );
  assert.equal(ui.elements.get('sign-in').hidden, false);
  assert.match(ui.text('message'), /Google sign-in was not completed/);
  assert.doesNotMatch(ui.text('message'), /private-detail/);
});

test('details for a different authorization or user cannot produce an approval action', async () => {
  for (const patch of [
    { authorization_id: 'mismatched-request-id' },
    { user: { id: 'another-user' } },
  ]) {
    const ui = await page({
      details: {
        authorization_id: requestId,
        redirect_uri: 'http://127.0.0.1:9000/callback',
        client: { id: 'local-test-client', name: 'Test client' },
        user: { id: 'user-1' },
        scope: 'openid email profile',
        ...patch,
      },
    });
    assert.equal(ui.elements.get('consent').hidden, true);
    await ui.click('approve');
    assert.equal(ui.count('approve'), 0);
    assert.equal(ui.assigned.length, 0);
  }
});
