import { isUuid, type VerifiedIdentity } from "./auth.ts";
import { type Database, type Transaction, withIdentityTransaction } from "./database.ts";
import { ApiError } from "./http.ts";

export interface OnboardingInput {
  readonly request_id: string;
  readonly display_name: string;
  readonly workspace_name: string;
  readonly timezone: string;
}

export interface OnboardingResult {
  readonly workspace_id: string;
  readonly person_id: string;
  readonly status: "created" | "already_processed";
}

interface Receipt {
  actor_user_id: string;
  workspace_id: string | null;
  operation: string;
  payload_hash: string | null;
  resource_ids: string[];
  status: "completed" | "purged";
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new ApiError(400, "invalid_input", `${field} must be a nonempty string.`);
  }
  const normalized = value.trim();
  if (
    normalized.length === 0 || Array.from(normalized).length > 200 ||
    normalized.includes("\0") || !normalized.isWellFormed()
  ) {
    throw new ApiError(400, "invalid_input", `${field} must contain between 1 and 200 characters.`);
  }
  return normalized;
}

export function validateOnboardingInput(body: Record<string, unknown>): OnboardingInput {
  if (!isUuid(body.request_id)) {
    throw new ApiError(400, "invalid_request_id", "A valid request identifier is required.");
  }
  const displayName = requiredText(body.display_name, "display_name");
  const workspaceName = requiredText(body.workspace_name, "workspace_name");
  const timezone = requiredText(body.timezone, "timezone");
  if (/^[+-]/.test(timezone)) {
    throw new ApiError(400, "invalid_timezone", "A valid IANA time zone is required.");
  }
  let normalizedTimezone: string;
  try {
    normalizedTimezone = new Intl.DateTimeFormat("en", { timeZone: timezone })
      .resolvedOptions().timeZone;
  } catch {
    throw new ApiError(400, "invalid_timezone", "A valid IANA time zone is required.");
  }
  return {
    request_id: body.request_id.toLowerCase(),
    display_name: displayName,
    workspace_name: workspaceName,
    timezone: normalizedTimezone,
  };
}

async function payloadHash(input: OnboardingInput): Promise<string> {
  const payload = JSON.stringify({
    display_name: input.display_name,
    workspace_name: input.workspace_name,
    timezone: input.timezone,
  });
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function accessDenied(): ApiError {
  return new ApiError(403, "workspace_access_denied", "Access to the initial workspace is denied.");
}

function actionRetired(): ApiError {
  return new ApiError(409, "action_retired", "This action has been retired.");
}

async function currentPerson(
  sql: Transaction,
  identity: VerifiedIdentity,
  workspace: { id: string; archived_at: Date | null },
): Promise<string> {
  const [member] = await sql`
    SELECT user_id FROM core.workspace_members
    WHERE workspace_id = ${workspace.id} AND user_id = ${identity.user_id} AND status = 'active'
    FOR SHARE
  `;
  const [link] = await sql<{ person_id: string }[]>`
    SELECT person_id FROM core.person_user_links
    WHERE workspace_id = ${workspace.id} AND user_id = ${identity.user_id}
    FOR SHARE
  `;
  if (!member || !link) throw accessDenied();
  const [person] = await sql<{ archived_at: Date | null }[]>`
    SELECT archived_at FROM core.people
    WHERE workspace_id = ${workspace.id} AND id = ${link.person_id}
    FOR SHARE
  `;
  const [grant] = await sql`
    SELECT user_id FROM core.person_access
    WHERE workspace_id = ${workspace.id} AND person_id = ${link.person_id}
      AND user_id = ${identity.user_id} AND revoked_at IS NULL
    FOR SHARE
  `;
  if (!person || !grant) throw accessDenied();
  if (workspace.archived_at !== null) {
    throw new ApiError(409, "workspace_archived", "The initial workspace is archived.");
  }
  if (person.archived_at !== null) {
    throw new ApiError(409, "person_archived", "The linked person is archived.");
  }
  const [purge] = await sql<{ state: string }[]>`
    SELECT state FROM private.purge_requests
    WHERE workspace_id = ${workspace.id}
      AND (scope = 'workspace' OR (scope = 'person' AND person_id = ${link.person_id}))
      AND (state IN ('approved', 'deleting_files', 'deleting_rows', 'completed')
        OR (state = 'failed' AND confirmed_at IS NOT NULL))
    LIMIT 1
  `;
  if (purge?.state === "completed") throw actionRetired();
  if (purge) {
    throw new ApiError(409, "scope_purge_pending", "A purge is in progress for this scope.");
  }
  return link.person_id;
}

async function writeReceipt(
  sql: Transaction,
  identity: VerifiedIdentity,
  input: OnboardingInput,
  hash: string,
  workspaceId: string,
  personId: string,
): Promise<void> {
  await sql`
    INSERT INTO private.operation_receipts
      (request_id, actor_user_id, workspace_id, operation, payload_hash, resource_ids, status)
    VALUES (${input.request_id}, ${identity.user_id}, ${workspaceId}, 'onboard',
      pg_catalog.decode(${hash}, 'hex'), ${sql.array([workspaceId, personId], 2950)}, 'completed')
  `;
}

export async function onboard(
  database: Database,
  identity: VerifiedIdentity,
  input: OnboardingInput,
): Promise<OnboardingResult> {
  const hash = await payloadHash(input);
  return await withIdentityTransaction(database, identity, async (sql) => {
    const [receipt] = await sql<Receipt[]>`
      SELECT actor_user_id, workspace_id, operation,
        pg_catalog.encode(payload_hash, 'hex') AS payload_hash, resource_ids, status
      FROM private.operation_receipts WHERE request_id = ${input.request_id}
    `;
    if (receipt) {
      if (receipt.actor_user_id !== identity.user_id || receipt.operation !== "onboard") {
        throw new ApiError(409, "request_conflict", "This request identifier cannot be reused.");
      }
      if (receipt.status === "purged") throw actionRetired();
      if (receipt.payload_hash !== hash) {
        throw new ApiError(409, "request_conflict", "This request identifier cannot be reused.");
      }
    }
    const [account] = await sql`
      SELECT id FROM private.auth_users WHERE id = ${identity.user_id} FOR UPDATE
    `;
    if (!account) {
      throw new ApiError(401, "invalid_session", "A valid signed-in user session is required.");
    }
    const [timezone] = await sql`
      SELECT name FROM pg_catalog.pg_timezone_names WHERE name = ${input.timezone}
    `;
    if (!timezone) {
      throw new ApiError(400, "invalid_timezone", "A valid IANA time zone is required.");
    }
    const [workspace] = await sql<{ id: string; archived_at: Date | null }[]>`
      SELECT id, archived_at FROM core.workspaces
      WHERE created_by_user_id = ${identity.user_id}
      FOR UPDATE
    `;
    if (workspace) {
      const personId = await currentPerson(sql, identity, workspace);
      if (receipt) {
        if (
          receipt.workspace_id !== workspace.id || receipt.resource_ids.length !== 2 ||
          receipt.resource_ids[0] !== workspace.id || receipt.resource_ids[1] !== personId
        ) throw accessDenied();
      } else {
        await writeReceipt(sql, identity, input, hash, workspace.id, personId);
      }
      return { workspace_id: workspace.id, person_id: personId, status: "already_processed" };
    }
    if (receipt) throw accessDenied();
    const [previous] = await sql<{ status: "completed" | "purged" }[]>`
      SELECT status FROM private.operation_receipts
      WHERE actor_user_id = ${identity.user_id} AND operation = 'onboard'
      ORDER BY completed_at DESC LIMIT 1
    `;
    if (previous) {
      if (previous.status === "purged") throw actionRetired();
      throw accessDenied();
    }
    const workspaceId = crypto.randomUUID();
    const personId = crypto.randomUUID();
    await sql`
      INSERT INTO core.workspaces (id, name, timezone, created_by_user_id, updated_by_user_id)
      VALUES (${workspaceId}, ${input.workspace_name}, ${input.timezone},
        ${identity.user_id}, ${identity.user_id})
    `;
    await sql`
      INSERT INTO core.workspace_members (workspace_id, user_id, role, status, accepted_at)
      VALUES (${workspaceId}, ${identity.user_id}, 'owner', 'active', now())
    `;
    await sql`
      INSERT INTO core.people
        (id, workspace_id, display_name, created_by_user_id, updated_by_user_id)
      VALUES (${personId}, ${workspaceId}, ${input.display_name}, ${identity.user_id}, ${identity.user_id})
    `;
    await sql`
      INSERT INTO core.person_user_links (workspace_id, person_id, user_id, verification_method)
      VALUES (${workspaceId}, ${personId}, ${identity.user_id}, 'self_registration')
    `;
    await sql`
      INSERT INTO core.person_access (workspace_id, person_id, user_id, role, granted_by_user_id)
      VALUES (${workspaceId}, ${personId}, ${identity.user_id}, 'owner', ${identity.user_id})
    `;
    await sql`
      INSERT INTO core.person_aliases (workspace_id, user_id, person_id, alias)
      VALUES (${workspaceId}, ${identity.user_id}, ${personId}, 'me')
    `;
    await sql`
      INSERT INTO audit.events
        (request_id, actor_user_id, workspace_id, module, resource_type, resource_id,
          action, outcome, changed_fields)
      VALUES (${input.request_id}, ${identity.user_id}, ${workspaceId}, 'core', 'workspace',
        ${workspaceId}, 'create', 'success', ${sql.array(["name", "timezone"])})
    `;
    await writeReceipt(sql, identity, input, hash, workspaceId, personId);
    return { workspace_id: workspaceId, person_id: personId, status: "created" };
  }, input.request_id);
}
