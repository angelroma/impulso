import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import postgres from 'postgres';
import { localStatus } from './local-status.mjs';

const local = localStatus();
const databaseUrl = new URL(local.DB_URL);
if (databaseUrl.hostname !== '127.0.0.1' || databaseUrl.port !== '54322') {
  throw new Error('Backend credentials may only be configured for the local Impulso database.');
}
const database = postgres(local.DB_URL, { max: 1, prepare: false, ssl: false });
try {
  const [role] = await database`SELECT rolname FROM pg_roles WHERE rolname = 'impulso_backend'`;
  if (!role) throw new Error('Apply the backend access migrations first.');
  const password = randomBytes(32).toString('hex');
  // The password is generated hexadecimal, never caller input; ROLE DDL cannot bind parameters.
  await database.unsafe(`ALTER ROLE impulso_backend LOGIN PASSWORD '${password}'`);
  databaseUrl.username = 'impulso_backend';
  databaseUrl.password = password;
  databaseUrl.hostname = 'db';
  databaseUrl.port = '5432';
  const envPath = new URL('../functions/.env.local', import.meta.url);
  const previous = readFileSync(envPath, 'utf8');
  const next = previous.split(/\r?\n/).filter((line) => !line.startsWith('IMPULSO_DATABASE_URL=')).join('\n').trimEnd();
  writeFileSync(envPath, `${next}\nIMPULSO_DATABASE_URL=${databaseUrl.href}\n`, { mode: 0o600 });
  console.log('Local backend credentials configured. Restart function serving to load them.');
} catch {
  console.error('Local backend configuration failed. Check migrations and the local database connection.');
  process.exitCode = 1;
} finally { await database.end({ timeout: 5 }); }
