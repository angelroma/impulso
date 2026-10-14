import type { VerifiedIdentity } from "./auth.ts";
import { type Database, type Transaction, withIdentityTransaction } from "./database.ts";
import {
  type Book,
  lockActor,
  lockBook,
  lockPeople,
  lockWorkspace,
  storedMoney,
} from "./finance.ts";
import { normalizeMoney } from "./finance_contracts.ts";
import { ApiError } from "./http.ts";

export interface FinanceReceipt {
  actor_user_id: string;
  workspace_id: string | null;
  operation: string;
  payload_hash: string | null;
  resource_ids: string[];
  status: "completed" | "purged";
}

export interface FinanceActionContext {
  sql: Transaction;
  identity: VerifiedIdentity;
  workspaceId: string;
  book: Book;
  timezone: string;
  receipt: FinanceReceipt | null;
  hash: string;
}

export interface FinanceAccount {
  id: string;
  name: string;
  currency: string;
  person_id: string | null;
  account_kind: "unknown" | "cash" | "bank" | "investment" | "credit_card" | "loan";
  opening_balance: string;
  opening_balance_on: string | null;
  version: number;
  archived_at: Date | null;
}

export interface FinanceMutationOutcome<T> {
  result: T;
  resourceType: string;
  resourceId: string;
  resourceIds: string[];
  changedFields: string[];
  action: "create" | "update" | "archive" | "correct" | "void" | "revoke";
}

export function financeError(code: string, message: string, status = 409): never {
  throw new ApiError(status, code, message);
}

export function assertVersion(actual: number, expected: number): void {
  if (actual !== expected) financeError("version_conflict", "The resource version has changed.");
}

export function actionRetired(): never {
  return financeError("action_retired", "This action has been retired.");
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map((
          [key, item],
        ) => [key, canonical(item)]),
    );
  }
  return value;
}

export async function financeFingerprint(operation: string, payload: unknown): Promise<string> {
  const accepted = payload !== null && typeof payload === "object" && !Array.isArray(payload)
    ? Object.fromEntries(Object.entries(payload).filter(([key]) => key !== "request_id"))
    : payload;
  const bytes = new TextEncoder().encode(
    JSON.stringify({ version: 2, operation, payload: canonical(accepted) }),
  );
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(hash, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function minorUnits(value: string, precision: number): bigint {
  return BigInt(storedMoney(value, precision, false).replace(".", ""));
}

export function fromMinorUnits(value: bigint, precision: number): string {
  const negative = value < 0n;
  const digits = (negative ? -value : value).toString().padStart(precision + 1, "0");
  return `${negative ? "-" : ""}${
    precision ? `${digits.slice(0, -precision)}.${digits.slice(-precision)}` : digits
  }`;
}

export function exactMoney(value: string, precision: number, positive = true): string {
  return normalizeMoney(value, precision, positive);
}

export function withFinanceRead<T>(
  database: Database,
  identity: VerifiedIdentity,
  workspaceId: string,
  bookId: string,
  operation: (context: FinanceActionContext) => Promise<T>,
): Promise<T> {
  return withIdentityTransaction(database, identity, async (sql) => {
    const workspace = await lockWorkspace(sql, identity, workspaceId);
    const { book } = await lockBook(sql, identity, workspaceId, bookId, false);
    return await operation({
      sql,
      identity,
      workspaceId,
      book,
      timezone: workspace.timezone,
      receipt: null,
      hash: "",
    });
  });
}

export function withFinanceMutation<
  T,
  I extends { request_id: string; workspace_id: string; book_id: string },
>(
  database: Database,
  identity: VerifiedIdentity,
  input: I,
  operation: string,
  callback: (context: FinanceActionContext) => Promise<FinanceMutationOutcome<T>>,
  normalize: (input: I, book: Book) => unknown = (value) => value,
): Promise<T> {
  return withIdentityTransaction(database, identity, async (sql) => {
    const [receipt] = await sql<FinanceReceipt[]>`
      SELECT actor_user_id, workspace_id, operation,
        pg_catalog.encode(payload_hash, 'hex') AS payload_hash, resource_ids, status
      FROM private.operation_receipts WHERE request_id = ${input.request_id}
    `;
    if (receipt) {
      if (
        receipt.actor_user_id !== identity.user_id || receipt.operation !== operation ||
        receipt.workspace_id !== input.workspace_id
      ) {
        financeError("request_conflict", "This request identifier cannot be reused.");
      }
      if (receipt.status === "purged") actionRetired();
    }
    await lockActor(sql, identity);
    const workspace = await lockWorkspace(sql, identity, input.workspace_id);
    const { book } = await lockBook(sql, identity, input.workspace_id, input.book_id, true);
    const hash = await financeFingerprint(operation, normalize(input, book));
    if (receipt && receipt.payload_hash !== hash) {
      financeError("request_conflict", "This request identifier cannot be reused.");
    }
    const context: FinanceActionContext = {
      sql,
      identity,
      workspaceId: input.workspace_id,
      book,
      timezone: workspace.timezone,
      receipt: receipt ?? null,
      hash,
    };
    const outcome = await callback(context);
    if (!receipt) {
      await sql`
        INSERT INTO audit.events
          (request_id, actor_user_id, workspace_id, module, resource_type, resource_id, book_id, action, outcome, changed_fields)
        VALUES (${input.request_id}, ${identity.user_id}, ${input.workspace_id}, 'finance', ${outcome.resourceType},
          ${outcome.resourceId}, ${book.id}, ${outcome.action}, 'success', ${
        sql.array(outcome.changedFields)
      })
      `;
      await sql`
        INSERT INTO private.operation_receipts (request_id, actor_user_id, workspace_id, operation, payload_hash, resource_ids, status)
        VALUES (${input.request_id}, ${identity.user_id}, ${input.workspace_id}, ${operation},
          pg_catalog.decode(${hash}, 'hex'), ${sql.array(outcome.resourceIds, 2950)}, 'completed')
      `;
    }
    return outcome.result;
  }, input.request_id).catch((error: unknown) => {
    const code = error !== null && typeof error === "object" && "code" in error
      ? String(error.code)
      : "";
    if (!(error instanceof ApiError)) {
      if (code === "23505") {
        financeError("resource_conflict", "This resource conflicts with an existing record.");
      }
      if (code === "23503") {
        financeError(
          "invalid_relationship",
          "The selected financial references are incompatible.",
          400,
        );
      }
      if (code === "23514" || code === "22003") {
        financeError(
          "invalid_finance_values",
          "The financial values exceed their allowed constraints.",
          400,
        );
      }
    }
    throw error;
  });
}

export async function lockFinanceAccounts(
  context: FinanceActionContext,
  ids: readonly string[],
): Promise<Map<string, FinanceAccount>> {
  const { sql, workspaceId, book } = context;
  const accounts = new Map<string, FinanceAccount>();
  for (const id of [...new Set(ids)].sort()) {
    const [account] = await sql<FinanceAccount[]>`
      SELECT id, name, currency, person_id, account_kind, opening_balance::text,
        opening_balance_on::text, version, archived_at
      FROM finance.accounts WHERE workspace_id = ${workspaceId} AND book_id = ${book.id} AND id = ${id}
      FOR UPDATE
    `;
    if (!account || account.currency !== book.currency) {
      financeError("account_access_denied", "Access to this account is denied.", 403);
    }
    if (account.archived_at !== null) financeError("account_archived", "This account is archived.");
    accounts.set(id, account);
  }
  await checkFinancePeople(
    context,
    [...accounts.values()].map((account) => account.person_id).filter((id): id is string =>
      id !== null
    ),
    null,
  );
  return accounts;
}

export function checkFinancePeople(
  context: FinanceActionContext,
  personIds: readonly string[],
  selfId: string | null,
) {
  return lockPeople(context.sql, context.identity, context.workspaceId, personIds, selfId);
}
