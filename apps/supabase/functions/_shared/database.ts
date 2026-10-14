import postgres from "postgres";
import { isUuid, type VerifiedIdentity } from "./auth.ts";
import { ApiError } from "./http.ts";
import { supabaseRoot2021Ca } from "./supabase_root_ca.ts";

export type Database = postgres.Sql;
export type Transaction = postgres.TransactionSql;

export function createDatabase(connectionString: string): Database {
  const hostname = new URL(connectionString).hostname.toLowerCase();
  const localDatabase = ["localhost", "127.0.0.1", "[::1]", "db"].includes(hostname) ||
    /^supabase_db_[a-z0-9_-]+$/.test(hostname);
  // postgres.js supports max_pipeline at runtime but omits it from its option types.
  const options = {
    max: 1,
    max_pipeline: 1,
    prepare: false,
    ssl: localDatabase ? false : { ca: supabaseRoot2021Ca, rejectUnauthorized: true },
    connect_timeout: 5,
    idle_timeout: 20,
    onnotice: () => {},
  };
  return postgres(connectionString, options);
}

async function setTransactionLimits(sql: Transaction): Promise<void> {
  await sql`SET LOCAL statement_timeout = '5s'`;
  await sql`SET LOCAL lock_timeout = '3s'`;
}

export async function hasActiveSession(
  sql: Transaction,
  identity: VerifiedIdentity,
): Promise<boolean> {
  const sessions = await sql`
    SELECT id
    FROM private.auth_sessions
    WHERE id = ${identity.session_id} AND user_id = ${identity.user_id}
      AND (not_after IS NULL OR not_after > now())
    FOR SHARE
  `;
  if (sessions.length !== 1) return false;
  if (!identity.oauth_client_id) return true;
  const [authorization] = await sql<{ session_scopes: string; consent_scopes: string }[]>`
    SELECT s.scopes AS session_scopes, c.scopes AS consent_scopes
    FROM private.auth_sessions s
    JOIN private.oauth_clients client ON client.id = s.oauth_client_id AND client.deleted_at IS NULL
    JOIN private.oauth_consents c ON c.client_id = client.id AND c.user_id = s.user_id
      AND c.revoked_at IS NULL
    WHERE s.id = ${identity.session_id} AND s.user_id = ${identity.user_id}
      AND s.oauth_client_id = ${identity.oauth_client_id}
  `;
  if (!authorization || !identity.oauth_scopes?.length) return false;
  const sessionScopes = new Set(authorization.session_scopes?.split(" ").filter(Boolean));
  const consentScopes = new Set(authorization.consent_scopes?.split(" ").filter(Boolean));
  return sessionScopes.size === new Set(identity.oauth_scopes).size &&
    identity.oauth_scopes.every((scope) => sessionScopes.has(scope) && consentScopes.has(scope));
}

export function sessionIsActive(database: Database, identity: VerifiedIdentity): Promise<boolean> {
  return database.begin(async (sql) => {
    await setTransactionLimits(sql);
    return await hasActiveSession(sql, identity);
  });
}

export interface WorkspaceAccess {
  readonly workspace_id: string;
  readonly member_role: "owner" | "member";
}

export function withWorkspaceTransaction<T>(
  database: Database,
  identity: VerifiedIdentity,
  workspaceId: string,
  operation: (sql: Transaction, access: WorkspaceAccess) => Promise<T>,
): Promise<T> {
  if (!isUuid(workspaceId)) {
    throw new ApiError(400, "invalid_workspace_id", "A valid workspace identifier is required.");
  }
  return database.begin(async (sql) => {
    await setTransactionLimits(sql);
    if (!await hasActiveSession(sql, identity)) {
      throw new ApiError(401, "invalid_session", "A valid signed-in user session is required.");
    }
    const [workspace] = await sql<{ archived_at: Date | null }[]>`
      SELECT archived_at FROM core.workspaces WHERE id = ${workspaceId} FOR UPDATE
    `;
    const [membership] = await sql<{ role: "owner" | "member" }[]>`
      SELECT role FROM core.workspace_members
      WHERE workspace_id = ${workspaceId} AND user_id = ${identity.user_id} AND status = 'active'
      FOR SHARE
    `;
    if (!workspace || !membership) {
      throw new ApiError(403, "workspace_access_denied", "Access to this workspace is denied.");
    }
    if (workspace.archived_at !== null) {
      throw new ApiError(409, "workspace_archived", "This workspace is archived.");
    }
    // Membership is only the first gate; domain operations must check their own grants.
    return await operation(sql, { workspace_id: workspaceId, member_role: membership.role });
  }) as Promise<T>;
}
