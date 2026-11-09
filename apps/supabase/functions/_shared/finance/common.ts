// Shared types, errors and lookups for the Finance tools. Every helper runs inside the caller's
// identity-checked transaction; none of them decides ownership on its own.
import type { Transaction } from "../database.ts";
import { ApiError } from "../http.ts";

export type Sql = Transaction;
export type Row = Record<string, unknown>;

/**
 * One action of a tool (create, update, archive...). Each tool maps its `action` field to one of
 * these, so every action is a short function of its own instead of a branch in a long one.
 */
export type Action<Input> = (sql: Sql, userId: string, input: Input) => Promise<Row>;

export interface Workspace {
  id: string;
  name: string;
  currency: string;
  timezone: string;
  is_default: boolean;
}

export interface Account {
  id: string;
  workspace_id: string;
  name: string;
  kind: string;
  currency: string;
  archived_at: Date | null;
}

export const fail = (status: number, code: string, message: string) =>
  new ApiError(status, code, message);
export const notFound = (thing: string) => fail(404, "not_found", `${thing} was not found.`);
export const required = (field: string, action: string) =>
  fail(400, "missing_field", `${field} is required to ${action}.`);

/** Maps PostgreSQL errors that users can cause into short, safe messages. */
export function translateDatabaseError(error: unknown): unknown {
  if (error instanceof ApiError) return error;
  const code = error !== null && typeof error === "object" && "code" in error
    ? String(error.code)
    : "";
  if (code === "23505") return fail(409, "name_taken", "That name is already used here.");
  if (code === "23503") {
    return fail(409, "invalid_reference", "The change would break a link between records.");
  }
  if (code === "23514") return fail(400, "invalid_value", "A value is outside the allowed range.");
  if (code === "22007" || code === "22008") return fail(400, "invalid_date", "A date is invalid.");
  if (code === "22003") return fail(400, "amount_too_large", "An amount is too large.");
  return error;
}

/** Drops null fields so tool results stay short. */
export function compact(row: Row): Row {
  return Object.fromEntries(Object.entries(row).filter(([, value]) => value !== null));
}

/** Keeps only provided fields for an UPDATE; refuses an empty change. */
export function definedFields(values: Record<string, unknown>): Record<string, unknown> {
  const changes = Object.fromEntries(
    Object.entries(values).filter(([, value]) => value !== undefined),
  );
  if (Object.keys(changes).length === 0) {
    throw fail(400, "nothing_to_change", "Provide at least one field to change.");
  }
  return changes;
}

/** The caller's active workspace by id, or their default workspace when no id is given. */
export async function resolveWorkspace(
  sql: Sql,
  userId: string,
  workspaceId: string | undefined,
  lock = false,
): Promise<Workspace> {
  const locking = lock ? sql`FOR UPDATE` : sql``;
  const [workspace] = workspaceId
    ? await sql<Workspace[]>`
      SELECT id, name, currency, timezone, is_default FROM finance.workspaces
      WHERE id = ${workspaceId} AND owner_user_id = ${userId} AND archived_at IS NULL ${locking}`
    : await sql<Workspace[]>`
      SELECT id, name, currency, timezone, is_default FROM finance.workspaces
      WHERE owner_user_id = ${userId} AND is_default AND archived_at IS NULL ${locking}`;
  if (workspace) return workspace;
  if (workspaceId) throw notFound("The workspace");
  throw fail(409, "setup_required", "Create a workspace first with manage_workspace.");
}

/** Today's date in the workspace time zone, as YYYY-MM-DD. */
export async function today(sql: Sql, timezone: string): Promise<string> {
  const [row] = await sql<{ today: string }[]>`
    SELECT (now() AT TIME ZONE ${timezone})::date::text AS today`;
  return row.today;
}

export async function validTimezone(sql: Sql, timezone: string): Promise<void> {
  const [zone] = await sql`SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name = ${timezone}`;
  if (!zone) {
    throw fail(400, "invalid_timezone", "Use an IANA time zone such as America/Mexico_City.");
  }
}

export async function findAccount(
  sql: Sql,
  workspaceId: string,
  accountId: string,
  lock = false,
): Promise<Account> {
  const locking = lock ? sql`FOR UPDATE` : sql``;
  const [account] = await sql<Account[]>`
    SELECT id, workspace_id, name, kind, currency, archived_at FROM finance.accounts
    WHERE id = ${accountId} AND workspace_id = ${workspaceId} ${locking}`;
  if (!account) throw notFound("The account");
  return account;
}

/** A usable account: the given one (optionally allowing archived) or the workspace default. */
export async function activeAccount(
  sql: Sql,
  workspaceId: string,
  accountId?: string,
  allowArchived = false,
): Promise<Account> {
  if (accountId) {
    const account = await findAccount(sql, workspaceId, accountId);
    if (account.archived_at && !allowArchived) {
      throw fail(409, "account_archived", "That account is archived.");
    }
    return account;
  }
  const [account] = await sql<Account[]>`
    SELECT id, workspace_id, name, kind, currency, archived_at FROM finance.accounts
    WHERE workspace_id = ${workspaceId} AND is_default AND archived_at IS NULL`;
  if (!account) {
    throw fail(
      409,
      "account_required",
      "Choose an account; this workspace has no default account.",
    );
  }
  return account;
}

export async function activeCategory(
  sql: Sql,
  workspaceId: string,
  categoryId: string,
  kind?: string,
): Promise<string> {
  const [category] = await sql<{ id: string; kind: string }[]>`
    SELECT id, kind FROM finance.categories
    WHERE id = ${categoryId} AND workspace_id = ${workspaceId} AND archived_at IS NULL`;
  if (!category) throw notFound("The category");
  if (kind && category.kind !== kind) {
    throw fail(409, "category_kind_mismatch", `That is not an ${kind} category.`);
  }
  return category.id;
}

export async function activeProject(sql: Sql, workspaceId: string, projectId: string) {
  const [project] = await sql<{ status: string }[]>`
    SELECT status FROM finance.projects WHERE id = ${projectId} AND workspace_id = ${workspaceId}`;
  if (!project) throw notFound("The project");
  if (project.status !== "active") throw fail(409, "project_closed", "That project is closed.");
  return projectId;
}

export interface Payee {
  id: string;
  default_category_id: string | null;
}

/**
 * Finds an active payee by name (case-insensitive) or creates it. ON CONFLICT keeps two
 * simultaneous requests for the same new payee from failing; both end up with one payee.
 */
export async function payeeByName(sql: Sql, workspaceId: string, name: string): Promise<Payee> {
  const [created] = await sql<Payee[]>`
    INSERT INTO finance.payees (workspace_id, name) VALUES (${workspaceId}, ${name})
    ON CONFLICT (workspace_id, lower(name)) WHERE archived_at IS NULL DO NOTHING
    RETURNING id, default_category_id`;
  if (created) return created;
  const [existing] = await sql<Payee[]>`
    SELECT id, default_category_id FROM finance.payees
    WHERE workspace_id = ${workspaceId} AND lower(name) = lower(${name}) AND archived_at IS NULL`;
  return existing;
}

/**
 * Maps a category to the same name and kind in another workspace, creating it when missing. A new
 * subcategory keeps its parent when the target's category of that name is top-level.
 */
export async function mapCategory(
  sql: Sql,
  categoryId: string | null,
  targetWorkspaceId: string,
): Promise<string | null> {
  if (!categoryId) return null;
  const [source] = await sql<{ name: string; kind: string; parent_id: string | null }[]>`
    SELECT name, kind, parent_id FROM finance.categories WHERE id = ${categoryId}`;
  const find = async () => {
    const [match] = await sql<{ id: string }[]>`
      SELECT id FROM finance.categories
      WHERE workspace_id = ${targetWorkspaceId} AND kind = ${source.kind}
        AND lower(name) = lower(${source.name}) AND archived_at IS NULL`;
    return match?.id;
  };
  const existing = await find();
  if (existing) return existing;
  const parentId = await mapCategory(sql, source.parent_id, targetWorkspaceId);
  const [parent] = parentId
    ? await sql<{ id: string }[]>`
      SELECT id FROM finance.categories WHERE id = ${parentId} AND parent_id IS NULL`
    : [];
  const [created] = await sql<{ id: string }[]>`
    INSERT INTO finance.categories (workspace_id, name, kind, parent_id)
    VALUES (${targetWorkspaceId}, ${source.name}, ${source.kind}, ${parent?.id ?? null})
    ON CONFLICT (workspace_id, kind, lower(name)) WHERE archived_at IS NULL DO NOTHING
    RETURNING id`;
  // No row back means another request created it first.
  return created?.id ?? (await find()) ?? null;
}

export async function mapPayee(sql: Sql, payeeId: string | null, targetWorkspaceId: string) {
  if (!payeeId) return null;
  const [source] = await sql<
    { name: string }[]
  >`SELECT name FROM finance.payees WHERE id = ${payeeId}`;
  return (await payeeByName(sql, targetWorkspaceId, source.name)).id;
}

/** Balance = opening balance + income - expenses - transfers out + transfers in. */
export async function accountBalances(sql: Sql, workspaceId: string, accountId?: string) {
  const only = accountId ? sql`AND a.id = ${accountId}` : sql``;
  return await sql<Row[]>`
    SELECT a.id, a.name, a.kind, a.currency, a.is_default,
      (a.opening_balance + COALESCE(SUM(
        CASE
          WHEN t.kind = 'income' AND t.account_id = a.id THEN t.amount
          WHEN t.account_id = a.id THEN -t.amount
          WHEN t.to_account_id = a.id THEN t.amount
        END), 0))::text AS balance
    FROM finance.accounts a
    LEFT JOIN finance.transactions t ON t.workspace_id = a.workspace_id AND t.deleted_at IS NULL
      AND (t.account_id = a.id OR t.to_account_id = a.id)
    WHERE a.workspace_id = ${workspaceId} AND a.archived_at IS NULL ${only}
    GROUP BY a.id
    ORDER BY a.is_default DESC, lower(a.name)`;
}

/** Spent = expenses - refunds; remaining = budget - spent. Counts accounts in `currency` only. */
export async function projectProgress(
  sql: Sql,
  workspaceId: string,
  currency: string,
  activeOnly: boolean,
) {
  const status = activeOnly ? sql`AND pr.status = 'active'` : sql``;
  const rows = await sql<Row[]>`
    SELECT pr.id, pr.name, pr.status, pr.budget::text AS budget,
      pr.start_date::text AS start_date, pr.end_date::text AS end_date,
      (COALESCE(SUM(t.amount) FILTER (WHERE t.kind = 'expense'), 0)
        - COALESCE(SUM(t.amount) FILTER (WHERE t.kind = 'income'), 0))::text AS spent,
      (pr.budget - (COALESCE(SUM(t.amount) FILTER (WHERE t.kind = 'expense'), 0)
        - COALESCE(SUM(t.amount) FILTER (WHERE t.kind = 'income'), 0)))::text AS remaining
    FROM finance.projects pr
    LEFT JOIN finance.transactions t ON t.project_id = pr.id AND t.deleted_at IS NULL
      AND EXISTS (SELECT 1 FROM finance.accounts a WHERE a.id = t.account_id AND a.currency = ${currency})
    WHERE pr.workspace_id = ${workspaceId} ${status}
    GROUP BY pr.id ORDER BY lower(pr.name)`;
  return rows.map(compact);
}

/** One transaction with names instead of ids, ready to show the user. */
export async function loadTransaction(sql: Sql, transactionId: string): Promise<Row> {
  const [row] = await sql<Row[]>`
    SELECT t.id, t.kind, t.amount::text AS amount, a.currency, t.occurred_on::text AS date,
      w.name AS workspace, a.name AS account, ta.name AS to_account, p.name AS payee,
      c.name AS category, pr.name AS project, t.notes,
      CASE WHEN t.deleted_at IS NOT NULL THEN true END AS deleted
    FROM finance.transactions t
    JOIN finance.workspaces w ON w.id = t.workspace_id
    JOIN finance.accounts a ON a.id = t.account_id
    LEFT JOIN finance.accounts ta ON ta.id = t.to_account_id
    LEFT JOIN finance.payees p ON p.id = t.payee_id
    LEFT JOIN finance.categories c ON c.id = t.category_id
    LEFT JOIN finance.projects pr ON pr.id = t.project_id
    WHERE t.id = ${transactionId}`;
  return compact(row);
}
