import { isUuid, type VerifiedIdentity } from "./auth.ts";
import {
  type Database,
  hasActiveSession,
  type Transaction,
  withIdentityTransaction,
} from "./database.ts";
import {
  type CreateAccountInput,
  type CreateAccountResult,
  type CreateBookInput,
  type CreateBookResult,
  type FinanceBookSummary,
  type FinanceContextInput,
  type FinanceContextResult,
  normalizeMoney,
  type RecordExpenseInput,
  type RecordExpenseResult,
  supportedCurrency,
  validateCreateAccountInput,
  validateCreateBookInput,
  validateDate,
  validateFinanceContextInput,
  validateRecordExpenseInput,
  workspaceLocalDate,
} from "./finance_contracts.ts";
import { ApiError } from "./http.ts";

type BookRole = "owner" | "editor" | "viewer";
type Operation = "create_book" | "create_account" | "create_transaction";
interface Workspace {
  id: string;
  timezone: string;
  archived_at: Date | null;
}
export interface Book {
  id: string;
  name: string;
  currency: string;
  minor_unit: number;
  archived_at: Date | null;
}
interface Account {
  id: string;
  name: string;
  currency: string;
  person_id: string | null;
  opening_balance: string;
  opening_balance_on?: string | null;
  archived_at: Date | null;
}
interface Receipt {
  actor_user_id: string;
  operation: string;
  workspace_id: string | null;
  payload_hash: string | null;
  resource_ids: string[];
  status: "completed" | "purged";
}
interface Cursor {
  v: 1;
  w: string;
  b: string | null;
  t: string;
  i: string;
}

function denied(scope: "workspace" | "book" | "account" | "person"): ApiError {
  return new ApiError(403, `${scope}_access_denied`, `Access to this ${scope} is denied.`);
}

function archived(scope: "workspace" | "book" | "account" | "person"): ApiError {
  return new ApiError(409, `${scope}_archived`, `This ${scope} is archived.`);
}

function retired(): ApiError {
  return new ApiError(409, "action_retired", "This action has been retired.");
}

function conflict(): ApiError {
  return new ApiError(409, "request_conflict", "This request identifier cannot be reused.");
}

export async function checkPurge(
  sql: Transaction,
  workspaceId: string,
  bookId: string | null = null,
  personIds: readonly string[] = [],
): Promise<void> {
  const states = await sql<{ state: string }[]>`
    SELECT state FROM private.purge_requests
    WHERE workspace_id = ${workspaceId}
      AND (scope = 'workspace' OR (scope = 'book' AND book_id = ${bookId})
        OR (scope = 'person' AND person_id = ANY(${sql.array([...personIds], 2950)})))
      AND (state IN ('approved', 'deleting_files', 'deleting_rows', 'completed')
        OR (state = 'failed' AND confirmed_at IS NOT NULL))
  `;
  if (states.some((row) => row.state === "completed")) throw retired();
  if (states.length) {
    throw new ApiError(409, "scope_purge_pending", "A purge is in progress for this scope.");
  }
}

export async function lockWorkspace(
  sql: Transaction,
  identity: VerifiedIdentity,
  workspaceId: string,
): Promise<Workspace> {
  const [workspace] = await sql<Workspace[]>`
    SELECT id, timezone, archived_at FROM core.workspaces WHERE id = ${workspaceId} FOR UPDATE
  `;
  if (!await hasActiveSession(sql, identity)) {
    throw new ApiError(401, "invalid_session", "A valid signed-in user session is required.");
  }
  const [member] = await sql`
    SELECT user_id FROM core.workspace_members
    WHERE workspace_id = ${workspaceId} AND user_id = ${identity.user_id} AND status = 'active'
    FOR SHARE
  `;
  if (!workspace || !member) throw denied("workspace");
  if (workspace.archived_at !== null) throw archived("workspace");
  await checkPurge(sql, workspaceId);
  return workspace;
}

export async function lockBook(
  sql: Transaction,
  identity: VerifiedIdentity,
  workspaceId: string,
  bookId: string,
  write: boolean,
): Promise<{ book: Book; role: BookRole }> {
  const [book] = await sql<Book[]>`
    SELECT id, name, currency, minor_unit, archived_at FROM finance.books
    WHERE workspace_id = ${workspaceId} AND id = ${bookId} FOR SHARE
  `;
  const [grant] = await sql<{ role: BookRole }[]>`
    SELECT role FROM finance.book_access
    WHERE workspace_id = ${workspaceId} AND book_id = ${bookId}
      AND user_id = ${identity.user_id} AND revoked_at IS NULL
    FOR SHARE
  `;
  if (!book || !grant || (write && grant.role === "viewer")) throw denied("book");
  if (book.archived_at !== null) throw archived("book");
  await checkPurge(sql, workspaceId, bookId);
  // Stored precision is authoritative for existing books; registry updates never rewrite it.
  supportedCurrency(book.currency);
  if (!Number.isInteger(book.minor_unit) || book.minor_unit < 0 || book.minor_unit > 4) {
    throw new ApiError(400, "invalid_currency", "The book currency precision is unsupported.");
  }
  return { book, role: grant.role };
}

function bookSummary(book: Book, role: BookRole): FinanceBookSummary {
  supportedCurrency(book.currency);
  return {
    id: book.id,
    name: book.name,
    currency: book.currency,
    minor_unit: book.minor_unit,
    role,
    can_create_account: role !== "viewer",
    can_record_expense: role !== "viewer",
  };
}

export async function lockAccount(
  sql: Transaction,
  workspaceId: string,
  book: Book,
  accountId: string,
): Promise<Account> {
  const [account] = await sql<Account[]>`
    SELECT id, name, currency, person_id, opening_balance::text, opening_balance_on::text, archived_at
    FROM finance.accounts
    WHERE workspace_id = ${workspaceId} AND book_id = ${book.id} AND id = ${accountId}
    FOR SHARE
  `;
  if (!account || account.currency !== book.currency) throw denied("account");
  if (account.archived_at !== null) throw archived("account");
  return account;
}

export async function lockPeople(
  sql: Transaction,
  identity: VerifiedIdentity,
  workspaceId: string,
  personIds: readonly string[],
  selfId: string | null,
): Promise<{ person_id: string; display_name: string } | null> {
  let self: { person_id: string; display_name: string } | null = null;
  for (const personId of [...new Set(personIds)].sort()) {
    const [person] = await sql<{ display_name: string; archived_at: Date | null }[]>`
      SELECT display_name, archived_at FROM core.people
      WHERE workspace_id = ${workspaceId} AND id = ${personId} FOR SHARE
    `;
    if (personId === selfId) {
      const [link] = await sql`
        SELECT person_id FROM core.person_user_links
        WHERE workspace_id = ${workspaceId} AND person_id = ${personId}
          AND user_id = ${identity.user_id} AND verified_at IS NOT NULL
        FOR SHARE
      `;
      const [grant] = await sql`
        SELECT user_id FROM core.person_access
        WHERE workspace_id = ${workspaceId} AND person_id = ${personId}
          AND user_id = ${identity.user_id} AND revoked_at IS NULL
        FOR SHARE
      `;
      if (!person || !link || !grant) throw denied("person");
      self = { person_id: personId, display_name: person.display_name };
    }
    if (!person) throw denied("person");
    if (person.archived_at !== null) throw archived("person");
  }
  await checkPurge(sql, workspaceId, null, personIds);
  return self;
}

async function currentSelf(
  sql: Transaction,
  identity: VerifiedIdentity,
  workspaceId: string,
): Promise<FinanceContextResult["self"]> {
  const [link] = await sql<{ person_id: string }[]>`
    SELECT person_id FROM core.person_user_links
    WHERE workspace_id = ${workspaceId} AND user_id = ${identity.user_id}
  `;
  if (!link) return null;
  try {
    return await lockPeople(sql, identity, workspaceId, [link.person_id], link.person_id);
  } catch (error) {
    if (
      error instanceof ApiError && [
        "person_access_denied",
        "person_archived",
        "scope_purge_pending",
        "action_retired",
      ].includes(error.code)
    ) return null;
    throw error;
  }
}

function encodeCursor(cursor: Cursor): string {
  return btoa(JSON.stringify(cursor)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function decodeCursor(input: FinanceContextInput): Cursor | null {
  if (!input.cursor) return null;
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(input.cursor) || input.cursor.length > 1024) throw new Error();
    const base64 = input.cursor.replaceAll("-", "+").replaceAll("_", "/");
    const cursor = JSON.parse(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "=")));
    if (
      cursor === null || typeof cursor !== "object" || Array.isArray(cursor) ||
      Object.keys(cursor).sort().join(",") !== "b,i,t,v,w" || cursor.v !== 1 ||
      cursor.w !== input.workspace_id || cursor.b !== (input.book_id ?? null) ||
      !isUuid(cursor.i) || typeof cursor.t !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{6}Z$/.test(cursor.t)
    ) throw new Error();
    validateDate(cursor.t.slice(0, 10));
    return cursor as Cursor;
  } catch {
    throw new ApiError(
      400,
      "invalid_cursor",
      "A valid continuation cursor for this scope is required.",
    );
  }
}

export function getFinanceContext(
  database: Database,
  identity: VerifiedIdentity,
  rawInput: FinanceContextInput,
): Promise<FinanceContextResult> {
  const input = validateFinanceContextInput(rawInput);
  const cursor = decodeCursor(input);
  return withIdentityTransaction(database, identity, async (sql) => {
    const workspace = await lockWorkspace(sql, identity, input.workspace_id);
    const base = {
      workspace_id: workspace.id,
      timezone: workspace.timezone,
      current_local_date: workspaceLocalDate(workspace.timezone),
      can_create_book: true,
    };
    if (input.book_id) {
      const { book, role } = await lockBook(sql, identity, workspace.id, input.book_id, false);
      const rows = await sql<(Account & { cursor_time: string })[]>`
        SELECT a.id, a.name, a.currency, a.person_id,
          pg_catalog.to_char(a.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_time
        FROM finance.accounts a
        WHERE a.workspace_id = ${workspace.id} AND a.book_id = ${book.id} AND a.archived_at IS NULL
          AND (${cursor?.t ?? null}::text::timestamptz IS NULL OR
            (a.created_at, a.id) > (${cursor?.t ?? null}::text::timestamptz, ${
        cursor?.i ?? null
      }::uuid))
          AND (a.person_id IS NULL OR EXISTS (
            SELECT 1 FROM core.people p WHERE p.workspace_id = a.workspace_id
              AND p.id = a.person_id AND p.archived_at IS NULL
          ))
          AND NOT EXISTS (
            SELECT 1 FROM private.purge_requests purge
            WHERE purge.workspace_id = a.workspace_id AND purge.scope = 'person'
              AND purge.person_id = a.person_id
              AND (purge.state IN ('approved', 'deleting_files', 'deleting_rows', 'completed')
                OR (purge.state = 'failed' AND purge.confirmed_at IS NOT NULL))
          )
        ORDER BY a.created_at, a.id LIMIT 51 FOR SHARE OF a
      `;
      const page = rows.slice(0, 50);
      const last = page.at(-1);
      return {
        ...base,
        self: await currentSelf(sql, identity, workspace.id),
        books: [],
        selected_book: bookSummary(book, role),
        accounts: page.map(({ id, name, currency, person_id }) => ({
          id,
          name,
          currency,
          person_id,
        })),
        next_cursor: rows.length > 50 && last
          ? encodeCursor({ v: 1, w: workspace.id, b: book.id, t: last.cursor_time, i: last.id })
          : null,
      };
    }
    const rows = await sql<(Book & { role: BookRole; cursor_time: string })[]>`
      SELECT b.id, b.name, b.currency, b.minor_unit, acl.role,
        pg_catalog.to_char(b.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_time
      FROM finance.books b
      JOIN finance.book_access acl ON acl.workspace_id = b.workspace_id AND acl.book_id = b.id
        AND acl.user_id = ${identity.user_id} AND acl.revoked_at IS NULL
      WHERE b.workspace_id = ${workspace.id} AND b.archived_at IS NULL
        AND (${cursor?.t ?? null}::text::timestamptz IS NULL OR
          (b.created_at, b.id) > (${cursor?.t ?? null}::text::timestamptz, ${
      cursor?.i ?? null
    }::uuid))
        AND NOT EXISTS (
          SELECT 1 FROM private.purge_requests purge
          WHERE purge.workspace_id = b.workspace_id AND purge.scope = 'book' AND purge.book_id = b.id
            AND (purge.state IN ('approved', 'deleting_files', 'deleting_rows', 'completed')
              OR (purge.state = 'failed' AND purge.confirmed_at IS NOT NULL))
        )
      ORDER BY b.created_at, b.id LIMIT 51 FOR SHARE OF b, acl
    `;
    const page = rows.slice(0, 50);
    const last = page.at(-1);
    return {
      ...base,
      self: await currentSelf(sql, identity, workspace.id),
      books: page.map((book) => bookSummary(book, book.role)),
      selected_book: null,
      accounts: [],
      next_cursor: rows.length > 50 && last
        ? encodeCursor({ v: 1, w: workspace.id, b: null, t: last.cursor_time, i: last.id })
        : null,
    };
  });
}

async function readReceipt(
  sql: Transaction,
  identity: VerifiedIdentity,
  input: { request_id: string; workspace_id: string },
  operation: Operation,
): Promise<Receipt | null> {
  const [receipt] = await sql<Receipt[]>`
    SELECT actor_user_id, workspace_id, operation,
      pg_catalog.encode(payload_hash, 'hex') AS payload_hash, resource_ids, status
    FROM private.operation_receipts WHERE request_id = ${input.request_id}
  `;
  if (!receipt) return null;
  if (receipt.actor_user_id !== identity.user_id || receipt.operation !== operation) {
    throw conflict();
  }
  if (receipt.status === "purged") throw retired();
  if (receipt.workspace_id !== input.workspace_id) throw conflict();
  return receipt;
}

async function payloadHash(
  operation: Operation,
  payload: Record<string, unknown>,
): Promise<string> {
  const encoded = new TextEncoder().encode(JSON.stringify({ version: 1, operation, ...payload }));
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", encoded));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function checkReceipt(receipt: Receipt | null, hash: string, ids: readonly string[]): void {
  if (
    receipt && (receipt.payload_hash !== hash || receipt.resource_ids.length !== ids.length ||
      receipt.resource_ids.some((id, index) => id !== ids[index]))
  ) throw conflict();
}

async function writeSuccess(
  sql: Transaction,
  identity: VerifiedIdentity,
  input: { request_id: string; workspace_id: string },
  operation: Operation,
  hash: string,
  bookId: string,
  resourceType: "book" | "account" | "transaction",
  resourceIds: string[],
  changedFields: string[],
): Promise<void> {
  await sql`
    INSERT INTO audit.events
      (request_id, actor_user_id, workspace_id, module, resource_type, resource_id,
        book_id, action, outcome, changed_fields)
    VALUES (${input.request_id}, ${identity.user_id}, ${input.workspace_id}, 'finance',
      ${resourceType}, ${resourceIds.at(-1)!}, ${bookId}, 'create', 'success', ${
    sql.array(changedFields)
  })
  `;
  await sql`
    INSERT INTO private.operation_receipts
      (request_id, actor_user_id, workspace_id, operation, payload_hash, resource_ids, status)
    VALUES (${input.request_id}, ${identity.user_id}, ${input.workspace_id}, ${operation},
      pg_catalog.decode(${hash}, 'hex'), ${sql.array(resourceIds, 2950)}, 'completed')
  `;
}

export async function lockActor(sql: Transaction, identity: VerifiedIdentity): Promise<void> {
  const [actor] = await sql`
    SELECT id FROM private.auth_users WHERE id = ${identity.user_id} FOR UPDATE
  `;
  if (!actor) {
    throw new ApiError(401, "invalid_session", "A valid signed-in user session is required.");
  }
}

export function createBook(
  database: Database,
  identity: VerifiedIdentity,
  rawInput: CreateBookInput,
): Promise<CreateBookResult> {
  const input = validateCreateBookInput(rawInput);
  const minorUnit = supportedCurrency(input.currency);
  return withIdentityTransaction(database, identity, async (sql) => {
    const receipt = await readReceipt(sql, identity, input, "create_book");
    await lockActor(sql, identity);
    await lockWorkspace(sql, identity, input.workspace_id);
    const fingerprint = (precision: number) =>
      payloadHash("create_book", {
        workspace_id: input.workspace_id,
        name: input.name,
        currency: input.currency,
        minor_unit: precision,
      });
    if (receipt) {
      if (receipt.resource_ids.length !== 1) throw conflict();
      const { book } = await lockBook(
        sql,
        identity,
        input.workspace_id,
        receipt.resource_ids[0],
        true,
      );
      checkReceipt(receipt, await fingerprint(book.minor_unit), [book.id]);
      if (book.name !== input.name || book.currency !== input.currency) {
        throw retired();
      }
      return {
        status: "already_processed",
        workspace_id: input.workspace_id,
        book_id: book.id,
        name: book.name,
        currency: book.currency,
        minor_unit: book.minor_unit,
      };
    }
    const hash = await fingerprint(minorUnit);
    const bookId = crypto.randomUUID();
    await sql`
      INSERT INTO finance.books
        (id, workspace_id, name, currency, minor_unit, created_at, updated_at,
          created_by_user_id, updated_by_user_id, version)
      VALUES (${bookId}, ${input.workspace_id}, ${input.name}, ${input.currency}, ${minorUnit},
        now(), now(), ${identity.user_id}, ${identity.user_id}, 1)
    `;
    await sql`
      INSERT INTO finance.book_access
        (workspace_id, book_id, user_id, role, granted_at, granted_by_user_id, version)
      VALUES (${input.workspace_id}, ${bookId}, ${identity.user_id}, 'owner', now(), ${identity.user_id}, 1)
    `;
    await writeSuccess(sql, identity, input, "create_book", hash, bookId, "book", [bookId], [
      "name",
      "currency",
      "minor_unit",
    ]);
    return {
      status: "created",
      workspace_id: input.workspace_id,
      book_id: bookId,
      name: input.name,
      currency: input.currency,
      minor_unit: minorUnit,
    };
  }, input.request_id);
}

function matchingCurrency(currency: string, book: Book): void {
  if (currency !== book.currency) {
    throw new ApiError(400, "invalid_currency", "Currency must match the selected book.");
  }
}

export function storedMoney(value: string, minorUnit: number, positive: boolean): string {
  const exact = value.includes(".") ? value.replace(/0+$/, "").replace(/\.$/, "") : value;
  return normalizeMoney(exact, minorUnit, positive);
}

export function createAccount(
  database: Database,
  identity: VerifiedIdentity,
  rawInput: CreateAccountInput,
): Promise<CreateAccountResult> {
  const input = validateCreateAccountInput(rawInput);
  return withIdentityTransaction(database, identity, async (sql) => {
    const receipt = await readReceipt(sql, identity, input, "create_account");
    if (
      receipt && (receipt.resource_ids.length !== 2 || receipt.resource_ids[0] !== input.book_id)
    ) {
      throw conflict();
    }
    await lockActor(sql, identity);
    await lockWorkspace(sql, identity, input.workspace_id);
    const { book } = await lockBook(sql, identity, input.workspace_id, input.book_id, true);
    if (receipt && input.currency !== book.currency) throw conflict();
    matchingCurrency(input.currency, book);
    const openingBalance = normalizeMoney(input.opening_balance, book.minor_unit, false);
    const account = receipt
      ? await lockAccount(sql, input.workspace_id, book, receipt.resource_ids[1])
      : null;
    const hash = await payloadHash("create_account", {
      workspace_id: input.workspace_id,
      book_id: book.id,
      name: input.name,
      currency: book.currency,
      opening_balance: openingBalance,
      person_id: input.person_id,
    });
    if (receipt) checkReceipt(receipt, hash, [book.id, receipt.resource_ids[1]]);
    await lockPeople(
      sql,
      identity,
      input.workspace_id,
      input.person_id ? [input.person_id] : [],
      input.person_id,
    );
    if (account) {
      checkReceipt(receipt, hash, [book.id, account.id]);
      if (
        account.name !== input.name || account.person_id !== input.person_id ||
        storedMoney(account.opening_balance, book.minor_unit, false) !== openingBalance
      ) throw retired();
      return {
        status: "already_processed",
        workspace_id: input.workspace_id,
        book_id: book.id,
        account_id: account.id,
        name: account.name,
        currency: account.currency,
        opening_balance: openingBalance,
        person_id: account.person_id,
      };
    }
    const accountId = crypto.randomUUID();
    await sql`
      INSERT INTO finance.accounts
        (id, workspace_id, book_id, name, currency, opening_balance, person_id,
          created_at, updated_at, created_by_user_id, updated_by_user_id, version)
      VALUES (${accountId}, ${input.workspace_id}, ${book.id}, ${input.name}, ${book.currency},
        ${openingBalance}, ${input.person_id}, now(), now(), ${identity.user_id}, ${identity.user_id}, 1)
    `;
    await writeSuccess(sql, identity, input, "create_account", hash, book.id, "account", [
      book.id,
      accountId,
    ], [
      "book_id",
      "name",
      "currency",
      "opening_balance",
      "person_id",
    ]);
    return {
      status: "created",
      workspace_id: input.workspace_id,
      book_id: book.id,
      account_id: accountId,
      name: input.name,
      currency: book.currency,
      opening_balance: openingBalance,
      person_id: input.person_id,
    };
  }, input.request_id);
}

export function recordExpense(
  database: Database,
  identity: VerifiedIdentity,
  rawInput: RecordExpenseInput,
): Promise<RecordExpenseResult> {
  const input = validateRecordExpenseInput(rawInput);
  return withIdentityTransaction(database, identity, async (sql) => {
    const receipt = await readReceipt(sql, identity, input, "create_transaction");
    if (
      receipt && (receipt.resource_ids.length !== 3 || receipt.resource_ids[0] !== input.book_id ||
        receipt.resource_ids[1] !== input.source_account_id)
    ) throw conflict();
    await lockActor(sql, identity);
    await lockWorkspace(sql, identity, input.workspace_id);
    const { book } = await lockBook(sql, identity, input.workspace_id, input.book_id, true);
    if (receipt && input.currency !== book.currency) throw conflict();
    matchingCurrency(input.currency, book);
    const amount = normalizeMoney(input.amount, book.minor_unit, true);
    const account = await lockAccount(sql, input.workspace_id, book, input.source_account_id);
    if (account.opening_balance_on && input.occurred_on < account.opening_balance_on) {
      throw new ApiError(
        409,
        "opening_boundary_conflict",
        "A movement cannot precede the accepted opening date.",
      );
    }
    const hash = await payloadHash("create_transaction", {
      workspace_id: input.workspace_id,
      book_id: book.id,
      source_account_id: account.id,
      amount,
      currency: book.currency,
      occurred_on: input.occurred_on,
      description: input.description,
      beneficiary_person_id: input.beneficiary_person_id,
    });
    if (receipt) checkReceipt(receipt, hash, [book.id, account.id, receipt.resource_ids[2]]);
    await lockPeople(
      sql,
      identity,
      input.workspace_id,
      [account.person_id, input.beneficiary_person_id].filter((id): id is string => id !== null),
      input.beneficiary_person_id,
    );
    let transactionId: string;
    if (receipt) {
      transactionId = receipt.resource_ids[2];
      checkReceipt(receipt, hash, [book.id, account.id, transactionId]);
      const [transaction] = await sql<{
        source_account_id: string;
        currency: string;
        amount: string;
        occurred_on: string;
        description: string;
        beneficiary_person_id: string | null;
        kind: string;
        destination_account_id: string | null;
        replaces_transaction_id: string | null;
        voided_at: Date | null;
      }[]>`
        SELECT source_account_id, currency, amount::text, occurred_on::text, description,
          beneficiary_person_id, kind, destination_account_id, replaces_transaction_id, voided_at
        FROM finance.transactions
        WHERE workspace_id = ${input.workspace_id} AND book_id = ${book.id} AND id = ${transactionId}
          AND request_id = ${input.request_id}
      `;
      if (
        !transaction || transaction.kind !== "expense" || transaction.currency !== book.currency ||
        transaction.source_account_id !== account.id ||
        transaction.destination_account_id !== null ||
        transaction.replaces_transaction_id !== null || transaction.voided_at !== null ||
        transaction.occurred_on !== input.occurred_on ||
        transaction.description !== input.description ||
        transaction.beneficiary_person_id !== input.beneficiary_person_id ||
        storedMoney(transaction.amount, book.minor_unit, true) !== amount
      ) throw retired();
    } else {
      transactionId = crypto.randomUUID();
      await sql`
        INSERT INTO finance.transactions
          (id, workspace_id, book_id, source_account_id, destination_account_id, kind, amount,
            currency, occurred_on, description, beneficiary_person_id, request_id,
            replaces_transaction_id, voided_at, voided_by_user_id, void_reason,
            created_at, updated_at, created_by_user_id, updated_by_user_id, version)
        VALUES (${transactionId}, ${input.workspace_id}, ${book.id}, ${account.id}, NULL, 'expense',
          ${amount}, ${book.currency}, ${input.occurred_on}, ${input.description},
          ${input.beneficiary_person_id}, ${input.request_id}, NULL, NULL, NULL, NULL,
          now(), now(), ${identity.user_id}, ${identity.user_id}, 1)
      `;
      await writeSuccess(sql, identity, input, "create_transaction", hash, book.id, "transaction", [
        book.id,
        account.id,
        transactionId,
      ], [
        "book_id",
        "source_account_id",
        "kind",
        "amount",
        "currency",
        "occurred_on",
        "description",
        "beneficiary_person_id",
      ]);
    }
    return {
      status: receipt ? "already_processed" : "created",
      workspace_id: input.workspace_id,
      book_id: book.id,
      source_account_id: account.id,
      transaction_id: transactionId,
      amount,
      currency: book.currency,
      occurred_on: input.occurred_on,
      description: input.description,
      beneficiary_person_id: input.beneficiary_person_id,
    };
  }, input.request_id);
}
