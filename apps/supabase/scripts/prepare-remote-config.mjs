import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export const remoteProjectRef = 'txoorpmblpvqveeudafv';

export function remoteConfiguration(environment) {
  const projectRef = environment.IMPULSO_REMOTE_PROJECT_REF ?? remoteProjectRef;
  if (projectRef !== remoteProjectRef) {
    throw new Error(
      `IMPULSO_REMOTE_PROJECT_REF must identify the existing Impulso project ${remoteProjectRef}.`,
    );
  }
  const siteUrl = environment.IMPULSO_AUTH_SITE_URL;
  let url;
  try {
    url = new URL(siteUrl);
  } catch {
    throw new Error(
      'IMPULSO_AUTH_SITE_URL must be an exact HTTPS origin without a trailing slash.',
    );
  }
  if (
    typeof siteUrl !== 'string' ||
    url.protocol !== 'https:' ||
    url.origin !== siteUrl ||
    url.hostname.includes('*')
  ) {
    throw new Error(
      'IMPULSO_AUTH_SITE_URL must be an exact HTTPS origin without a trailing slash.',
    );
  }

  return `# Generated public remote settings for the existing Impulso project.
# Google credentials are resolved by the Supabase CLI from the process environment.
[api]
schemas = ["api"]
auto_expose_new_tables = false

[auth]
site_url = ${JSON.stringify(siteUrl)}
additional_redirect_urls = [${JSON.stringify(`${siteUrl}/auth/callback`)}]

[auth.external.google]
enabled = true
client_id = "env(SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID)"
secret = "env(SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_SECRET)"
redirect_uri = "https://${projectRef}.supabase.co/auth/v1/callback"

[auth.oauth_server]
enabled = true
authorization_url_path = "/oauth/consent"
allow_dynamic_registration = true
`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const configuration = remoteConfiguration(process.env);
  const outputRoot = new URL(
    '../../../work/remote-setup/supabase/',
    import.meta.url,
  );
  await mkdir(outputRoot, { recursive: true });
  await writeFile(new URL('config.toml', outputRoot), configuration, 'utf8');
  console.log(
    `Prepared public remote configuration for ${remoteProjectRef} in work/remote-setup/supabase/config.toml.`,
  );
}
