// Gives the local impulso_backend role a fresh random password and writes its connection URL
// to functions/.env.local so `supabase functions serve` can use it.
import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import postgres from "postgres";
import { localStatus } from "./supabase-cli.mjs";

const local = localStatus();
const database = postgres(local.DB_URL, { max: 1, prepare: false, ssl: false });
try {
  const [role] = await database`SELECT 1 FROM pg_roles WHERE rolname = 'impulso_backend'`;
  if (!role) throw new Error("Run the migrations first: npx nx run supabase:migrate");
  // Generated hexadecimal, never user input; ROLE DDL cannot take bound parameters.
  const password = randomBytes(32).toString("hex");
  await database.unsafe(`ALTER ROLE impulso_backend LOGIN PASSWORD '${password}'`);

  // Edge Functions run in Docker and reach Postgres through the `db` service name.
  const backendUrl = new URL(local.DB_URL);
  backendUrl.username = "impulso_backend";
  backendUrl.password = password;
  backendUrl.hostname = "db";
  backendUrl.port = "5432";

  const envFile = new URL("../functions/.env.local", import.meta.url);
  const kept = readFileSync(envFile, "utf8").split(/\r?\n/)
    .filter((line) => line && !line.startsWith("IMPULSO_DATABASE_URL="));
  writeFileSync(envFile, [...kept, `IMPULSO_DATABASE_URL=${backendUrl.href}`, ""].join("\n"));
  console.log("Configured local backend credentials. Restart `serve` to load them.");
} catch (error) {
  // Report the reason without printing connection strings or passwords.
  const code = error?.code ? ` (${error.code})` : "";
  console.error(`Backend configuration failed${code}: ${error?.message ?? "unknown error"}`);
  process.exitCode = 1;
} finally {
  await database.end({ timeout: 5 });
}
