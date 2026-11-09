import type { ManageProjectInput } from "../finance_contracts.ts";
import {
  type Action,
  definedFields,
  notFound,
  projectProgress,
  required,
  resolveWorkspace,
  type Sql,
  type Workspace,
} from "./common.ts";

export function manageProject(sql: Sql, userId: string, input: ManageProjectInput) {
  return PROJECT_ACTIONS[input.action](sql, userId, input);
}

const createProject: Action<ManageProjectInput> = async (sql, userId, input) => {
  const workspace = await resolveWorkspace(sql, userId, input.workspace_id);
  if (!input.name) throw required("name", "create a project");
  const [project] = await sql<{ id: string }[]>`
    INSERT INTO app.projects (workspace_id, name, budget, start_date, end_date, notes)
    VALUES (${workspace.id}, ${input.name}, ${input.budget ?? null}, ${input.start_date ?? null},
      ${input.end_date ?? null}, ${input.notes ?? null})
    RETURNING id`;
  return { status: "created", project: await oneProject(sql, workspace, project.id) };
};

const updateProject: Action<ManageProjectInput> = async (sql, userId, input) => {
  const { workspace, projectId } = await ownedProject(sql, userId, input);
  const changes = definedFields({
    name: input.name,
    budget: input.budget,
    start_date: input.start_date,
    end_date: input.end_date,
    notes: input.notes,
  });
  await sql`UPDATE app.projects SET ${sql(changes)}, updated_at = now() WHERE id = ${projectId}`;
  return { status: "updated", project: await oneProject(sql, workspace, projectId) };
};

/** Close and reopen differ only in the status they set. */
function setStatus(status: "active" | "closed", result: string): Action<ManageProjectInput> {
  return async (sql, userId, input) => {
    const { workspace, projectId } = await ownedProject(sql, userId, input);
    await sql`
      UPDATE app.projects SET status = ${status}, updated_at = now() WHERE id = ${projectId}`;
    return { status: result, project: await oneProject(sql, workspace, projectId) };
  };
}

const PROJECT_ACTIONS: Record<ManageProjectInput["action"], Action<ManageProjectInput>> = {
  create: createProject,
  update: updateProject,
  close: setStatus("closed", "closed"),
  reopen: setStatus("active", "reopened"),
};

/** The project named by the input, locked, with its (active) workspace. */
async function ownedProject(sql: Sql, userId: string, input: ManageProjectInput) {
  if (!input.project_id) throw required("project_id", `${input.action} a project`);
  const [owned] = await sql<{ workspace_id: string }[]>`
    SELECT pr.workspace_id FROM app.projects pr
    JOIN app.workspaces w ON w.id = pr.workspace_id AND w.owner_user_id = ${userId}
      AND w.archived_at IS NULL
    WHERE pr.id = ${input.project_id} FOR UPDATE OF pr`;
  if (!owned) throw notFound("The project");
  const workspace = await resolveWorkspace(sql, userId, owned.workspace_id);
  return { workspace, projectId: input.project_id };
}

async function oneProject(sql: Sql, workspace: Workspace, projectId: string) {
  const rows = await projectProgress(sql, workspace.id, workspace.currency, false);
  return rows.find((row) => row.id === projectId);
}
