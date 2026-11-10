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
  transactionsUsing,
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
  const kind = input.kind ?? category.kind;
  const kindChanged = kind !== category.kind;
  const used = await transactionsUsing(sql, "category_id", category.id);
  if (kindChanged) {
    // Transactions and subcategories are tied to the kind, so it changes only while unused.
    if (used > 0) {
      throw fail(
        409,
        "category_in_use",
        `${used} transaction(s) use this category, so its kind cannot change.`,
      );
    }
    const [child] = await sql`
      SELECT 1 FROM finance.categories WHERE parent_id = ${category.id} LIMIT 1`;
    if (child) {
      throw fail(409, "has_subcategories", "A category with subcategories cannot change kind.");
    }
  }
  if (input.parent_id) {
    if (input.parent_id === category.id) {
      throw fail(400, "same_category", "A category cannot be its own parent.");
    }
    const parent = await parentCategory(sql, category.workspace_id, input.parent_id);
    if (parent.kind !== kind) throw kindMismatch(parent.kind);
    if (await hasSubcategories(sql, category.id)) {
      throw fail(409, "has_subcategories", "A category with subcategories must stay top-level.");
    }
  } else if (kindChanged && input.parent_id === undefined && category.parent_id) {
    // It would keep a parent of the old kind.
    throw kindMismatch(category.kind);
  }
  const changes = definedFields({
    name: input.name,
    kind: input.kind,
    parent_id: input.parent_id,
  });
  await sql`
    UPDATE finance.categories SET ${sql(changes)}, updated_at = now() WHERE id = ${category.id}`;
  const renamed = input.name !== undefined && input.name !== category.name;
  return {
    status: "updated",
    category: await loadCategory(sql, category.id),
    ...(renamed ? { transactions_using: used } : {}),
  };
};

const archiveCategory: Action<ManageCategoryInput> = async (sql, userId, input) => {
  const category = await ownedCategory(sql, userId, input);
  if (await hasSubcategories(sql, category.id)) {
    throw fail(409, "has_subcategories", "Archive or move its subcategories first.");
  }
  await sql`
    UPDATE finance.categories SET archived_at = now(), updated_at = now() WHERE id = ${category.id}`;
  return {
    status: "archived",
    category: { id: category.id, name: category.name },
    transactions_using: await transactionsUsing(sql, "category_id", category.id),
  };
};

/** Brings an archived category back. Archived ones are not listed, so a name finds it too. */
const restoreCategory: Action<ManageCategoryInput> = async (sql, userId, input) => {
  if (!input.category_id && !input.name) {
    throw required("category_id or name", "restore a category");
  }
  const workspace = input.category_id
    ? null
    : await resolveWorkspace(sql, userId, input.workspace_id);
  const match = input.category_id
    ? sql`c.id = ${input.category_id}`
    : sql`c.workspace_id = ${workspace!.id} AND lower(c.name) = lower(${input.name!})
        AND c.archived_at IS NOT NULL ${input.kind ? sql`AND c.kind = ${input.kind}` : sql``}`;
  const [found] = await sql<
    {
      id: string;
      name: string;
      kind: string;
      workspace_id: string;
      parent_id: string | null;
      archived_at: Date | null;
    }[]
  >`
    SELECT c.id, c.name, c.kind, c.workspace_id, c.parent_id, c.archived_at
    FROM finance.categories c
    JOIN finance.workspaces w ON w.id = c.workspace_id AND w.owner_user_id = ${userId}
      AND w.archived_at IS NULL
    WHERE ${match} ORDER BY c.archived_at DESC LIMIT 1 FOR UPDATE OF c`;
  if (!found) throw notFound("The archived category");
  if (found.archived_at) {
    const [taken] = await sql`
      SELECT 1 FROM finance.categories
      WHERE workspace_id = ${found.workspace_id} AND kind = ${found.kind}
        AND lower(name) = lower(${found.name}) AND archived_at IS NULL`;
    if (taken) {
      throw fail(
        409,
        "name_taken",
        `An active ${found.kind} category uses that name. Rename it before restoring this one.`,
      );
    }
    if (found.parent_id) {
      const [parent] = await sql<{ name: string; archived_at: Date | null }[]>`
        SELECT name, archived_at FROM finance.categories WHERE id = ${found.parent_id} FOR UPDATE`;
      if (parent.archived_at) {
        throw fail(409, "parent_archived", `Restore its parent category ${parent.name} first.`);
      }
    }
    await sql`
      UPDATE finance.categories SET archived_at = NULL, updated_at = now() WHERE id = ${found.id}`;
  }
  return {
    status: found.archived_at ? "restored" : "already_active",
    category: await loadCategory(sql, found.id),
  };
};

const CATEGORY_ACTIONS: Record<ManageCategoryInput["action"], Action<ManageCategoryInput>> = {
  create: createCategory,
  update: updateCategory,
  archive: archiveCategory,
  restore: restoreCategory,
};

/** An active category in one of the caller's active workspaces, locked for the change. */
async function ownedCategory(sql: Sql, userId: string, input: ManageCategoryInput) {
  if (!input.category_id) throw required("category_id", `${input.action} a category`);
  const [category] = await sql<
    { id: string; name: string; kind: string; workspace_id: string; parent_id: string | null }[]
  >`
    SELECT c.id, c.name, c.kind, c.workspace_id, c.parent_id FROM finance.categories c
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
  const renamed = input.name !== undefined && input.name !== payee.name;
  return {
    status: "updated",
    payee: compact(updated),
    ...(renamed ? { transactions_using: await transactionsUsing(sql, "payee_id", payee.id) } : {}),
  };
};

const archivePayee: Action<ManagePayeeInput> = async (sql, userId, input) => {
  const payee = await ownedPayee(sql, userId, input);
  await sql`UPDATE finance.payees SET archived_at = now(), updated_at = now() WHERE id = ${payee.id}`;
  return {
    status: "archived",
    payee: { id: payee.id, name: payee.name },
    transactions_using: await transactionsUsing(sql, "payee_id", payee.id),
  };
};

/** Brings an archived payee back. Archived ones are not listed, so a name finds it too. */
const restorePayee: Action<ManagePayeeInput> = async (sql, userId, input) => {
  if (!input.payee_id && !input.name) throw required("payee_id or name", "restore a payee");
  const workspace = input.payee_id ? null : await resolveWorkspace(sql, userId, input.workspace_id);
  const match = input.payee_id
    ? sql`p.id = ${input.payee_id}`
    : sql`p.workspace_id = ${workspace!.id} AND lower(p.name) = lower(${input.name!})
        AND p.archived_at IS NOT NULL`;
  const [found] = await sql<
    { id: string; name: string; workspace_id: string; archived_at: Date | null }[]
  >`
    SELECT p.id, p.name, p.workspace_id, p.archived_at FROM finance.payees p
    JOIN finance.workspaces w ON w.id = p.workspace_id AND w.owner_user_id = ${userId}
      AND w.archived_at IS NULL
    WHERE ${match} ORDER BY p.archived_at DESC LIMIT 1 FOR UPDATE OF p`;
  if (!found) throw notFound("The archived payee");
  if (found.archived_at) {
    const [taken] = await sql`
      SELECT 1 FROM finance.payees
      WHERE workspace_id = ${found.workspace_id} AND lower(name) = lower(${found.name})
        AND archived_at IS NULL`;
    if (taken) {
      throw fail(
        409,
        "name_taken",
        "An active payee uses that name. Merge or rename it before restoring this one.",
      );
    }
    await sql`
      UPDATE finance.payees SET archived_at = NULL, updated_at = now() WHERE id = ${found.id}`;
  }
  const [payee] = await sql<Row[]>`
    SELECT id, name, default_category_id FROM finance.payees WHERE id = ${found.id}`;
  return { status: found.archived_at ? "restored" : "already_active", payee: compact(payee) };
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
  restore: restorePayee,
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
