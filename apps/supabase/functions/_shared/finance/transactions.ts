import type { RecordTransactionInput, UpdateTransactionInput } from "../finance_contracts.ts";
import {
  type Account,
  accountBalances,
  type Action,
  activeAccount,
  activeCategory,
  activeProject,
  definedFields,
  fail,
  loadTransaction,
  mapCategory,
  mapPayee,
  notFound,
  payeeByName,
  required,
  resolveWorkspace,
  type Sql,
  today,
} from "./common.ts";

interface Links {
  account_id: string;
  to_account_id: string | null;
  payee_id: string | null;
  category_id: string | null;
  project_id: string | null;
}

interface LinkRequest {
  kind: string;
  accountId?: string;
  toAccountId?: string | null;
  /** undefined keeps the current payee, null clears it, a name finds or creates it. */
  payeeName?: string | null;
  /** undefined falls back to the payee's default category, null clears it. */
  categoryId?: string | null;
  projectId?: string | null;
}

/**
 * Validates the account, payee, category and project for one transaction. Links that an edited
 * transaction already has may stay even if the account was archived or the project closed since.
 */
async function resolveLinks(
  sql: Sql,
  workspaceId: string,
  request: LinkRequest,
  current: Partial<Links> = {},
): Promise<Links> {
  const { kind, accountId, toAccountId, payeeName, categoryId, projectId } = request;
  const account = await activeAccount(
    sql,
    workspaceId,
    accountId,
    accountId !== undefined && accountId === current.account_id,
  );
  let toAccount: Account | null = null;
  if (kind === "transfer") {
    if (!toAccountId) throw required("to_account_id", "record a transfer");
    toAccount = await activeAccount(
      sql,
      workspaceId,
      toAccountId,
      toAccountId === current.to_account_id,
    );
    if (toAccount.id === account.id) {
      throw fail(400, "same_account", "A transfer needs two different accounts.");
    }
    if (toAccount.currency !== account.currency) {
      throw fail(409, "currency_mismatch", "Transfers need two accounts in the same currency.");
    }
    if (categoryId) throw fail(400, "category_not_allowed", "Transfers do not use categories.");
  } else if (toAccountId) {
    throw fail(400, "to_account_not_allowed", "Only transfers use to_account_id.");
  }

  const payee = payeeName === undefined
    ? (current.payee_id ? { id: current.payee_id, default_category_id: null } : null)
    : payeeName === null
    ? null
    : await payeeByName(sql, workspaceId, payeeName);

  let category: string | null = null;
  if (kind !== "transfer") {
    if (categoryId) {
      category = await activeCategory(sql, workspaceId, categoryId, kind);
    } else if (categoryId === undefined && payee?.default_category_id) {
      const [fallback] = await sql<{ id: string }[]>`
        SELECT id FROM app.categories WHERE id = ${payee.default_category_id}
          AND kind = ${kind} AND archived_at IS NULL`;
      category = fallback?.id ?? null;
    }
  }

  const project = !projectId
    ? null
    : projectId === current.project_id
    ? projectId
    : await activeProject(sql, workspaceId, projectId);

  return {
    account_id: account.id,
    to_account_id: toAccount?.id ?? null,
    payee_id: payee?.id ?? null,
    category_id: category,
    project_id: project,
  };
}

export async function recordTransaction(sql: Sql, userId: string, input: RecordTransactionInput) {
  // The caller already holds the request_id lock, so a retry cannot race this check.
  const [existing] = await sql<{ id: string; owner_user_id: string }[]>`
    SELECT t.id, w.owner_user_id FROM app.transactions t
    JOIN app.workspaces w ON w.id = t.workspace_id WHERE t.request_id = ${input.request_id}`;
  if (existing) {
    if (existing.owner_user_id !== userId) {
      throw fail(409, "request_conflict", "Use a new request_id for a new transaction.");
    }
    return { status: "already_processed", transaction: await loadTransaction(sql, existing.id) };
  }
  const workspace = await resolveWorkspace(sql, userId, input.workspace_id);
  const links = await resolveLinks(sql, workspace.id, {
    kind: input.kind,
    accountId: input.account_id,
    toAccountId: input.to_account_id,
    payeeName: input.payee,
    categoryId: input.category_id,
    projectId: input.project_id,
  });
  const date = input.date ?? await today(sql, workspace.timezone);
  const [created] = await sql<{ id: string }[]>`
    INSERT INTO app.transactions (workspace_id, account_id, to_account_id, kind, amount,
      occurred_on, payee_id, category_id, project_id, notes, request_id)
    VALUES (${workspace.id}, ${links.account_id}, ${links.to_account_id}, ${input.kind},
      ${input.amount}, ${date}, ${links.payee_id}, ${links.category_id}, ${links.project_id},
      ${input.notes ?? null}, ${input.request_id})
    RETURNING id`;
  const [balance] = await accountBalances(sql, workspace.id, links.account_id);
  return {
    status: "created",
    transaction: await loadTransaction(sql, created.id),
    account_balance: balance?.balance,
  };
}

export function updateTransaction(sql: Sql, userId: string, input: UpdateTransactionInput) {
  return TRANSACTION_ACTIONS[input.action](sql, userId, input);
}

interface CurrentTransaction extends Links {
  id: string;
  workspace_id: string;
  kind: string;
  deleted_at: Date | null;
}

/** Edit: start from the current links and apply only what the caller changed. */
const editTransaction: Action<UpdateTransactionInput> = async (sql, userId, input) => {
  const current = await ownedTransaction(sql, userId, input, { notDeleted: true });
  const kind = input.kind ?? current.kind;
  const kindChanged = kind !== current.kind;
  const links = await resolveLinks(sql, current.workspace_id, {
    kind,
    accountId: input.account_id ?? current.account_id,
    toAccountId: input.to_account_id !== undefined
      ? input.to_account_id
      : kind === "transfer"
      ? current.to_account_id
      : null,
    payeeName: input.payee,
    // A category belongs to one kind, so it is cleared when the kind changes.
    categoryId: input.category_id !== undefined
      ? input.category_id
      : kindChanged || kind === "transfer"
      ? null
      : current.category_id,
    projectId: input.project_id !== undefined ? input.project_id : current.project_id,
  }, current);
  const changes = definedFields({
    kind: input.kind,
    amount: input.amount,
    occurred_on: input.date,
    notes: input.notes,
    ...links,
  });
  await sql`UPDATE app.transactions SET ${
    sql(changes)
  }, updated_at = now() WHERE id = ${current.id}`;
  return { status: "updated", transaction: await loadTransaction(sql, current.id) };
};

/** Delete and restore differ only in the deleted_at value they set. */
function setDeleted(deleted: boolean): Action<UpdateTransactionInput> {
  return async (sql, userId, input) => {
    const current = await ownedTransaction(sql, userId, input, { notDeleted: false });
    await sql`
      UPDATE app.transactions
      SET deleted_at = ${deleted ? sql`now()` : null}, updated_at = now()
      WHERE id = ${current.id}`;
    return {
      status: deleted ? "deleted" : "restored",
      transaction: await loadTransaction(sql, current.id),
    };
  };
}

/** Moves a transaction to another workspace, matching its category and payee there by name. */
const moveTransaction: Action<UpdateTransactionInput> = async (sql, userId, input) => {
  const current = await ownedTransaction(sql, userId, input, { notDeleted: true });
  if (!input.to_workspace_id) throw required("to_workspace_id", "move a transaction");
  if (input.to_workspace_id === current.workspace_id) {
    throw fail(400, "same_workspace", "The transaction is already in that workspace.");
  }
  const target = await resolveWorkspace(sql, userId, input.to_workspace_id);
  const account = await activeAccount(sql, target.id, input.account_id);
  const [source] = await sql<{ currency: string }[]>`
    SELECT currency FROM app.accounts WHERE id = ${current.account_id}`;
  if (source.currency !== account.currency) {
    throw fail(409, "currency_mismatch", "Choose an account with the same currency.");
  }
  let toAccount: string | null = null;
  if (current.kind === "transfer") {
    if (!input.to_account_id) {
      throw required(
        "to_account_id",
        "move a transfer (choose the destination in the new workspace)",
      );
    }
    const destination = await activeAccount(sql, target.id, input.to_account_id);
    if (destination.currency !== account.currency || destination.id === account.id) {
      throw fail(409, "currency_mismatch", "Choose two different accounts in the same currency.");
    }
    toAccount = destination.id;
  }
  const category = await mapCategory(sql, current.category_id, target.id);
  const payee = await mapPayee(sql, current.payee_id, target.id);
  await sql`
    UPDATE app.transactions SET workspace_id = ${target.id}, account_id = ${account.id},
      to_account_id = ${toAccount}, category_id = ${category}, payee_id = ${payee},
      project_id = NULL, updated_at = now()
    WHERE id = ${current.id}`;
  return { status: "moved", transaction: await loadTransaction(sql, current.id) };
};

const TRANSACTION_ACTIONS: Record<
  UpdateTransactionInput["action"],
  Action<UpdateTransactionInput>
> = {
  edit: editTransaction,
  delete: setDeleted(true),
  restore: setDeleted(false),
  move: moveTransaction,
};

/** The caller's transaction in an active workspace, locked for the change. */
async function ownedTransaction(
  sql: Sql,
  userId: string,
  input: UpdateTransactionInput,
  { notDeleted }: { notDeleted: boolean },
): Promise<CurrentTransaction> {
  const [current] = await sql<CurrentTransaction[]>`
    SELECT t.id, t.workspace_id, t.account_id, t.to_account_id, t.kind, t.payee_id,
      t.category_id, t.project_id, t.deleted_at
    FROM app.transactions t
    JOIN app.workspaces w ON w.id = t.workspace_id AND w.owner_user_id = ${userId}
      AND w.archived_at IS NULL
    WHERE t.id = ${input.transaction_id} FOR UPDATE OF t`;
  if (!current) throw notFound("The transaction");
  if (notDeleted && current.deleted_at) {
    throw fail(409, "transaction_deleted", "Restore the transaction before changing it.");
  }
  return current;
}
