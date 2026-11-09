// Runs the Supabase CLI installed as a devDependency (version pinned in package.json).
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const workspaceRoot = fileURLToPath(new URL("../../../", import.meta.url));
const cli = fileURLToPath(
  new URL("../../../node_modules/supabase/dist/supabase.js", import.meta.url),
);

export function runSupabase(args, options = {}) {
  return spawnSync(process.execPath, [cli, ...args, "--workdir", "apps"], {
    cwd: workspaceRoot,
    windowsHide: true,
    ...options,
  });
}

/** Returns the running local stack's URLs and keys, refusing anything that is not local. */
export function localStatus() {
  const status = runSupabase(["status", "--output", "json"], { encoding: "utf8" });
  if (status.status !== 0) {
    throw new Error("Start the local stack first: npx nx run supabase:start");
  }
  const local = JSON.parse(status.stdout);
  const api = new URL(local.API_URL);
  const database = new URL(local.DB_URL);
  const loopback = ["127.0.0.1", "localhost"];
  if (
    !loopback.includes(api.hostname) || api.port !== "54321" ||
    !loopback.includes(database.hostname) || database.port !== "54322"
  ) {
    throw new Error("These helpers only work against the local Impulso stack.");
  }
  return local;
}
