import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAuthorizationAssets } from './build-auth.mjs';

export function staticAuthorizationConfiguration(environment) {
  let url;
  try {
    url = new URL(environment.IMPULSO_AUTH_API_URL);
  } catch {
    throw new Error(
      'IMPULSO_AUTH_API_URL must be the HTTPS Supabase API origin.',
    );
  }
  if (
    url.protocol !== 'https:' ||
    url.pathname !== '/' ||
    url.search ||
    url.hash ||
    url.username ||
    url.password
  ) {
    throw new Error(
      'IMPULSO_AUTH_API_URL must be the HTTPS Supabase API origin.',
    );
  }
  const publicKey = environment.IMPULSO_AUTH_PUBLIC_KEY;
  if (
    typeof publicKey !== 'string' ||
    !/^sb_publishable_[A-Za-z0-9_-]+$/.test(publicKey)
  ) {
    throw new Error(
      'IMPULSO_AUTH_PUBLIC_KEY must be a Supabase publishable key.',
    );
  }
  return { api_url: url.origin, public_key: publicKey };
}

export async function buildStaticAuthorizationSite(outputRoot, environment) {
  const configuration = staticAuthorizationConfiguration(environment);
  const assets = await buildAuthorizationAssets();
  const html = assets.html
    .replaceAll('/functions/v1/impulso-auth', '')
    .replace(
      '<span class="badge">Local</span>',
      '<span class="badge">Secure</span>',
    )
    .replace('Local MCP server', 'MCP server')
    .replace(
      'http://127.0.0.1:54321/functions/v1/impulso-api/mcp',
      `${configuration.api_url}/functions/v1/impulso-api/mcp`,
    )
    .replace(
      'a compatible client running on this computer',
      'a compatible client',
    );
  const headers = [
    '/*',
    '  Cache-Control: no-store',
    '  X-Content-Type-Options: nosniff',
    '  Referrer-Policy: no-referrer',
    '  X-Frame-Options: DENY',
    `  Content-Security-Policy: default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self' ${configuration.api_url}; frame-ancestors 'none'; base-uri 'none'; form-action 'none'`,
    '',
  ].join('\n');
  const files = new Map([
    ['index.html', html],
    ['oauth/consent/index.html', html],
    ['auth/callback/index.html', html],
    ['auth.js', assets.script],
    ['styles.css', assets.styles],
    ['config.json', `${JSON.stringify(configuration, null, 2)}\n`],
    ['_headers', headers],
    [
      '_redirects',
      '/oauth/consent /index.html 200\n/auth/callback /index.html 200\n',
    ],
  ]);
  for (const [name, content] of files) {
    const destination = join(outputRoot, name);
    await mkdir(resolve(destination, '..'), { recursive: true });
    await writeFile(destination, content, 'utf8');
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const outputRoot = fileURLToPath(
    new URL('../../../dist/apps/impulso-auth/', import.meta.url),
  );
  await buildStaticAuthorizationSite(outputRoot, process.env);
  console.log(
    'Built the static Impulso authorization site in dist/apps/impulso-auth.',
  );
}
