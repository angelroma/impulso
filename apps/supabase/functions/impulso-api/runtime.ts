import { createClient } from "@supabase/supabase-js";
import { bearerUserToken, createAuthenticator } from "../_shared/auth.ts";
import { createDatabase, sessionIsActive } from "../_shared/database.ts";
import { ApiError } from "../_shared/http.ts";
import type { VerifiedIdentity } from "../_shared/auth.ts";
import { runFinanceTool } from "../_shared/finance.ts";
import type { FinanceToolName } from "../_shared/finance_contracts.ts";
import type { Database } from "../_shared/database.ts";
import type { McpConfiguration } from "./mcp.ts";

function requiredEnvironment(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new ApiError(503, "service_unavailable", "The service is not configured.");
  return value;
}

// One lazily created connection per Edge Function instance, shared by sign-in checks and tools.
let sharedDatabase: Database | undefined;
function database(): Database {
  return sharedDatabase ??= createDatabase(requiredEnvironment("IMPULSO_DATABASE_URL"));
}

export function createRuntimeAuthenticator() {
  let authenticate: ReturnType<typeof createAuthenticator> | undefined;
  return async (request: Request) => {
    if (!authenticate) {
      bearerUserToken(request);
      const client = createClient(
        requiredEnvironment("SUPABASE_URL"),
        Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? requiredEnvironment("SUPABASE_ANON_KEY"),
        { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
      );
      authenticate = createAuthenticator({
        issuer: requiredEnvironment("IMPULSO_AUTH_ISSUER"),
        getUser: async (token) => {
          const { data, error } = await client.auth.getUser(token);
          return { user: data.user, error };
        },
        hasActiveSession: (identity) => sessionIsActive(database(), identity),
      });
    }
    return await authenticate(request);
  };
}

export function createRuntimeFinance() {
  return (identity: VerifiedIdentity, name: FinanceToolName, input: unknown) =>
    runFinanceTool(database(), identity, name, input);
}

export function mcpConfiguration(): McpConfiguration {
  const resourceUrl = requiredEnvironment("IMPULSO_MCP_RESOURCE_URL");
  const authorizationServer = requiredEnvironment("IMPULSO_AUTH_ISSUER");
  for (const value of [resourceUrl, authorizationServer]) {
    const url = new URL(value);
    if (
      url.href !== value || url.username || url.password || url.search || url.hash ||
      (url.protocol !== "https:" &&
        !(url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname)))
    ) throw new Error("OAuth URLs must be canonical HTTPS URLs or local loopback HTTP URLs.");
  }
  if (!resourceUrl.endsWith("/mcp")) throw new Error("The MCP resource URL must end with /mcp.");
  return { resourceUrl, authorizationServer };
}

export function allowedBrowserOrigins(): readonly string[] {
  return (Deno.env.get("IMPULSO_ALLOWED_ORIGINS") ?? "").split(",").filter(Boolean).map((value) => {
    const origin = value.trim();
    const url = new URL(origin);
    if (
      url.origin !== origin || url.username || url.password ||
      (url.protocol !== "https:" &&
        !(url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname)))
    ) {
      throw new Error("Browser origins must be exact HTTPS origins or local loopback origins.");
    }
    return origin;
  });
}
