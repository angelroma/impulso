import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const npmCli = join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npx-cli.js');
if (process.platform === 'win32' && !existsSync(npmCli)) {
  throw new Error('Use a Node.js installation that includes npm to run integration tests.');
}
const statusArguments = ['supabase@2.120.0', 'status', '--workdir', 'apps', '--output', 'json'];
const status = spawnSync(
  process.platform === 'win32' ? process.execPath : 'npx',
  process.platform === 'win32' ? [npmCli, ...statusArguments] : statusArguments,
  { cwd: root, encoding: 'utf8', windowsHide: true },
);

if (status.status !== 0) {
  throw new Error('Start the local Impulso stack before running integration tests.');
}

const local = JSON.parse(status.stdout);
const required = ['API_URL', 'DB_URL', 'ANON_KEY', 'SERVICE_ROLE_KEY'];
for (const name of required) {
  if (typeof local[name] !== 'string' || !local[name]) {
    throw new Error(`The local stack did not provide ${name}.`);
  }
}

const api = new URL(local.API_URL);
const database = new URL(local.DB_URL);
if (
  !['127.0.0.1', 'localhost'].includes(api.hostname) || api.port !== '54321' ||
  !['127.0.0.1', 'localhost'].includes(database.hostname) || database.port !== '54322'
) {
  throw new Error('Integration tests are restricted to the local Impulso stack.');
}

const runtimeEnvironment = readFileSync(new URL('../functions/.env.local', import.meta.url), 'utf8');
const databaseSetting = runtimeEnvironment.split(/\r?\n/).find((line) => line.startsWith('IMPULSO_DATABASE_URL='));
if (!databaseSetting) throw new Error('Configure the limited local backend role before integration tests.');
const runtimeDatabase = new URL(databaseSetting.slice('IMPULSO_DATABASE_URL='.length));
if (runtimeDatabase.username !== 'impulso_backend' || runtimeDatabase.hostname !== 'db') {
  throw new Error('Integration tests require the dedicated Impulso backend role.');
}
const testDatabase = new URL(local.DB_URL);
testDatabase.username = runtimeDatabase.username;
testDatabase.password = runtimeDatabase.password;

const child = spawnSync(
  process.execPath,
  [
    fileURLToPath(new URL('../../../node_modules/deno/bin.cjs', import.meta.url)),
    'test', '--config', 'apps/supabase/functions/impulso-api/deno.json',
    '--allow-env', '--allow-net=127.0.0.1:54321,127.0.0.1:54322,localhost:54321,localhost:54322',
    'apps/supabase/functions/tests',
  ],
  {
    cwd: root,
    stdio: 'inherit',
    windowsHide: true,
    env: {
      ...process.env,
      SUPABASE_URL: local.API_URL,
      SUPABASE_DB_URL: local.DB_URL,
      SUPABASE_ANON_KEY: local.ANON_KEY,
      SUPABASE_SERVICE_ROLE_KEY: local.SERVICE_ROLE_KEY,
      IMPULSO_AUTH_ISSUER: `${local.API_URL}/auth/v1`,
      IMPULSO_MCP_RESOURCE_URL: `${local.API_URL}/functions/v1/impulso-api/mcp`,
      IMPULSO_TEST_DATABASE_URL: testDatabase.href,
    },
  },
);

process.exitCode = child.status ?? 1;
