import { z } from "zod";

// Closed tool inputs. Each tool is one flat object with an optional `action`, so clients can
// render it easily; the service checks which fields each action needs.

const uuid = z.string().uuid();
// deno-lint-ignore no-control-regex
const controlCharacters = /[\u0000-\u001f\u007f]/;
const name = z.string().trim().min(1).max(100).refine((value) => !controlCharacters.test(value), {
  message: "Names cannot contain control characters.",
});
const notes = z.string().trim().max(2000).refine((value) => !value.includes("\u0000"));
const currency = z.string().regex(/^[A-Z]{3}$/, "Use a three-letter ISO currency code.");
const amount = z.string().regex(
  /^\d{1,12}(\.\d{1,2})?$/,
  'Use a positive decimal string with up to two decimals, for example "250.50".',
);
const signedAmount = z.string().regex(
  /^-?\d{1,12}(\.\d{1,2})?$/,
  "Use a decimal string with up to two decimals.",
);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD.");
const accountType = z.enum(["cash", "checking", "savings", "credit_card", "loan", "investment"]);
const transactionKind = z.enum(["income", "expense", "transfer"]);

export const getContextInput = z.object({
  workspace_id: uuid.optional().describe("Omit to use the default workspace."),
}).strict();

export const manageWorkspaceInput = z.object({
  action: z.enum(["create", "update", "archive"]),
  workspace_id: uuid.optional().describe("Required for update and archive."),
  name: name.optional(),
  currency: currency.optional().describe("Required for create, for example MXN."),
  timezone: z.string().min(1).max(64).optional().describe(
    "IANA zone such as America/Mexico_City. Required for create.",
  ),
  is_default: z.boolean().optional(),
}).strict();

export const manageAccountInput = z.object({
  action: z.enum(["create", "update", "archive", "move"]),
  workspace_id: uuid.optional().describe("Workspace for create; omit to use the default."),
  account_id: uuid.optional().describe("Required for update, archive and move."),
  name: name.optional(),
  type: accountType.optional().describe("Defaults to checking on create."),
  currency: currency.optional().describe("Defaults to the workspace currency on create."),
  opening_balance: signedAmount.optional().describe(
    "Starting balance. Use a negative amount for money owed on a credit_card or loan.",
  ),
  is_default: z.boolean().optional(),
  to_workspace_id: uuid.optional().describe("Required for move; transactions move too."),
}).strict();

export const manageCategoryInput = z.object({
  action: z.enum(["create", "update", "archive"]),
  workspace_id: uuid.optional(),
  category_id: uuid.optional().describe("Required for update and archive."),
  name: name.optional(),
  kind: z.enum(["income", "expense"]).optional().describe(
    "Required to create a top-level category; a subcategory takes its parent's kind.",
  ),
  parent_id: uuid.nullable().optional().describe(
    "Top-level category this one belongs under, e.g. Renta under Vivienda; null makes it top-level.",
  ),
}).strict();

export const managePayeeInput = z.object({
  action: z.enum(["create", "update", "archive", "merge"]),
  workspace_id: uuid.optional(),
  payee_id: uuid.optional().describe("Required for update, archive and merge."),
  name: name.optional(),
  default_category_id: uuid.nullable().optional(),
  into_payee_id: uuid.optional().describe("Merge target; its transactions keep this payee."),
}).strict();

export const manageProjectInput = z.object({
  action: z.enum(["create", "update", "close", "reopen"]),
  workspace_id: uuid.optional(),
  project_id: uuid.optional().describe("Required except for create."),
  name: name.optional(),
  budget: amount.nullable().optional(),
  start_date: date.nullable().optional(),
  end_date: date.nullable().optional(),
  notes: notes.nullable().optional(),
}).strict();

export const recordTransactionInput = z.object({
  request_id: uuid.describe("New UUID per transaction; reuse it only to retry the same one."),
  workspace_id: uuid.optional().describe("Omit to use the default workspace."),
  kind: transactionKind,
  amount,
  date: date.optional().describe("Defaults to today in the workspace time zone."),
  account_id: uuid.optional().describe("Omit to use the workspace's default account."),
  to_account_id: uuid.optional().describe("Destination account; transfers only."),
  payee: name.optional().describe("Payee name; created automatically when new."),
  category_id: uuid.optional().describe("Omit to use the payee's default category."),
  project_id: uuid.optional(),
  notes: notes.optional(),
}).strict();

export const updateTransactionInput = z.object({
  action: z.enum(["edit", "delete", "restore", "move"]),
  transaction_id: uuid,
  kind: transactionKind.optional(),
  amount: amount.optional(),
  date: date.optional(),
  account_id: uuid.optional(),
  to_account_id: uuid.nullable().optional(),
  payee: name.nullable().optional().describe("Payee name; null clears it."),
  category_id: uuid.nullable().optional(),
  project_id: uuid.nullable().optional(),
  notes: notes.nullable().optional(),
  to_workspace_id: uuid.optional().describe("Required for move."),
}).strict();

export const listTransactionsInput = z.object({
  workspace_id: uuid.optional(),
  from: date.optional(),
  to: date.optional(),
  account_id: uuid.optional(),
  category_id: uuid.optional(),
  payee_id: uuid.optional(),
  project_id: uuid.optional(),
  kind: transactionKind.optional(),
  search: z.string().trim().min(1).max(100).optional().describe("Matches payee or notes."),
  include_deleted: z.boolean().optional(),
  limit: z.number().int().min(1).max(100).optional(),
  cursor: z.string().max(200).optional(),
}).strict();

export const getSummaryInput = z.object({
  workspace_id: uuid.optional(),
  from: date.optional().describe("Defaults to the first day of the current month."),
  to: date.optional().describe("Defaults to today."),
  group_by: z.enum(["category", "payee", "project", "account", "month"]).optional(),
}).strict();

export type GetContextInput = z.infer<typeof getContextInput>;
export type ManageWorkspaceInput = z.infer<typeof manageWorkspaceInput>;
export type ManageAccountInput = z.infer<typeof manageAccountInput>;
export type ManageCategoryInput = z.infer<typeof manageCategoryInput>;
export type ManagePayeeInput = z.infer<typeof managePayeeInput>;
export type ManageProjectInput = z.infer<typeof manageProjectInput>;
export type RecordTransactionInput = z.infer<typeof recordTransactionInput>;
export type UpdateTransactionInput = z.infer<typeof updateTransactionInput>;
export type ListTransactionsInput = z.infer<typeof listTransactionsInput>;
export type GetSummaryInput = z.infer<typeof getSummaryInput>;

export const FINANCE_TOOLS = {
  get_context: {
    title: "Get context",
    readOnly: true,
    input: getContextInput,
    description:
      "Start here. Returns your workspaces and, for the chosen or default workspace: today's date, " +
      "accounts with balances, categories, payees and active projects with budget progress. " +
      "Use these lists as quick choices. setup_required means no workspace exists yet.",
  },
  manage_workspace: {
    title: "Manage workspace",
    readOnly: false,
    input: manageWorkspaceInput,
    description:
      "Create, rename, change currency/time zone, set as default, or archive a workspace. " +
      "Each workspace is independent and starts with default categories. The first one becomes " +
      "the default.",
  },
  manage_account: {
    title: "Manage account",
    readOnly: false,
    input: manageAccountInput,
    description:
      "Create, rename, update type/opening balance, set default, archive, or move an account to " +
      "another workspace together with all its transactions.",
  },
  manage_category: {
    title: "Manage category",
    readOnly: false,
    input: manageCategoryInput,
    description:
      "Create, rename, move under a parent or archive an income or expense category. Keep " +
      "categories general (Suscripciones, Renta); who was paid is the payee, not a category.",
  },
  manage_payee: {
    title: "Manage payee",
    readOnly: false,
    input: managePayeeInput,
    description:
      "Create, rename, set default category, archive, or merge a duplicate payee into another.",
  },
  manage_project: {
    title: "Manage project",
    readOnly: false,
    input: manageProjectInput,
    description:
      "Create, update (name, budget, dates, notes), close or reopen a project. Spent and remaining " +
      "are computed from its transactions.",
  },
  record_transaction: {
    title: "Record transaction",
    readOnly: false,
    input: recordTransactionInput,
    description:
      "Record an income, expense or transfer. Defaults: default workspace, default account, today, " +
      "and the payee's default category. A transfer needs to_account_id in the same currency.",
  },
  update_transaction: {
    title: "Update transaction",
    readOnly: false,
    input: updateTransactionInput,
    description:
      "Edit any field, delete (restorable), restore, or move a transaction to another workspace. " +
      "Moving matches category and payee by name in the target and clears the project.",
  },
  list_transactions: {
    title: "List transactions",
    readOnly: true,
    input: listTransactionsInput,
    description: "List transactions newest first with optional filters. Follow next_cursor.",
  },
  get_summary: {
    title: "Get summary",
    readOnly: true,
    input: getSummaryInput,
    description:
      "Totals of income, expense and net for a period, optionally grouped by category, payee, " +
      "project, account or month. Defaults to the current month.",
  },
} as const;

export type FinanceToolName = keyof typeof FINANCE_TOOLS;
