// Entry point for the Finance MCP tools. Each tool validates its input, then runs inside one
// identity-checked transaction; the modules in ./finance implement the tools themselves.
import type { VerifiedIdentity } from "./auth.ts";
import { type Database, withIdentityTransaction } from "./database.ts";
import { ApiError } from "./http.ts";
import {
  FINANCE_TOOLS,
  type FinanceToolName,
  type RecordTransactionInput,
} from "./finance_contracts.ts";
import { manageAccount } from "./finance/accounts.ts";
import { type Row, type Sql, translateDatabaseError } from "./finance/common.ts";
import { manageCategory, managePayee } from "./finance/labels.ts";
import { manageProject } from "./finance/projects.ts";
import { getSummary, listTransactions } from "./finance/reports.ts";
import { recordTransaction, updateTransaction } from "./finance/transactions.ts";
import { getContext, manageWorkspace } from "./finance/workspaces.ts";

// Inputs are validated against FINANCE_TOOLS before a handler runs, so each one receives its own
// parsed input type.
// deno-lint-ignore no-explicit-any
type Handler = (sql: Sql, userId: string, input: any) => Promise<Row>;

const HANDLERS: Record<FinanceToolName, Handler> = {
  get_context: getContext,
  manage_workspace: manageWorkspace,
  manage_account: manageAccount,
  manage_category: manageCategory,
  manage_payee: managePayee,
  manage_project: manageProject,
  record_transaction: recordTransaction,
  update_transaction: updateTransaction,
  list_transactions: listTransactions,
  get_summary: getSummary,
};

/** Validates and runs one Finance tool for the verified actor. */
export async function runFinanceTool(
  database: Database,
  identity: VerifiedIdentity,
  name: FinanceToolName,
  rawInput: unknown,
): Promise<Row> {
  const parsed = FINANCE_TOOLS[name].input.safeParse(rawInput ?? {});
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = issue?.path.join(".") || "input";
    throw new ApiError(400, "invalid_input", `${field}: ${issue?.message ?? "invalid value"}`);
  }
  const input = parsed.data;
  // Retries of the same transaction serialize on its request_id before any other lock.
  const requestId = name === "record_transaction"
    ? (input as RecordTransactionInput).request_id
    : undefined;
  try {
    return await withIdentityTransaction(
      database,
      identity,
      (sql) => HANDLERS[name](sql, identity.user_id, input),
      requestId,
    );
  } catch (error) {
    throw translateDatabaseError(error);
  }
}
