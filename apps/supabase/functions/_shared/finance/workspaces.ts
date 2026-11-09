import type { GetContextInput, ManageWorkspaceInput } from "../finance_contracts.ts";
import {
  accountBalances,
  type Action,
  compact,
  definedFields,
  fail,
  notFound,
  projectProgress,
  required,
  resolveWorkspace,
  type Row,
  type Sql,
  today,
  validTimezone,
  type Workspace,
} from "./common.ts";

export async function getContext(sql: Sql, userId: string, input: GetContextInput): Promise<Row> {
  const workspaces = await sql<Workspace[]>`
    SELECT id, name, currency, timezone, is_default FROM app.workspaces
    WHERE owner_user_id = ${userId} AND archived_at IS NULL
    ORDER BY is_default DESC, lower(name)`;
  if (workspaces.length === 0) return { setup_required: true, workspaces: [] };
  const selected = input.workspace_id
    ? workspaces.find((workspace) => workspace.id === input.workspace_id)
    : workspaces.find((workspace) => workspace.is_default) ?? workspaces[0];
  if (!selected) throw notFound("The workspace");
  const accounts = await accountBalances(sql, selected.id);
  const categories = await sql<Row[]>`
    SELECT id, name, group_name AS "group", kind FROM app.categories
    WHERE workspace_id = ${selected.id} AND archived_at IS NULL
    ORDER BY kind, lower(coalesce(group_name, '')), lower(name)`;
  // Most-used payees first, so the likely choices come first in a short list.
  const payees = await sql<Row[]>`
    SELECT p.id, p.name, p.default_category_id FROM app.payees p
    LEFT JOIN app.transactions t ON t.payee_id = p.id AND t.deleted_at IS NULL
    WHERE p.workspace_id = ${selected.id} AND p.archived_at IS NULL
    GROUP BY p.id ORDER BY count(t.id) DESC, lower(p.name) LIMIT 100`;
  const projects = await projectProgress(sql, selected.id, selected.currency, true);
  return {
    setup_required: false,
    workspaces: workspaces.map(({ id, name, is_default }) => ({ id, name, is_default })),
    workspace: { ...selected, today: await today(sql, selected.timezone) },
    accounts,
    categories: categories.map(compact),
    payees: payees.map(compact),
    projects,
  };
}

export async function manageWorkspace(sql: Sql, userId: string, input: ManageWorkspaceInput) {
  // One user-level lock keeps the single default workspace consistent across concurrent changes.
  await sql`SELECT pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(${userId}, 1))`;
  return await WORKSPACE_ACTIONS[input.action](sql, userId, input);
}

const createWorkspace: Action<ManageWorkspaceInput> = async (sql, userId, input) => {
  if (!input.name) throw required("name", "create a workspace");
  if (!input.currency) throw required("currency", "create a workspace");
  if (!input.timezone) throw required("timezone", "create a workspace");
  await validTimezone(sql, input.timezone);
  const [{ count }] = await sql<{ count: number }[]>`
    SELECT count(*)::int AS count FROM app.workspaces
    WHERE owner_user_id = ${userId} AND archived_at IS NULL`;
  const isDefault = count === 0 || input.is_default === true;
  if (isDefault) await clearDefaultWorkspace(sql, userId);
  const [workspace] = await sql<Workspace[]>`
    INSERT INTO app.workspaces (owner_user_id, name, currency, timezone, is_default)
    VALUES (${userId}, ${input.name}, ${input.currency}, ${input.timezone}, ${isDefault})
    RETURNING id, name, currency, timezone, is_default`;
  return { status: "created", workspace };
};

const updateWorkspace: Action<ManageWorkspaceInput> = async (sql, userId, input) => {
  const workspace = await ownedWorkspace(sql, userId, input);
  if (input.is_default === false && workspace.is_default) {
    throw fail(409, "default_workspace", "Set another workspace as default instead.");
  }
  if (input.currency && input.currency !== workspace.currency) {
    // Project budgets are in the workspace currency; changing it would silently drop their spending.
    const [account] =
      await sql`SELECT 1 FROM app.accounts WHERE workspace_id = ${workspace.id} LIMIT 1`;
    if (account) {
      throw fail(
        409,
        "workspace_in_use",
        "The currency cannot change once the workspace has accounts.",
      );
    }
  }
  if (input.timezone) await validTimezone(sql, input.timezone);
  if (input.is_default === true && !workspace.is_default) await clearDefaultWorkspace(sql, userId);
  const changes = definedFields({
    name: input.name,
    currency: input.currency,
    timezone: input.timezone,
    is_default: input.is_default === true ? true : undefined,
  });
  const [updated] = await sql<Workspace[]>`
    UPDATE app.workspaces SET ${sql(changes)}, updated_at = now() WHERE id = ${workspace.id}
    RETURNING id, name, currency, timezone, is_default`;
  return { status: "updated", workspace: updated };
};

const archiveWorkspace: Action<ManageWorkspaceInput> = async (sql, userId, input) => {
  const workspace = await ownedWorkspace(sql, userId, input);
  if (workspace.is_default) {
    const [other] = await sql`
      SELECT 1 FROM app.workspaces WHERE owner_user_id = ${userId} AND archived_at IS NULL
        AND id <> ${workspace.id} LIMIT 1`;
    if (other) {
      throw fail(
        409,
        "default_workspace",
        "Set another default workspace before archiving this one.",
      );
    }
  }
  await sql`
    UPDATE app.workspaces SET archived_at = now(), is_default = false, updated_at = now()
    WHERE id = ${workspace.id}`;
  return { status: "archived", workspace: { id: workspace.id, name: workspace.name } };
};

const WORKSPACE_ACTIONS: Record<ManageWorkspaceInput["action"], Action<ManageWorkspaceInput>> = {
  create: createWorkspace,
  update: updateWorkspace,
  archive: archiveWorkspace,
};

/** The workspace named by the input, locked for the change. */
function ownedWorkspace(sql: Sql, userId: string, input: ManageWorkspaceInput) {
  if (!input.workspace_id) throw required("workspace_id", `${input.action} a workspace`);
  return resolveWorkspace(sql, userId, input.workspace_id, true);
}

async function clearDefaultWorkspace(sql: Sql, userId: string) {
  await sql`
    UPDATE app.workspaces SET is_default = false, updated_at = now()
    WHERE owner_user_id = ${userId} AND is_default`;
}
