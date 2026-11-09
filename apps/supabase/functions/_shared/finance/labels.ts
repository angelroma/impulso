// Categories and payees: the labels a transaction can carry.
import type { ManageCategoryInput, ManagePayeeInput } from "../finance_contracts.ts";
import {
  type Action,
  activeCategory,
  compact,
  definedFields,
  fail,
  notFound,
  required,
  resolveWorkspace,
  type Row,
  type Sql,
} from "./common.ts";

// ---------------------------------------------------------------------------------------------
// Categories

export function manageCategory(sql: Sql, userId: string, input: ManageCategoryInput) {
  return CATEGORY_ACTIONS[input.action](sql, userId, input);
}

const createCategory: Action<ManageCategoryInput> = async (sql, userId, input) => {
  const workspace = await resolveWorkspace(sql, userId, input.workspace_id);
  if (!input.name) throw required("name", "create a category");
  if (!input.kind) throw required("kind", "create a category");
  const [category] = await sql<Row[]>`
    INSERT INTO app.categories (workspace_id, name, kind, group_name)
    VALUES (${workspace.id}, ${input.name}, ${input.kind}, ${input.group ?? null})
    RETURNING id, name, group_name AS "group", kind`;
  return { status: "created", category: compact(category) };
};

const updateCategory: Action<ManageCategoryInput> = async (sql, userId, input) => {
  const category = await ownedCategory(sql, userId, input);
  const changes = definedFields({ name: input.name, group_name: input.group });
  const [updated] = await sql<Row[]>`
    UPDATE app.categories SET ${sql(changes)}, updated_at = now() WHERE id = ${category.id}
    RETURNING id, name, group_name AS "group", kind`;
  return { status: "updated", category: compact(updated) };
};

const archiveCategory: Action<ManageCategoryInput> = async (sql, userId, input) => {
  const category = await ownedCategory(sql, userId, input);
  await sql`
    UPDATE app.categories SET archived_at = now(), updated_at = now() WHERE id = ${category.id}`;
  return { status: "archived", category };
};

const CATEGORY_ACTIONS: Record<ManageCategoryInput["action"], Action<ManageCategoryInput>> = {
  create: createCategory,
  update: updateCategory,
  archive: archiveCategory,
};

/** An active category in one of the caller's active workspaces, locked for the change. */
async function ownedCategory(sql: Sql, userId: string, input: ManageCategoryInput) {
  if (!input.category_id) throw required("category_id", `${input.action} a category`);
  const [category] = await sql<{ id: string; name: string }[]>`
    SELECT c.id, c.name FROM app.categories c
    JOIN app.workspaces w ON w.id = c.workspace_id AND w.owner_user_id = ${userId}
      AND w.archived_at IS NULL
    WHERE c.id = ${input.category_id} AND c.archived_at IS NULL FOR UPDATE OF c`;
  if (!category) throw notFound("The category");
  return category;
}

// ---------------------------------------------------------------------------------------------
// Payees

export function managePayee(sql: Sql, userId: string, input: ManagePayeeInput) {
  return PAYEE_ACTIONS[input.action](sql, userId, input);
}

const createPayee: Action<ManagePayeeInput> = async (sql, userId, input) => {
  const workspace = await resolveWorkspace(sql, userId, input.workspace_id);
  if (!input.name) throw required("name", "create a payee");
  const defaultCategory = input.default_category_id
    ? await activeCategory(sql, workspace.id, input.default_category_id)
    : null;
  const [payee] = await sql<Row[]>`
    INSERT INTO app.payees (workspace_id, name, default_category_id)
    VALUES (${workspace.id}, ${input.name}, ${defaultCategory})
    RETURNING id, name, default_category_id`;
  return { status: "created", payee: compact(payee) };
};

const updatePayee: Action<ManagePayeeInput> = async (sql, userId, input) => {
  const payee = await ownedPayee(sql, userId, input);
  const defaultCategory = input.default_category_id
    ? await activeCategory(sql, payee.workspace_id, input.default_category_id)
    : input.default_category_id;
  const changes = definedFields({ name: input.name, default_category_id: defaultCategory });
  const [updated] = await sql<Row[]>`
    UPDATE app.payees SET ${sql(changes)}, updated_at = now() WHERE id = ${payee.id}
    RETURNING id, name, default_category_id`;
  return { status: "updated", payee: compact(updated) };
};

const archivePayee: Action<ManagePayeeInput> = async (sql, userId, input) => {
  const payee = await ownedPayee(sql, userId, input);
  await sql`UPDATE app.payees SET archived_at = now(), updated_at = now() WHERE id = ${payee.id}`;
  return { status: "archived", payee: { id: payee.id, name: payee.name } };
};

/** Moves every transaction of a duplicate payee onto another one and archives the duplicate. */
const mergePayee: Action<ManagePayeeInput> = async (sql, userId, input) => {
  const payee = await ownedPayee(sql, userId, input);
  if (!input.into_payee_id) throw required("into_payee_id", "merge payees");
  if (input.into_payee_id === payee.id) {
    throw fail(400, "same_payee", "Choose a different payee to merge into.");
  }
  const [target] = await sql<{ id: string; name: string }[]>`
    SELECT id, name FROM app.payees
    WHERE id = ${input.into_payee_id} AND workspace_id = ${payee.workspace_id}
      AND archived_at IS NULL FOR UPDATE`;
  if (!target) throw notFound("The payee to merge into");
  const moved = await sql`
    UPDATE app.transactions SET payee_id = ${target.id}, updated_at = now()
    WHERE payee_id = ${payee.id} RETURNING 1`;
  // The target keeps its own default category; it inherits the merged one only if it had none.
  await sql`
    UPDATE app.payees SET default_category_id = ${payee.default_category_id}, updated_at = now()
    WHERE id = ${target.id} AND default_category_id IS NULL`;
  await sql`UPDATE app.payees SET archived_at = now(), updated_at = now() WHERE id = ${payee.id}`;
  return {
    status: "merged",
    from: payee.name,
    into: target.name,
    transactions_updated: moved.length,
  };
};

const PAYEE_ACTIONS: Record<ManagePayeeInput["action"], Action<ManagePayeeInput>> = {
  create: createPayee,
  update: updatePayee,
  archive: archivePayee,
  merge: mergePayee,
};

/** An active payee in one of the caller's active workspaces, locked for the change. */
async function ownedPayee(sql: Sql, userId: string, input: ManagePayeeInput) {
  if (!input.payee_id) throw required("payee_id", `${input.action} a payee`);
  const [payee] = await sql<
    { id: string; name: string; workspace_id: string; default_category_id: string | null }[]
  >`
    SELECT p.id, p.name, p.workspace_id, p.default_category_id FROM app.payees p
    JOIN app.workspaces w ON w.id = p.workspace_id AND w.owner_user_id = ${userId}
      AND w.archived_at IS NULL
    WHERE p.id = ${input.payee_id} AND p.archived_at IS NULL FOR UPDATE OF p`;
  if (!payee) throw notFound("The payee");
  return payee;
}
