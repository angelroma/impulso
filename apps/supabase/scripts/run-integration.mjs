// Runs the Deno integration tests against the running local stack, passing its URLs and keys
// through the environment so nothing is printed or saved. Set IMPULSO_INTEGRATION_FILTER to
// run only matching tests.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { localStatus, workspaceRoot } from "./supabase-cli.mjs";

const local = localStatus();

const envFile = readFileSync(new URL("../functions/.env.local", import.meta.url), "utf8");
const setting = envFile.split(/\r?\n/).find((line) => line.startsWith("IMPULSO_DATABASE_URL="));
if (!setting) {
  throw new Error("Configure the backend role first: npx nx run supabase:configure-backend");
}
const backend = new URL(setting.slice("IMPULSO_DATABASE_URL=".length));
if (backend.username !== "impulso_backend") {
  throw new Error("IMPULSO_DATABASE_URL must use the impulso_backend role.");
}
// Same credentials, but reached from the host instead of from inside Docker.
const testDatabase = new URL(local.DB_URL);
testDatabase.username = backend.username;
testDatabase.password = backend.password;

const filter = process.env.IMPULSO_INTEGRATION_FILTER;
const deno = fileURLToPath(new URL("../../../node_modules/deno/bin.cjs", import.meta.url));
const child = spawnSync(
  process.execPath,
  [
    deno,
    "test",
    "--config",
    "apps/supabase/functions/impulso-api/deno.json",
    "--allow-env",
    "--allow-net=127.0.0.1:54321,127.0.0.1:54322,localhost:54321,localhost:54322",
    ...(filter ? ["--filter", filter] : []),
    "apps/supabase/functions/tests",
  ],
  {
    cwd: workspaceRoot,
    stdio: "inherit",
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
