import type { ManageAccountInput } from "../finance_contracts.ts";
import {
  type Account,
  accountBalances,
  type Action,
  definedFields,
  fail,
  findAccount,
  mapCategory,
  mapPayee,
  notFound,
  required,
  resolveWorkspace,
  type Sql,
  validCurrency,
  type Workspace,
} from "./common.ts";

/** Money owed on a liability type (card, loan) is recorded as a negative balance. */
async function checkOpeningBalance(sql: Sql, type: string, openingBalance: string | undefined) {
  if (openingBalance === undefined || Number(openingBalance) <= 0) return;
  const [{ is_liability }] = await sql<{ is_liability: boolean }[]>`
    SELECT is_liability FROM finance.account_types WHERE code = ${type}`;
  if (is_liability) {
    throw fail(
      400,
      "debt_must_be_negative",
      "Use a negative opening balance for money owed on a card or loan, for example -5000.",
    );
  }
}

export function manageAccount(sql: Sql, userId: string, input: ManageAccountInput) {
  return ACCOUNT_ACTIONS[input.action](sql, userId, input);
}

const createAccount: Action<ManageAccountInput> = async (sql, userId, input) => {
  const workspace = await resolveWorkspace(sql, userId, input.workspace_id, true);
  if (!input.name) throw required("name", "create an account");
  const type = input.type ?? "checking";
  await checkOpeningBalance(sql, type, input.opening_balance);
  if (input.currency) await validCurrency(sql, input.currency);
  const [{ count }] = await sql<{ count: number }[]>`
    SELECT count(*)::int AS count FROM finance.accounts
    WHERE workspace_id = ${workspace.id} AND archived_at IS NULL`;
  const isDefault = count === 0 || input.is_default === true;
  if (isDefault) await clearDefaultAccount(sql, workspace.id);
  const [account] = await sql<{ id: string }[]>`
    INSERT INTO finance.accounts (workspace_id, name, type, currency, opening_balance, is_default)
    VALUES (${workspace.id}, ${input.name}, ${type}, ${input.currency ?? workspace.currency},
      ${input.opening_balance ?? "0"}, ${isDefault})
    RETURNING id`;
  return { status: "created", account: (await accountBalances(sql, workspace.id, account.id))[0] };
};

const updateAccount: Action<ManageAccountInput> = async (sql, userId, input) => {
  const { workspace, account } = await ownedAccount(sql, userId, input, { active: true });
  await checkOpeningBalance(sql, input.type ?? account.type, input.opening_balance);
  if (input.type && input.opening_balance === undefined) {
    const [current] = await sql<{ opening_balance: string }[]>`
      SELECT opening_balance::text AS opening_balance FROM finance.accounts WHERE id = ${account.id}`;
    await checkOpeningBalance(sql, input.type, current.opening_balance);
  }
  if (input.currency && input.currency !== account.currency) {
    await validCurrency(sql, input.currency);
    const [used] = await sql`
      SELECT 1 FROM finance.transactions
      WHERE account_id = ${account.id} OR to_account_id = ${account.id} LIMIT 1`;
    if (used) {
      throw fail(
        409,
        "account_in_use",
        "The currency cannot change once the account has transactions.",
      );
    }
  }
  if (input.is_default === false) {
    throw fail(409, "default_account", "Set another account as default instead.");
  }
  if (input.is_default === true) await clearDefaultAccount(sql, workspace.id);
  const changes = definedFields({
    name: input.name,
    type: input.type,
    currency: input.currency,
    opening_balance: input.opening_balance,
    is_default: input.is_default,
  });
  await sql`UPDATE finance.accounts SET ${
    sql(changes)
  }, updated_at = now() WHERE id = ${account.id}`;
  return { status: "updated", account: (await accountBalances(sql, workspace.id, account.id))[0] };
};

const archiveAccount: Action<ManageAccountInput> = async (sql, userId, input) => {
  const { workspace, account } = await ownedAccount(sql, userId, input, { active: false });
  const summary = { id: account.id, name: account.name };
  if (account.archived_at) return { status: "already_archived", account: summary };
  await sql`
    UPDATE finance.accounts SET archived_at = now(), is_default = false, updated_at = now()
    WHERE id = ${account.id}`;
  await ensureDefaultAccount(sql, workspace.id);
  return { status: "archived", account: summary };
};

/** Brings an archived account back; it is found by id or, failing that, by name. */
const restoreAccount: Action<ManageAccountInput> = async (sql, userId, input) => {
  if (!input.account_id && !input.name) throw required("account_id or name", "restore an account");
  let accountId = input.account_id;
  if (!accountId) {
    const workspace = await resolveWorkspace(sql, userId, input.workspace_id);
    const [archived] = await sql<{ id: string }[]>`
      SELECT id FROM finance.accounts
      WHERE workspace_id = ${workspace.id} AND lower(name) = lower(${input.name!})
        AND archived_at IS NOT NULL
      ORDER BY archived_at DESC LIMIT 1`;
    if (!archived) throw notFound("The archived account");
    accountId = archived.id;
  }
  const { workspace, account } = await ownedAccount(
    sql,
    userId,
    { ...input, account_id: accountId },
    { active: false },
  );
  if (account.archived_at) {
    const [taken] = await sql`
      SELECT 1 FROM finance.accounts
      WHERE workspace_id = ${workspace.id} AND lower(name) = lower(${account.name})
        AND archived_at IS NULL`;
    if (taken) {
      throw fail(
        409,
        "name_taken",
        "An active account uses that name. Rename it before restoring this one.",
      );
    }
    await sql`UPDATE finance.accounts SET archived_at = NULL, updated_at = now()
      WHERE id = ${account.id}`;
    // It becomes the default only when the workspace has no other active account.
    await ensureDefaultAccount(sql, workspace.id);
  }
  return {
    status: account.archived_at ? "restored" : "already_active",
    account: (await accountBalances(sql, workspace.id, account.id))[0],
  };
};

/**
 * Moves an account with all its transactions. Categories and payees are matched by name in the
 * target (created when missing) and projects are cleared, because workspaces are independent.
 */
const moveAccount: Action<ManageAccountInput> = async (sql, userId, input) => {
  const { workspace: source, account } = await ownedAccount(sql, userId, input, { active: true });
  if (!input.to_workspace_id) throw required("to_workspace_id", "move an account");
  if (input.to_workspace_id === source.id) {
    throw fail(400, "same_workspace", "The account is already in that workspace.");
  }
  const target = await resolveWorkspace(sql, userId, input.to_workspace_id, true);
  const [transfer] = await sql`
    SELECT 1 FROM finance.transactions
    WHERE (account_id = ${account.id} AND to_account_id IS NOT NULL) OR to_account_id = ${account.id}
    LIMIT 1`;
  if (transfer) {
    throw fail(
      409,
      "account_has_transfers",
      "This account has transfers with other accounts. Move or delete those transfers first.",
    );
  }
  // References are checked at the end, after the account and its rows have all moved.
  await sql`SET CONSTRAINTS ALL DEFERRED`;
  const [{ count }] = await sql<{ count: number }[]>`
    SELECT count(*)::int AS count FROM finance.accounts
    WHERE workspace_id = ${target.id} AND archived_at IS NULL`;
  await sql`
    UPDATE finance.accounts SET workspace_id = ${target.id}, is_default = ${count === 0},
      updated_at = now()
    WHERE id = ${account.id}`;
  const used = await sql<{ category_id: string | null; payee_id: string | null }[]>`
    SELECT DISTINCT category_id, payee_id FROM finance.transactions WHERE account_id = ${account.id}`;
  const categoryMap = new Map<string, string>();
  const payeeMap = new Map<string, string>();
  for (const row of used) {
    if (row.category_id && !categoryMap.has(row.category_id)) {
      categoryMap.set(row.category_id, (await mapCategory(sql, row.category_id, target.id))!);
    }
    if (row.payee_id && !payeeMap.has(row.payee_id)) {
      payeeMap.set(row.payee_id, (await mapPayee(sql, row.payee_id, target.id))!);
    }
  }
  const [moved] = await sql<{ count: number }[]>`
    WITH category_map AS (
      SELECT * FROM unnest(${sql.array([...categoryMap.keys()], 2950)}::uuid[],
        ${sql.array([...categoryMap.values()], 2950)}::uuid[]) AS m(old_id, new_id)
    ), payee_map AS (
      SELECT * FROM unnest(${sql.array([...payeeMap.keys()], 2950)}::uuid[],
        ${sql.array([...payeeMap.values()], 2950)}::uuid[]) AS m(old_id, new_id)
    ), updated AS (
      UPDATE finance.transactions t SET workspace_id = ${target.id}, project_id = NULL,
        category_id = (SELECT new_id FROM category_map WHERE old_id = t.category_id),
        payee_id = (SELECT new_id FROM payee_map WHERE old_id = t.payee_id),
        updated_at = now()
      WHERE t.account_id = ${account.id}
      RETURNING 1
    ) SELECT count(*)::int AS count FROM updated`;
  await sql`SET CONSTRAINTS ALL IMMEDIATE`;
  await ensureDefaultAccount(sql, source.id);
  return {
    status: "moved",
    account: { id: account.id, name: account.name },
    from_workspace: source.name,
    to_workspace: target.name,
    transactions_moved: moved.count,
  };
};

const ACCOUNT_ACTIONS: Record<ManageAccountInput["action"], Action<ManageAccountInput>> = {
  create: createAccount,
  update: updateAccount,
  archive: archiveAccount,
  restore: restoreAccount,
  move: moveAccount,
};

/** The account named by the input and its workspace, both locked for the change. */
async function ownedAccount(
  sql: Sql,
  userId: string,
  input: ManageAccountInput,
  { active }: { active: boolean },
): Promise<{ workspace: Workspace; account: Account }> {
  if (!input.account_id) throw required("account_id", `${input.action} an account`);
  const [owned] = await sql<{ workspace_id: string }[]>`
    SELECT a.workspace_id FROM finance.accounts a
    JOIN finance.workspaces w ON w.id = a.workspace_id AND w.owner_user_id = ${userId}
      AND w.archived_at IS NULL
    WHERE a.id = ${input.account_id}`;
  if (!owned) throw notFound("The account");
  const workspace = await resolveWorkspace(sql, userId, owned.workspace_id, true);
  const account = await findAccount(sql, workspace.id, input.account_id, true);
  if (active && account.archived_at) {
    throw fail(409, "account_archived", "That account is archived.");
  }
  return { workspace, account };
}

async function clearDefaultAccount(sql: Sql, workspaceId: string) {
  await sql`
    UPDATE finance.accounts SET is_default = false, updated_at = now()
    WHERE workspace_id = ${workspaceId} AND is_default`;
}

/** Keeps one default account while a workspace still has active accounts. */
async function ensureDefaultAccount(sql: Sql, workspaceId: string) {
  await sql`
    UPDATE finance.accounts SET is_default = true, updated_at = now()
    WHERE id = (
      SELECT id FROM finance.accounts WHERE workspace_id = ${workspaceId} AND archived_at IS NULL
      ORDER BY created_at LIMIT 1)
    AND NOT EXISTS (
      SELECT 1 FROM finance.accounts WHERE workspace_id = ${workspaceId} AND is_default)`;
}
