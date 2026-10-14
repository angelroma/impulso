import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const workspaceRoot = fileURLToPath(new URL('../../../', import.meta.url));

export function runLocalCli(args, options = {}) {
  const npmCli = join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npx-cli.js');
  return spawnSync(
    process.platform === 'win32' ? process.execPath : 'npx',
    process.platform === 'win32' ? [npmCli, 'supabase@2.120.0', ...args] : ['supabase@2.120.0', ...args],
    { cwd: workspaceRoot, windowsHide: true, ...options },
  );
}

export function localStatus() {
  const status = runLocalCli(['status', '--workdir', 'apps', '--output', 'json'], { encoding: 'utf8' });
  if (status.status !== 0) throw new Error('Start the local Impulso stack first.');
  const local = JSON.parse(status.stdout);
  const api = new URL(local.API_URL);
  if (api.protocol !== 'http:' || api.hostname !== '127.0.0.1' || api.port !== '54321') {
    throw new Error('This helper is restricted to the local Impulso stack.');
  }
  return local;
}
