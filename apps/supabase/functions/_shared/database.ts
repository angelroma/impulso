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

export async function withIdentityTransaction<T>(
  database: Database,
  identity: VerifiedIdentity,
  operation: (sql: Transaction) => Promise<T>,
  requestId?: string,
): Promise<T> {
  if (requestId !== undefined && !isUuid(requestId)) {
    throw new ApiError(400, "invalid_request_id", "A valid request identifier is required.");
  }
  try {
    return await database.begin(async (sql) => {
      await setTransactionLimits(sql);
      if (!await hasActiveSession(sql, identity)) {
        throw new ApiError(401, "invalid_session", "A valid signed-in user session is required.");
      }
      // Every writer takes its request lock before account or workspace locks.
      if (requestId !== undefined) {
        await sql`
          SELECT pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(${requestId}, 0))
        `;
      }
      const result = await operation(sql);
      // Resource locks may have waited while delegated consent was revoked.
      if (!await hasActiveSession(sql, identity)) {
        throw new ApiError(401, "invalid_session", "A valid signed-in user session is required.");
      }
      return result;
    }) as T;
  } catch (error) {
    const code = error !== null && typeof error === "object" && "code" in error
      ? String(error.code)
      : "";
    if (!(error instanceof ApiError) && ["55P03", "40P01", "40001", "57014"].includes(code)) {
      throw new ApiError(
        503,
        "operation_retry_required",
        "The operation is temporarily busy. Retry with the same request identifier and unchanged values.",
      );
    }
    throw error;
  }
}
