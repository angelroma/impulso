import { createClient } from '@supabase/supabase-js';

const byId = (id) => document.getElementById(id);
const message = (text) => {
  byId('message').textContent = text;
};
const requestKey = 'impulso-oauth-authorization';
const requestLifetime = 10 * 60 * 1000;
const authorizationBasePath =
  document.documentElement.dataset.authorizationBasePath;
let client;
let apiUrl;
let authorizationId;
let authorizationDetails;
let deciding = false;

function validAuthorizationId(value) {
  return typeof value === 'string' && /^[a-zA-Z0-9_-]{16,128}$/.test(value);
}

function rememberAuthorization(id) {
  sessionStorage.setItem(
    requestKey,
    JSON.stringify({ id, created_at: Date.now() }),
  );
}

function restoreAuthorization() {
  let saved;
  try {
    saved = JSON.parse(sessionStorage.getItem(requestKey) ?? 'null');
  } catch {
    return null;
  }
  if (
    !validAuthorizationId(saved?.id) ||
    !Number.isFinite(saved.created_at) ||
    Date.now() - saved.created_at < 0 ||
    Date.now() - saved.created_at > requestLifetime
  )
    return null;
  return saved.id;
}

function consentPath() {
  return `${authorizationBasePath}/oauth/consent?authorization_id=${encodeURIComponent(authorizationId)}`;
}

function clearConsent() {
  authorizationDetails = undefined;
  byId('consent').hidden = true;
}

function callbackUrl(value) {
  if (typeof value !== 'string')
    throw new Error(
      'The client callback is invalid. Start again from your client.',
    );
  const url = new URL(value);
  const local = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  if (
    url.username ||
    url.password ||
    url.hash ||
    !(url.protocol === 'https:' || (url.protocol === 'http:' && local))
  ) {
    throw new Error('The client must use an HTTPS or local loopback callback.');
  }
  return url;
}

function returnToClient(result, registeredCallback) {
  // The URL comes only from Supabase Auth, never from page query parameters.
  const destination = callbackUrl(result?.redirect_url);
  if (registeredCallback) {
    const registered = callbackUrl(registeredCallback);
    if (
      destination.origin !== registered.origin ||
      destination.pathname !== registered.pathname
    ) {
      throw new Error(
        'The client callback changed. Start again from your client.',
      );
    }
  }
  sessionStorage.removeItem(requestKey);
  message('Returning to your client…');
  location.assign(destination.href);
}

async function verifiedGoogleSession() {
  const { data: sessionData, error: sessionError } =
    await client.auth.getSession();
  if (sessionError || !sessionData.session)
    throw new Error('Sign in with Google to continue.');
  const token = sessionData.session.access_token;
  const { data: userData, error: userError } = await client.auth.getUser(token);
  const { data: claimData, error: claimError } =
    await client.auth.getClaims(token);
  const user = userData?.user;
  const claims = claimData?.claims;
  // Impulso accepts only verified Google OAuth sessions.
  if (
    userError ||
    claimError ||
    !user ||
    claims?.sub !== user.id ||
    user.is_anonymous ||
    !user.email_confirmed_at ||
    !user.identities?.some((identity) => identity.provider === 'google') ||
    !Array.isArray(claims.amr) ||
    !claims.amr.some((entry) => entry.method === 'oauth')
  ) {
    throw new Error('Sign in with Google to continue.');
  }
  const response = await fetch(`${apiUrl}/functions/v1/impulso-api/session`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok)
    throw new Error(
      'Your session is no longer active. Sign in with Google again.',
    );
  const verified = await response.json();
  if (verified.user?.id !== user.id)
    throw new Error('Your session changed. Sign in with Google again.');
  return user;
}

async function loadConsent() {
  clearConsent();
  const user = await verifiedGoogleSession();
  byId('account').textContent =
    `Signed in as ${user.email ?? 'your Google account'}.`;
  byId('account').hidden = false;
  byId('sign-out').hidden = false;
  byId('sign-in').hidden = true;
  const { data, error } =
    await client.auth.oauth.getAuthorizationDetails(authorizationId);
  if (error || !data)
    throw new Error(
      'This connection request is invalid or has expired. Start again from your client.',
    );
  if (!('authorization_id' in data)) {
    // Supabase may resume an existing grant; this page never creates consent automatically.
    returnToClient(data);
    return;
  }
  if (
    data.authorization_id !== authorizationId ||
    data.user?.id !== user.id ||
    typeof data.client?.id !== 'string' ||
    typeof data.scope !== 'string'
  ) {
    throw new Error(
      'This connection request could not be verified. Start again from your client.',
    );
  }
  callbackUrl(data.redirect_uri);
  authorizationDetails = data;
  byId('client-name').textContent = data.client.name || 'Unnamed client';
  byId('client-id').textContent = data.client.id;
  byId('client-callback').textContent = data.redirect_uri;
  const descriptions = {
    openid: 'Identify your Impulso account',
    email: 'Read your email address',
    profile: 'Read your basic profile',
    offline_access: 'Keep the connection active until you revoke it',
    phone: 'Read your phone number',
  };
  const scopes = [...new Set(data.scope.split(/\s+/).filter(Boolean))];
  byId('scopes').replaceChildren(
    ...scopes.map((scope) => {
      const item = document.createElement('li');
      item.textContent = descriptions[scope]
        ? `${descriptions[scope]} (${scope})`
        : scope;
      return item;
    }),
  );
  byId('consent').hidden = false;
  byId('approve').disabled = false;
  byId('deny').disabled = false;
  message('Review this client before allowing it to connect.');
}

async function initialize() {
  const url = new URL(location.href);
  const pathname = url.pathname.replace(/\/$/, '');
  const isCallback = pathname === `${authorizationBasePath}/auth/callback`;
  if (pathname === `${authorizationBasePath}/oauth/consent`) {
    const ids = url.searchParams.getAll('authorization_id');
    if (ids.length !== 1 || !validAuthorizationId(ids[0])) {
      throw new Error(
        'Start a new connection from your MCP client. This authorization request is missing or invalid.',
      );
    }
    authorizationId = ids[0];
    rememberAuthorization(authorizationId);
  } else if (isCallback) {
    authorizationId = restoreAuthorization();
    if (!authorizationId) {
      history.replaceState(null, '', `${authorizationBasePath}/`);
      throw new Error(
        'This sign-in request has expired. Start a new connection from your MCP client.',
      );
    }
  } else {
    sessionStorage.removeItem(requestKey);
    message(
      'Add the Impulso MCP server in your client. Your client will open this page when authorization is needed.',
    );
    return;
  }
  byId('home').hidden = true;
  byId('intro').textContent =
    'Authorize your client, then continue setup and work in the conversation.';
  const response = await fetch(`${authorizationBasePath}/config.json`);
  if (!response.ok)
    throw new Error('The authorization page is not configured.');
  const config = await response.json();
  apiUrl = config.api_url;
  client = createClient(apiUrl, config.public_key, {
    auth: {
      flowType: 'pkce',
      storage: sessionStorage,
      detectSessionInUrl: false,
    },
  });
  if (isCallback) {
    history.replaceState(null, '', consentPath());
    if (url.searchParams.has('error'))
      throw new Error('Google sign-in was not completed. Please try again.');
    const codes = url.searchParams.getAll('code');
    if (codes.length !== 1 || !codes[0])
      throw new Error(
        'The sign-in callback is invalid. Start again from your client.',
      );
    const { error } = await client.auth.exchangeCodeForSession(codes[0]);
    if (error)
      throw new Error(
        'The sign-in link expired or belongs to another browser. Please try again.',
      );
  }
  const { data, error } = await client.auth.getSession();
  if (error || !data.session) {
    byId('sign-in').hidden = false;
    message('Sign in with Google to review the connection request.');
    return;
  }
  await loadConsent();
}

byId('sign-in').addEventListener('click', async () => {
  if (!client || !authorizationId) return;
  byId('sign-in').disabled = true;
  clearConsent();
  try {
    rememberAuthorization(authorizationId);
    const { error } = await client.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${location.origin}${authorizationBasePath}/auth/callback`,
        scopes: 'openid email profile',
        queryParams: { prompt: 'select_account' },
      },
    });
    if (error)
      throw new Error(
        'Google sign-in is unavailable. Check the provider configuration.',
      );
  } catch (error) {
    message(error.message);
    byId('sign-in').disabled = false;
  }
});

async function decide(approve) {
  if (deciding || !authorizationDetails) return;
  deciding = true;
  byId('approve').disabled = true;
  byId('deny').disabled = true;
  try {
    const user = await verifiedGoogleSession();
    if (user.id !== authorizationDetails.user.id)
      throw new Error('Your account changed. Start again from your client.');
    const method = approve ? 'approveAuthorization' : 'denyAuthorization';
    const { data, error } = await client.auth.oauth[method](authorizationId, {
      skipBrowserRedirect: true,
    });
    if (error || !data)
      throw new Error(
        'The connection request could not be completed. Start again from your client.',
      );
    returnToClient(data, authorizationDetails.redirect_uri);
  } catch (error) {
    clearConsent();
    byId('sign-in').hidden = false;
    message(error.message);
  } finally {
    deciding = false;
  }
}

byId('approve').addEventListener('click', () => decide(true));
byId('deny').addEventListener('click', () => decide(false));
byId('sign-out').addEventListener('click', async () => {
  byId('sign-out').disabled = true;
  clearConsent();
  const { error } = await client.auth.signOut({ scope: 'local' });
  if (error) {
    message('Sign-out failed. Please try again.');
    byId('sign-out').disabled = false;
    return;
  }
  byId('account').hidden = true;
  byId('sign-out').hidden = true;
  byId('sign-out').disabled = false;
  byId('sign-in').hidden = false;
  message('Sign in with another Google account to continue.');
});

initialize().catch((error) => {
  clearConsent();
  message(error.message);
  if (client && authorizationId) byId('sign-in').hidden = false;
});
