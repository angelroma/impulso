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
  const parent = input.parent_id ? await parentCategory(sql, workspace.id, input.parent_id) : null;
  // A subcategory takes its parent's kind, so kind is only needed for a top-level category.
  const kind = input.kind ?? parent?.kind;
  if (!kind) throw required("kind", "create a category");
  if (parent && parent.kind !== kind) throw kindMismatch(parent.kind);
  const [created] = await sql<{ id: string }[]>`
    INSERT INTO finance.categories (workspace_id, name, kind, parent_id)
    VALUES (${workspace.id}, ${input.name}, ${kind}, ${parent?.id ?? null})
    RETURNING id`;
  return { status: "created", category: await loadCategory(sql, created.id) };
};

const updateCategory: Action<ManageCategoryInput> = async (sql, userId, input) => {
  const category = await ownedCategory(sql, userId, input);
  if (input.parent_id) {
    if (input.parent_id === category.id) {
      throw fail(400, "same_category", "A category cannot be its own parent.");
    }
    const parent = await parentCategory(sql, category.workspace_id, input.parent_id);
    if (parent.kind !== category.kind) throw kindMismatch(parent.kind);
    if (await hasSubcategories(sql, category.id)) {
      throw fail(409, "has_subcategories", "A category with subcategories must stay top-level.");
    }
  }
  const changes = definedFields({ name: input.name, parent_id: input.parent_id });
  await sql`
    UPDATE finance.categories SET ${sql(changes)}, updated_at = now() WHERE id = ${category.id}`;
  return { status: "updated", category: await loadCategory(sql, category.id) };
};

const archiveCategory: Action<ManageCategoryInput> = async (sql, userId, input) => {
  const category = await ownedCategory(sql, userId, input);
  if (await hasSubcategories(sql, category.id)) {
    throw fail(409, "has_subcategories", "Archive or move its subcategories first.");
  }
  await sql`
    UPDATE finance.categories SET archived_at = now(), updated_at = now() WHERE id = ${category.id}`;
  return { status: "archived", category: { id: category.id, name: category.name } };
};

const CATEGORY_ACTIONS: Record<ManageCategoryInput["action"], Action<ManageCategoryInput>> = {
  create: createCategory,
  update: updateCategory,
  archive: archiveCategory,
};

/** An active category in one of the caller's active workspaces, locked for the change. */
async function ownedCategory(sql: Sql, userId: string, input: ManageCategoryInput) {
  if (!input.category_id) throw required("category_id", `${input.action} a category`);
  const [category] = await sql<
    { id: string; name: string; kind: string; workspace_id: string }[]
  >`
    SELECT c.id, c.name, c.kind, c.workspace_id FROM finance.categories c
    JOIN finance.workspaces w ON w.id = c.workspace_id AND w.owner_user_id = ${userId}
      AND w.archived_at IS NULL
    WHERE c.id = ${input.category_id} AND c.archived_at IS NULL FOR UPDATE OF c`;
  if (!category) throw notFound("The category");
  return category;
}

/** An active top-level category to hang a subcategory on; the tree is one level deep. */
async function parentCategory(sql: Sql, workspaceId: string, parentId: string) {
  const [parent] = await sql<{ id: string; kind: string; parent_id: string | null }[]>`
    SELECT id, kind, parent_id FROM finance.categories
    WHERE id = ${parentId} AND workspace_id = ${workspaceId} AND archived_at IS NULL FOR UPDATE`;
  if (!parent) throw notFound("The parent category");
  if (parent.parent_id) {
    throw fail(409, "parent_is_subcategory", "Choose a top-level category as the parent.");
  }
  return parent;
}

async function hasSubcategories(sql: Sql, categoryId: string): Promise<boolean> {
  const [child] = await sql`
    SELECT 1 FROM finance.categories WHERE parent_id = ${categoryId} AND archived_at IS NULL LIMIT 1`;
  return Boolean(child);
}

const kindMismatch = (parentKind: string) =>
  fail(409, "category_kind_mismatch", `The parent is an ${parentKind} category.`);

async function loadCategory(sql: Sql, categoryId: string): Promise<Row> {
  const [category] = await sql<Row[]>`
    SELECT c.id, c.name, p.name AS parent, c.kind FROM finance.categories c
    LEFT JOIN finance.categories p ON p.id = c.parent_id WHERE c.id = ${categoryId}`;
  return compact(category);
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
    INSERT INTO finance.payees (workspace_id, name, default_category_id)
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
    UPDATE finance.payees SET ${sql(changes)}, updated_at = now() WHERE id = ${payee.id}
    RETURNING id, name, default_category_id`;
  return { status: "updated", payee: compact(updated) };
};

const archivePayee: Action<ManagePayeeInput> = async (sql, userId, input) => {
  const payee = await ownedPayee(sql, userId, input);
  await sql`UPDATE finance.payees SET archived_at = now(), updated_at = now() WHERE id = ${payee.id}`;
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
    SELECT id, name FROM finance.payees
    WHERE id = ${input.into_payee_id} AND workspace_id = ${payee.workspace_id}
      AND archived_at IS NULL FOR UPDATE`;
  if (!target) throw notFound("The payee to merge into");
  const moved = await sql`
    UPDATE finance.transactions SET payee_id = ${target.id}, updated_at = now()
    WHERE payee_id = ${payee.id} RETURNING 1`;
  // The target keeps its own default category; it inherits the merged one only if it had none.
  await sql`
    UPDATE finance.payees SET default_category_id = ${payee.default_category_id}, updated_at = now()
    WHERE id = ${target.id} AND default_category_id IS NULL`;
  await sql`UPDATE finance.payees SET archived_at = now(), updated_at = now() WHERE id = ${payee.id}`;
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
    SELECT p.id, p.name, p.workspace_id, p.default_category_id FROM finance.payees p
    JOIN finance.workspaces w ON w.id = p.workspace_id AND w.owner_user_id = ${userId}
      AND w.archived_at IS NULL
    WHERE p.id = ${input.payee_id} AND p.archived_at IS NULL FOR UPDATE OF p`;
  if (!payee) throw notFound("The payee");
  return payee;
}
