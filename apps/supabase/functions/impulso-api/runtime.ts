import { createClient } from "@supabase/supabase-js";
import { bearerUserToken, createAuthenticator } from "../_shared/auth.ts";
import { createDatabase, hasActiveSession, sessionIsActive } from "../_shared/database.ts";
import { ApiError } from "../_shared/http.ts";
import type { VerifiedIdentity } from "../_shared/auth.ts";
import { onboard, type OnboardingInput } from "../_shared/onboarding.ts";
import type { Database } from "../_shared/database.ts";
import type { McpConfiguration, OnboardingStatus } from "./mcp.ts";
import type { McpDependencies } from "./mcp.ts";
import { createAccount, createBook, getFinanceContext, recordExpense } from "../_shared/finance.ts";
import { runLedgerTool } from "../_shared/ledger.ts";
import { LEDGER_TOOL_SCHEMAS, type LedgerToolName } from "../_shared/ledger_contracts.ts";
import { runDomainTool } from "../_shared/planning.ts";
import { DOMAIN_TOOL_SCHEMAS, type DomainToolName } from "../_shared/planning_contracts.ts";
import { runImportTool } from "../_shared/finance_imports.ts";
import type { ImportToolName } from "../_shared/import_contracts.ts";
import { getFinanceReport } from "../_shared/reports.ts";

export function createRuntimeFinance(): Pick<
  McpDependencies,
  "getFinanceContext" | "createBook" | "createAccount" | "recordExpense" | "runExtendedFinance"
> {
  let database: Database | undefined;
  const connection = () => database ??= createDatabase(requiredEnvironment("IMPULSO_DATABASE_URL"));
  return {
    getFinanceContext: (identity, input) => getFinanceContext(connection(), identity, input),
    createBook: (identity, input) => createBook(connection(), identity, input),
    createAccount: (identity, input) => createAccount(connection(), identity, input),
    recordExpense: (identity, input) => recordExpense(connection(), identity, input),
    runExtendedFinance: (identity, name, input) => {
      if (name in LEDGER_TOOL_SCHEMAS) {
        return runLedgerTool(connection(), identity, name as LedgerToolName, input);
      }
      if (name in DOMAIN_TOOL_SCHEMAS) {
        return runDomainTool(connection(), identity, name as DomainToolName, input);
      }
      if (name === "get_finance_report") return getFinanceReport(connection(), identity, input);
      return runImportTool(connection(), identity, name as ImportToolName, input);
    },
  };
}

function requiredEnvironment(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new ApiError(503, "service_unavailable", "The service is not configured.");
  return value;
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
      const database = createDatabase(requiredEnvironment("IMPULSO_DATABASE_URL"));
      authenticate = createAuthenticator({
        issuer: requiredEnvironment("IMPULSO_AUTH_ISSUER"),
        getUser: async (token) => {
          const { data, error } = await client.auth.getUser(token);
          return { user: data.user, error };
        },
        hasActiveSession: (identity) => sessionIsActive(database, identity),
      });
    }
    return await authenticate(request);
  };
}

export function createRuntimeOnboarding() {
  let database: Database | undefined;
  return (identity: VerifiedIdentity, input: OnboardingInput) => {
    database ??= createDatabase(requiredEnvironment("IMPULSO_DATABASE_URL"));
    return onboard(database, identity, input);
  };
}

export function createRuntimeOnboardingStatus() {
  let database: Database | undefined;
  return async (identity: VerifiedIdentity): Promise<OnboardingStatus> => {
    database ??= createDatabase(requiredEnvironment("IMPULSO_DATABASE_URL"));
    return await database.begin(async (sql) => {
      await sql`SET LOCAL statement_timeout = '5s'`;
      await sql`SET LOCAL lock_timeout = '3s'`;
      if (!await hasActiveSession(sql, identity)) {
        throw new ApiError(401, "invalid_session", "A valid signed-in user session is required.");
      }
      const [workspace] = await sql<{ id: string; archived_at: Date | null }[]>`
        SELECT id, archived_at FROM core.workspaces WHERE created_by_user_id = ${identity.user_id}
      `;
      if (!workspace) {
        const previous = await sql`
          SELECT request_id FROM private.operation_receipts
          WHERE actor_user_id = ${identity.user_id} AND operation = 'onboard' LIMIT 1
        `;
        return { status: previous.length ? "unavailable" : "required" };
      }
      if (workspace.archived_at !== null) return { status: "unavailable" };
      const [person] = await sql<{ id: string }[]>`
        SELECT p.id FROM core.people p
        JOIN core.person_user_links l ON l.workspace_id = p.workspace_id AND l.person_id = p.id
          AND l.user_id = ${identity.user_id}
        JOIN core.workspace_members m ON m.workspace_id = p.workspace_id
          AND m.user_id = l.user_id AND m.status = 'active'
        JOIN core.person_access a ON a.workspace_id = p.workspace_id AND a.person_id = p.id
          AND a.user_id = l.user_id AND a.revoked_at IS NULL
        WHERE p.workspace_id = ${workspace.id} AND p.archived_at IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM private.purge_requests purge
            WHERE purge.workspace_id = p.workspace_id
              AND (purge.scope = 'workspace' OR (purge.scope = 'person' AND purge.person_id = p.id))
              AND (purge.state IN ('approved', 'deleting_files', 'deleting_rows', 'completed')
                OR (purge.state = 'failed' AND purge.confirmed_at IS NOT NULL))
          )
      `;
      return person
        ? { status: "complete", workspace_id: workspace.id, person_id: person.id }
        : { status: "unavailable" };
    }) as OnboardingStatus;
  };
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
