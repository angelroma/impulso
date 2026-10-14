import { isUuid, type VerifiedIdentity } from "./auth.ts";
import type { Database } from "./database.ts";
import {
  actionRetired,
  assertVersion,
  checkFinancePeople,
  exactMoney,
  type FinanceActionContext,
  financeError,
  financeFingerprint,
  type FinanceMutationOutcome,
  fromMinorUnits,
  lockFinanceAccounts,
  minorUnits,
  withFinanceMutation,
  withFinanceRead,
} from "./finance_common.ts";
import { type Book, storedMoney } from "./finance.ts";
import { validateDate } from "./finance_contracts.ts";
import {
  type AllocationReconciliation,
  type ConfigureAccountInput,
  type CorrectTransactionInput,
  LEDGER_TOOL_SCHEMAS,
  type LedgerEntry,
  ledgerEntrySchema,
  type LedgerToolName,
  type ListTransactionsInput,
  type ManageCategoryInput,
  parseLedgerInput,
  type RecordTransactionInput,
} from "./ledger_contracts.ts";
import { applySettlementLinks, reconcileTransactionAllocations } from "./planning.ts";

interface Category {
  id: string;
  name: string;
  kind: "income" | "expense";
  currency: string;
  version: number;
  archived_at: Date | null;
}
export interface PostedEntry {
  id: string;
  request_id: string;
  kind: "income" | "expense" | "transfer";
  amount: string;
  currency: string;
  occurred_on: string;
  description: string;
  beneficiary_person_id: string | null;
  source_account_id: string | null;
  destination_account_id: string | null;
  version: number;
  voided_at: Date | null;
  replaces_transaction_id: string | null;
}
type Posted = PostedEntry;

const outcome = <T>(
  result: T,
  resourceType: string,
  resourceId: string,
  resourceIds: string[],
  changedFields: string[],
  action: "create" | "update" | "archive" | "correct" | "void" = "create",
) => ({ result, resourceType, resourceId, resourceIds, changedFields, action });
const scope = (context: FinanceActionContext) => ({
  workspace_id: context.workspaceId,
  book_id: context.book.id,
});
const accountIds = (entry: LedgerEntry): string[] =>
  [
    "source_account_id" in entry ? entry.source_account_id : null,
    "destination_account_id" in entry ? entry.destination_account_id : null,
  ].filter((id): id is string => id !== null);
const postedSummary = (row: Posted) => ({
  transaction_id: row.id,
  request_id: row.request_id,
  kind: row.kind,
  amount: row.amount,
  currency: row.currency,
  occurred_on: row.occurred_on,
});
const categorySummary = (row: Category) => ({
  category_id: row.id,
  name: row.name,
  kind: row.kind,
  version: row.version,
  archived: row.archived_at !== null,
});

export function normalizeLedgerEntry(entry: LedgerEntry, book: Book): LedgerEntry {
  if (entry.currency !== book.currency) {
    financeError("invalid_currency", "Currency must match the selected book.", 400);
  }
  const links = entry.settlement_links?.map((link) => ({
    ...link,
    amount: exactMoney(link.amount, book.minor_unit),
  }));
  if (links && new Set(links.map((link) => link.planned_item_line_id)).size !== links.length) {
    financeError("invalid_input", "A plan line can appear only once per entry.", 400);
  }
  if (
    links &&
    links.reduce((sum, link) => sum + minorUnits(link.amount, book.minor_unit), 0n) >
      minorUnits(entry.amount, book.minor_unit)
  ) financeError("allocation_exceeds_actual", "Allocations exceed the actual movement amount.");
  return {
    ...entry,
    amount: exactMoney(entry.amount, book.minor_unit),
    ...(links ? { settlement_links: links } : {}),
  };
}

async function readPosted(context: FinanceActionContext, id: string, lock = true): Promise<Posted> {
  const { sql, workspaceId, book } = context;
  const rows = lock
    ? await sql<Posted[]>`
    SELECT id, request_id, kind, amount::text, currency, occurred_on::text, description,
      beneficiary_person_id, source_account_id, destination_account_id, version, voided_at, replaces_transaction_id
    FROM finance.transactions WHERE workspace_id = ${workspaceId} AND book_id = ${book.id} AND id = ${id} FOR UPDATE
  `
    : await sql<Posted[]>`
    SELECT id, request_id, kind, amount::text, currency, occurred_on::text, description,
      beneficiary_person_id, source_account_id, destination_account_id, version, voided_at, replaces_transaction_id
    FROM finance.transactions WHERE workspace_id = ${workspaceId} AND book_id = ${book.id} AND id = ${id}
  `;
  if (!rows[0]) {
    financeError("transaction_access_denied", "Access to this transaction is denied.", 403);
  }
  return { ...rows[0], amount: storedMoney(rows[0].amount, book.minor_unit, true) };
}

async function lockCategory(context: FinanceActionContext, id: string): Promise<Category> {
  const { sql, workspaceId, book } = context;
  const [row] = await sql<
    Category[]
  >`SELECT id, name, kind, currency, version, archived_at FROM finance.categories
    WHERE workspace_id = ${workspaceId} AND book_id = ${book.id} AND id = ${id} FOR UPDATE`;
  if (!row || row.currency !== book.currency) {
    financeError("category_access_denied", "Access to this category is denied.", 403);
  }
  return row;
}

async function validateEntries(
  context: FinanceActionContext,
  entries: LedgerEntry[],
): Promise<void> {
  const accounts = await lockFinanceAccounts(context, entries.flatMap(accountIds));
  for (const entry of entries) {
    for (const id of accountIds(entry)) {
      const account = accounts.get(id)!;
      if (account.opening_balance_on !== null && entry.occurred_on < account.opening_balance_on) {
        financeError(
          "opening_boundary_conflict",
          "A movement cannot precede the accepted opening date.",
        );
      }
    }
  }
  const categories = new Map<string, Category>();
  for (
    const id of [
      ...new Set(
        entries.map((entry) => entry.category_id).filter((id): id is string => id !== null),
      ),
    ].sort()
  ) categories.set(id, await lockCategory(context, id));
  for (const entry of entries) {
    if (entry.category_id) {
      const category = categories.get(entry.category_id)!;
      if (category.archived_at !== null) {
        financeError("category_archived", "This category is archived.");
      }
      if (category.kind !== entry.kind) {
        financeError("category_kind_mismatch", "The category kind must match the movement.");
      }
    }
  }
  for (
    const personId of [
      ...new Set(
        entries.map((entry) => entry.beneficiary_person_id).filter((id): id is string =>
          id !== null
        ),
      ),
    ].sort()
  ) await checkFinancePeople(context, [personId], personId);
}

async function insertPosted(
  context: FinanceActionContext,
  entry: LedgerEntry,
  requestId: string,
  groupId: string | null = null,
  groupPosition: number | null = null,
  replacesId: string | null = null,
): Promise<Posted> {
  const { sql, identity, workspaceId, book } = context;
  const id = crypto.randomUUID();
  const sourceId = "source_account_id" in entry ? entry.source_account_id : null;
  const destinationId = "destination_account_id" in entry ? entry.destination_account_id : null;
  await sql`INSERT INTO finance.transactions
    (id, workspace_id, book_id, currency, kind, amount, source_account_id, destination_account_id,
      beneficiary_person_id, occurred_on, description, request_id, replaces_transaction_id, created_by_user_id, updated_by_user_id)
    VALUES (${id}, ${workspaceId}, ${book.id}, ${book.currency}, ${entry.kind}, ${entry.amount}, ${sourceId}, ${destinationId},
      ${entry.beneficiary_person_id}, ${entry.occurred_on}, ${entry.description}, ${requestId}, ${replacesId}, ${identity.user_id}, ${identity.user_id})`;
  await sql`INSERT INTO finance.transaction_classifications
    (workspace_id, book_id, currency, transaction_id, kind, category_id, group_id, group_position, created_by_user_id, updated_by_user_id)
    VALUES (${workspaceId}, ${book.id}, ${book.currency}, ${id}, ${entry.kind}, ${entry.category_id}, ${groupId}, ${groupPosition}, ${identity.user_id}, ${identity.user_id})`;
  if (entry.settlement_links?.length) {
    await applySettlementLinks(context, id, entry.settlement_links);
  }
  return {
    id,
    request_id: requestId,
    kind: entry.kind,
    amount: entry.amount,
    currency: book.currency,
    occurred_on: entry.occurred_on,
    description: entry.description,
    beneficiary_person_id: entry.beneficiary_person_id,
    source_account_id: sourceId,
    destination_account_id: destinationId,
    version: 1,
    voided_at: null,
    replaces_transaction_id: replacesId,
  };
}

export async function postLedgerEntry(
  context: FinanceActionContext,
  raw: LedgerEntry,
  childRequestId: string,
  replacesId: string | null = null,
): Promise<PostedEntry> {
  const entry = normalizeLedgerEntry(parseLedgerInput(ledgerEntrySchema, raw), context.book);
  await validateEntries(context, [entry]);
  return await insertPosted(context, entry, childRequestId, null, null, replacesId);
}

export async function reviseLedgerEntry(
  context: FinanceActionContext,
  originalId: string,
  expectedVersion: number,
  reason: string,
  childRequestId: string,
  rawReplacement: LedgerEntry | null,
  changes: AllocationReconciliation[],
) {
  if (
    !reason.trim() || !reason.isWellFormed() || reason.includes("\0") ||
    Array.from(reason).length > 2000
  ) financeError("invalid_input", "An accepted correction reason is required.", 400);
  const replacement = rawReplacement === null
    ? null
    : normalizeLedgerEntry(parseLedgerInput(ledgerEntrySchema, rawReplacement), context.book);
  const before = await readPosted(context, originalId, false);
  const entries = replacement ? [replacement] : [];
  await lockFinanceAccounts(
    context,
    [before.source_account_id, before.destination_account_id, ...entries.flatMap(accountIds)]
      .filter((id): id is string => id !== null),
  );
  if (before.beneficiary_person_id) {
    await checkFinancePeople(context, [before.beneficiary_person_id], before.beneficiary_person_id);
  }
  await validateEntries(context, entries);
  const original = await readPosted(context, originalId);
  if (original.voided_at !== null) {
    financeError("version_conflict", "The transaction is already voided or replaced.");
  }
  assertVersion(original.version, expectedVersion);
  if (!replacement && changes.some((link) => link.action !== "revoke")) {
    financeError("invalid_input", "A void can only revoke dependent allocations.", 400);
  }
  const { sql, workspaceId, identity, book } = context;
  await sql`UPDATE finance.transactions SET voided_at = now(), voided_by_user_id = ${identity.user_id}, void_reason = ${reason}, version = version + 1, updated_at = now(), updated_by_user_id = ${identity.user_id}
    WHERE workspace_id = ${workspaceId} AND book_id = ${book.id} AND id = ${original.id}`;
  const posted = replacement
    ? await insertPosted(context, replacement, childRequestId, null, null, original.id)
    : null;
  await reconcileTransactionAllocations(context, original.id, posted?.id ?? null, changes);
  return { original, replacement: posted, version: expectedVersion + 1 };
}

async function recoverPosted(
  context: FinanceActionContext,
  id: string,
  entry: LedgerEntry,
  requestId?: string,
): Promise<Posted> {
  const row = await readPosted(context, id);
  if (
    row.voided_at !== null || row.kind !== entry.kind || row.amount !== entry.amount ||
    row.currency !== entry.currency || row.occurred_on !== entry.occurred_on ||
    row.description !== entry.description ||
    row.beneficiary_person_id !== entry.beneficiary_person_id ||
    row.source_account_id !== ("source_account_id" in entry ? entry.source_account_id : null) ||
    row.destination_account_id !==
      ("destination_account_id" in entry ? entry.destination_account_id : null) ||
    (requestId && row.request_id !== requestId)
  ) actionRetired();
  return row;
}

export function configureAccount(database: Database, identity: VerifiedIdentity, raw: unknown) {
  const input: ConfigureAccountInput = parseLedgerInput(
    LEDGER_TOOL_SCHEMAS.configure_account.input,
    raw,
  );
  return withFinanceMutation(database, identity, input, "configure_account", async (context) => {
    const { sql, workspaceId, book, receipt } = context;
    const account = (await lockFinanceAccounts(context, [input.account_id])).get(input.account_id)!;
    if (receipt) {
      if (
        receipt.resource_ids.join() !== [book.id, account.id].join() ||
        account.version !== input.expected_version + 1 ||
        account.account_kind !== input.account_kind ||
        account.opening_balance_on !== input.opening_balance_on
      ) actionRetired();
    } else {
      assertVersion(account.version, input.expected_version);
      if (input.opening_balance_on !== null) {
        const [history] =
          await sql`SELECT id FROM finance.transactions WHERE workspace_id = ${workspaceId} AND book_id = ${book.id}
          AND (source_account_id = ${account.id} OR destination_account_id = ${account.id}) AND occurred_on < ${input.opening_balance_on} LIMIT 1`;
        if (history) {
          financeError(
            "opening_boundary_conflict",
            "The opening date would exclude existing movement history.",
          );
        }
      }
      await sql`UPDATE finance.accounts SET account_kind = ${input.account_kind}, opening_balance_on = ${input.opening_balance_on},
        version = version + 1, updated_at = now(), updated_by_user_id = ${identity.user_id}
        WHERE workspace_id = ${workspaceId} AND book_id = ${book.id} AND id = ${account.id}`;
    }
    return outcome(
      {
        ...scope(context),
        status: receipt ? "already_processed" : "updated",
        account_id: account.id,
        account_kind: input.account_kind,
        opening_balance_on: input.opening_balance_on,
        version: input.expected_version + 1,
      },
      "account",
      account.id,
      [book.id, account.id],
      ["account_kind", "opening_balance_on"],
      "update",
    );
  });
}

function encodeCursor(value: unknown): string {
  return btoa(JSON.stringify(value)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}
function decodeCursor(
  value: string | undefined,
  fingerprint: string,
): { d: string; i: string } | null {
  if (!value) return null;
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error();
    const raw = value.replaceAll("-", "+").replaceAll("_", "/");
    const cursor = JSON.parse(atob(raw.padEnd(Math.ceil(raw.length / 4) * 4, "=")));
    if (
      cursor === null || typeof cursor !== "object" ||
      Object.keys(cursor).sort().join() !== "d,i,s,v" || cursor.v !== 2 ||
      cursor.s !== fingerprint || !isUuid(cursor.i) || typeof cursor.d !== "string"
    ) throw new Error();
    return cursor;
  } catch {
    return financeError(
      "invalid_cursor",
      "A valid continuation for these filters is required.",
      400,
    );
  }
}

export function manageCategory(database: Database, identity: VerifiedIdentity, raw: unknown) {
  const input: ManageCategoryInput = parseLedgerInput(
    LEDGER_TOOL_SCHEMAS.manage_category.input,
    raw,
  );
  if (input.action === "list") {
    return withFinanceRead(
      database,
      identity,
      input.workspace_id,
      input.book_id,
      async (context) => {
        const { sql, workspaceId, book } = context;
        const fingerprint = await financeFingerprint("list_categories", {
          ...input,
          cursor: undefined,
        });
        const cursor = decodeCursor(input.cursor, fingerprint);
        const limit = input.page_size ?? 50;
        const rows = await sql<
          Category[]
        >`SELECT id, name, kind, currency, version, archived_at FROM finance.categories
      WHERE workspace_id = ${workspaceId} AND book_id = ${book.id}
        AND (${input.kind ?? null}::text IS NULL OR kind = ${input.kind ?? null})
        AND (${input.include_archived ?? false} OR archived_at IS NULL)
        AND (${cursor?.i ?? null}::uuid IS NULL OR id > ${
          cursor?.i ?? null
        }::uuid) ORDER BY id LIMIT ${limit + 1}`;
        const page = rows.slice(0, limit);
        return {
          ...scope(context),
          action: "list",
          categories: page.map(categorySummary),
          next_cursor: rows.length > limit
            ? encodeCursor({ v: 2, s: fingerprint, d: "category", i: page.at(-1)!.id })
            : null,
        };
      },
    );
  }
  const operation = {
    create: "create_category",
    rename: "rename_category",
    archive: "archive_category",
    classify: "classify_transaction",
  }[input.action];
  return withFinanceMutation(
    database,
    identity,
    input,
    operation,
    async (context): Promise<FinanceMutationOutcome<Record<string, unknown>>> => {
      const { sql, workspaceId, book, receipt } = context;
      if (input.action === "classify") {
        const target = await readPosted(context, input.transaction_id, false);
        await lockFinanceAccounts(
          context,
          [target.source_account_id, target.destination_account_id].filter((id): id is string =>
            id !== null
          ),
        );
        if (target.beneficiary_person_id) {
          await checkFinancePeople(
            context,
            [target.beneficiary_person_id],
            target.beneficiary_person_id,
          );
        }
        if (target.voided_at !== null) actionRetired();
        if (input.category_id) {
          const category = await lockCategory(context, input.category_id);
          if (category.archived_at !== null) {
            financeError(
              "category_archived",
              "This category is archived.",
            );
          }
          if (category.kind !== target.kind) {
            financeError(
              "category_kind_mismatch",
              "The category kind must match the movement.",
            );
          }
        }
        if (target.kind === "transfer" && input.category_id !== null) {
          financeError(
            "category_kind_mismatch",
            "Transfers cannot have income or expense categories.",
          );
        }
        const [classification] = await sql<
          { id: string; category_id: string | null; version: number }[]
        >`SELECT id, category_id, version FROM finance.transaction_classifications
        WHERE workspace_id = ${workspaceId} AND book_id = ${book.id} AND transaction_id = ${target.id} FOR UPDATE`;
        if (receipt) {
          if (
            !classification || classification.version !== input.expected_version + 1 ||
            classification.category_id !== input.category_id ||
            receipt.resource_ids.join() !== [book.id, target.id, classification.id].join()
          ) actionRetired();
        } else {
          assertVersion(classification?.version ?? 0, input.expected_version);
          if (
            classification
          ) {
            await sql`UPDATE finance.transaction_classifications SET category_id = ${input.category_id}, version = version + 1, updated_at = now(), updated_by_user_id = ${identity.user_id} WHERE id = ${classification.id}`;
          } else {await sql`INSERT INTO finance.transaction_classifications (workspace_id, book_id, currency, transaction_id, kind, category_id, created_by_user_id, updated_by_user_id)
          VALUES (${workspaceId}, ${book.id}, ${book.currency}, ${target.id}, ${target.kind}, ${input.category_id}, ${identity.user_id}, ${identity.user_id})`;}
        }
        const [current] = await sql<
          { id: string }[]
        >`SELECT id FROM finance.transaction_classifications WHERE workspace_id = ${workspaceId} AND book_id = ${book.id} AND transaction_id = ${target.id}`;
        return outcome(
          {
            ...scope(context),
            action: input.action,
            status: receipt ? "already_processed" : "updated",
            transaction_id: target.id,
            category_id: input.category_id,
            version: input.expected_version + 1,
          },
          "transaction",
          target.id,
          [book.id, target.id, current.id],
          ["category_id"],
          "update",
        );
      }
      let category: Category;
      if (input.action === "create") {
        if (receipt) {
          if (
            receipt.resource_ids.length !== 2 || receipt.resource_ids[0] !== book.id
          ) actionRetired();
          category = await lockCategory(context, receipt.resource_ids[1]);
          if (
            category.name !== input.name || category.kind !== input.kind ||
            category.archived_at !== null
          ) actionRetired();
        } else {
          const id = crypto.randomUUID();
          await sql`INSERT INTO finance.categories (id, workspace_id, book_id, currency, kind, name, created_by_user_id, updated_by_user_id)
          VALUES (${id}, ${workspaceId}, ${book.id}, ${book.currency}, ${input.kind}, ${input.name}, ${identity.user_id}, ${identity.user_id})`;
          category = {
            id,
            name: input.name,
            kind: input.kind,
            currency: book.currency,
            version: 1,
            archived_at: null,
          };
        }
      } else {
        category = await lockCategory(context, input.category_id);
        if (receipt) {
          if (
            receipt.resource_ids.join() !== [book.id, category.id].join() ||
            category.version !== input.expected_version + 1 ||
            (input.action === "rename" &&
              (category.name !== input.name || category.archived_at !== null)) ||
            (input.action === "archive" && category.archived_at === null)
          ) actionRetired();
        } else {
          if (category.archived_at !== null) {
            financeError(
              "category_archived",
              "This category is archived.",
            );
          }
          assertVersion(category.version, input.expected_version);
          if (input.action === "rename") {
            await sql`UPDATE finance.categories SET name = ${input.name}, version = version + 1, updated_at = now(), updated_by_user_id = ${identity.user_id} WHERE id = ${category.id}`;
            category = { ...category, name: input.name, version: category.version + 1 };
          } else {
            await sql`UPDATE finance.categories SET archived_at = now(), archived_by_user_id = ${identity.user_id}, version = version + 1, updated_at = now(), updated_by_user_id = ${identity.user_id} WHERE id = ${category.id}`;
            category = { ...category, archived_at: new Date(), version: category.version + 1 };
          }
        }
      }
      return outcome(
        {
          ...scope(context),
          action: input.action,
          status: receipt
            ? "already_processed"
            : input.action === "create"
            ? "created"
            : input.action === "archive"
            ? "archived"
            : "updated",
          category: categorySummary(category),
        },
        "category",
        category.id,
        [book.id, category.id],
        [
          input.action === "rename" ? "name" : input.action === "archive" ? "archived_at" : "name",
          "kind",
        ],
        input.action === "create" ? "create" : input.action === "archive" ? "archive" : "update",
      );
    },
  );
}

function normalizedRecording(input: RecordTransactionInput, book: Book): RecordTransactionInput {
  if (input.action === "single") {
    return { ...input, entry: normalizeLedgerEntry(input.entry, book) };
  }
  if (input.currency !== book.currency) {
    financeError("invalid_currency", "Currency must match the selected book.", 400);
  }
  const entries = input.entries.map((entry) => normalizeLedgerEntry(entry, book));
  const total = exactMoney(input.total_amount, book.minor_unit);
  const sum = entries.reduce((sum, entry) => sum + minorUnits(entry.amount, book.minor_unit), 0n);
  if (sum !== minorUnits(total, book.minor_unit)) {
    financeError(
      "component_total_mismatch",
      "Component amounts must exactly match the accepted total.",
    );
  }
  return { ...input, entries, total_amount: total };
}

export function recordTransaction(database: Database, identity: VerifiedIdentity, raw: unknown) {
  const input: RecordTransactionInput = parseLedgerInput(
    LEDGER_TOOL_SCHEMAS.record_transaction.input,
    raw,
  );
  return withFinanceMutation(
    database,
    identity,
    input,
    input.action === "single" ? "record_transaction" : "record_transaction_group",
    async (context) => {
      const value = normalizedRecording(input, context.book);
      const entries = value.action === "single" ? [value.entry] : value.entries;
      await validateEntries(context, entries);
      const { sql, workspaceId, book, receipt } = context;
      let groupId: string | null = null;
      if (value.action === "group") {
        groupId = receipt?.resource_ids[1] ?? crypto.randomUUID();
        if (receipt) {
          if (
            receipt.resource_ids.length !== entries.length + 2 ||
            receipt.resource_ids[0] !== book.id
          ) actionRetired();
          const [group] =
            await sql`SELECT id FROM finance.transaction_groups WHERE workspace_id = ${workspaceId} AND book_id = ${book.id} AND id = ${groupId} AND request_id = ${input.request_id}`;
          if (!group) actionRetired();
        } else {await sql`INSERT INTO finance.transaction_groups (id, workspace_id, book_id, currency, request_id, description, created_by_user_id, updated_by_user_id)
        VALUES (${groupId}, ${workspaceId}, ${book.id}, ${book.currency}, ${input.request_id}, ${value.description}, ${identity.user_id}, ${identity.user_id})`;}
      } else if (
        receipt && (receipt.resource_ids.length !== 2 || receipt.resource_ids[0] !== book.id)
      ) actionRetired();
      const rows: Posted[] = [];
      for (let index = 0; index < entries.length; index++) {
        const entry = entries[index];
        if (receipt) {
          const row = await recoverPosted(
            context,
            receipt.resource_ids[index + (groupId ? 2 : 1)],
            entry,
            groupId ? undefined : input.request_id,
          );
          if (groupId) {
            const [membership] =
              await sql`SELECT transaction_id FROM finance.transaction_classifications WHERE workspace_id = ${workspaceId} AND book_id = ${book.id} AND transaction_id = ${row.id} AND group_id = ${groupId} AND group_position = ${
                index + 1
              }`;
            if (!membership) actionRetired();
          }
          rows.push(row);
        } else {rows.push(
            await insertPosted(
              context,
              entry,
              groupId ? crypto.randomUUID() : input.request_id,
              groupId,
              groupId ? index + 1 : null,
            ),
          );}
      }
      const result = value.action === "single"
        ? {
          ...scope(context),
          status: receipt ? "already_processed" : "created",
          action: "single",
          entry: postedSummary(rows[0]),
        }
        : {
          ...scope(context),
          status: receipt ? "already_processed" : "created",
          action: "group",
          group_id: groupId!,
          entries: rows.map(postedSummary),
          total_amount: fromMinorUnits(
            rows.reduce((sum, row) => sum + minorUnits(row.amount, book.minor_unit), 0n),
            book.minor_unit,
          ),
          currency: book.currency,
        };
      return outcome(result, groupId ? "transaction_group" : "transaction", groupId ?? rows[0].id, [
        book.id,
        ...(groupId ? [groupId] : []),
        ...rows.map((row) => row.id),
      ], [
        "kind",
        "amount",
        "currency",
        "occurred_on",
        "source_account_id",
        "destination_account_id",
        "beneficiary_person_id",
        "category_id",
      ]);
    },
    normalizedRecording,
  );
}

export function correctTransaction(database: Database, identity: VerifiedIdentity, raw: unknown) {
  const input: CorrectTransactionInput = parseLedgerInput(
    LEDGER_TOOL_SCHEMAS.correct_transaction.input,
    raw,
  );
  const normalize = (value: CorrectTransactionInput, book: Book): CorrectTransactionInput => ({
    ...value,
    reconcile_allocations: value.reconcile_allocations.map((link) =>
      link.action === "replace"
        ? { ...link, amount: exactMoney(link.amount, book.minor_unit) }
        : link
    ),
    ...(value.action === "replace"
      ? { replacement: normalizeLedgerEntry(value.replacement, book) }
      : {}),
  });
  return withFinanceMutation(
    database,
    identity,
    input,
    input.action === "void" ? "void_transaction" : "replace_transaction",
    async (context) => {
      const value = normalize(input, context.book);
      const { book, receipt } = context;
      const previous = await readPosted(context, input.transaction_id, false);
      const entries = value.action === "replace" ? [value.replacement] : [];
      await lockFinanceAccounts(
        context,
        [
          previous.source_account_id,
          previous.destination_account_id,
          ...entries.flatMap(accountIds),
        ].filter((id): id is string => id !== null),
      );
      if (previous.beneficiary_person_id) {
        await checkFinancePeople(context, [
          previous.beneficiary_person_id,
        ], previous.beneficiary_person_id);
      }
      await validateEntries(context, entries);
      const current = await readPosted(context, previous.id);
      let replacement: Posted | null = null;
      if (receipt) {
        if (
          receipt.resource_ids[0] !== book.id || receipt.resource_ids[1] !== current.id ||
          current.voided_at === null || current.version !== input.expected_version + 1
        ) actionRetired();
        if (value.action === "replace") {
          if (receipt.resource_ids.length !== 3) actionRetired();
          replacement = await recoverPosted(
            context,
            receipt.resource_ids[2],
            value.replacement,
            input.request_id,
          );
          if (replacement.replaces_transaction_id !== current.id) actionRetired();
        } else if (receipt.resource_ids.length !== 2) actionRetired();
      } else {
        const revised = await reviseLedgerEntry(
          context,
          current.id,
          input.expected_version,
          input.reason,
          input.request_id,
          value.action === "replace" ? value.replacement : null,
          value.reconcile_allocations,
        );
        replacement = revised.replacement;
      }
      const result = value.action === "void"
        ? {
          ...scope(context),
          action: "void",
          status: receipt ? "already_processed" : "voided",
          transaction_id: current.id,
          version: input.expected_version + 1,
        }
        : {
          ...scope(context),
          action: "replace",
          status: receipt ? "already_processed" : "replaced",
          transaction_id: current.id,
          version: input.expected_version + 1,
          replacement: postedSummary(replacement!),
        };
      return outcome(
        result,
        "transaction",
        current.id,
        [book.id, current.id, ...(replacement ? [replacement.id] : [])],
        ["voided_at", "void_reason", "replaces_transaction_id"],
        value.action === "void" ? "void" : "correct",
      );
    },
    normalize,
  );
}

export function listTransactions(database: Database, identity: VerifiedIdentity, raw: unknown) {
  const input: ListTransactionsInput = parseLedgerInput(
    LEDGER_TOOL_SCHEMAS.list_transactions.input,
    raw,
  );
  return withFinanceRead(database, identity, input.workspace_id, input.book_id, async (context) => {
    const fingerprint = await financeFingerprint("list_transactions", {
      ...input,
      cursor: undefined,
      page_size: input.page_size ?? 50,
      state: input.state ?? "effective",
    });
    const cursor = decodeCursor(input.cursor, fingerprint);
    if (cursor) {
      try {
        validateDate(cursor.d);
      } catch {
        financeError("invalid_cursor", "The transaction continuation is invalid.", 400);
      }
    }
    const { sql, workspaceId, book } = context;
    if (input.account_id) await lockFinanceAccounts(context, [input.account_id]);
    if (input.category_id) await lockCategory(context, input.category_id);
    const limit = input.page_size ?? 50;
    const state = input.state ?? "effective";
    const hasCategory = Object.hasOwn(input, "category_id");
    const rows = await sql<
      (Posted & {
        category_id: string | null;
        category_name: string | null;
        classification_version: number;
        group_id: string | null;
        group_position: number | null;
        replacement_transaction_id: string | null;
      })[]
    >`
      SELECT t.id, t.request_id, t.kind, t.amount::text, t.currency, t.occurred_on::text, t.description,
        t.beneficiary_person_id, t.source_account_id, t.destination_account_id, t.version, t.voided_at, t.replaces_transaction_id,
        c.category_id, category.name AS category_name, COALESCE(c.version, 0) AS classification_version, c.group_id, c.group_position,
        replacement.id AS replacement_transaction_id
      FROM finance.transactions t LEFT JOIN finance.transaction_classifications c ON c.workspace_id = t.workspace_id AND c.book_id = t.book_id AND c.transaction_id = t.id
      LEFT JOIN finance.categories category ON category.workspace_id = c.workspace_id AND category.book_id = c.book_id AND category.id = c.category_id
      LEFT JOIN finance.transactions replacement ON replacement.workspace_id = t.workspace_id AND replacement.book_id = t.book_id AND replacement.replaces_transaction_id = t.id
      WHERE t.workspace_id = ${workspaceId} AND t.book_id = ${book.id} AND t.occurred_on >= ${input.from} AND t.occurred_on <= ${input.to}
        AND (${input.account_id ?? null}::uuid IS NULL OR t.source_account_id = ${
      input.account_id ?? null
    } OR t.destination_account_id = ${input.account_id ?? null})
        AND (NOT ${hasCategory} OR c.category_id IS NOT DISTINCT FROM ${
      input.category_id ?? null
    }::uuid)
        AND (${input.kind ?? null}::text IS NULL OR t.kind = ${input.kind ?? null})
        AND (${state} = 'all' OR (${state} = 'effective' AND t.voided_at IS NULL) OR (${state} = 'voided' AND t.voided_at IS NOT NULL))
        AND (${cursor?.i ?? null}::uuid IS NULL OR (t.occurred_on, t.id) > (${
      cursor?.d ?? null
    }::text::date, ${cursor?.i ?? null}::uuid))
      ORDER BY t.occurred_on, t.id LIMIT ${limit + 1}
    `;
    const page = rows.slice(0, limit);
    await lockFinanceAccounts(
      context,
      page.flatMap((row) => [row.source_account_id, row.destination_account_id]).filter((
        id,
      ): id is string => id !== null),
    );
    await checkFinancePeople(
      context,
      page.map((row) => row.beneficiary_person_id).filter((id): id is string => id !== null),
      null,
    );
    return {
      ...scope(context),
      from: input.from,
      to: input.to,
      entries: page.map((row) => ({
        ...postedSummary({ ...row, amount: storedMoney(row.amount, book.minor_unit, true) }),
        source_account_id: row.source_account_id,
        destination_account_id: row.destination_account_id,
        description: row.description,
        beneficiary_person_id: row.beneficiary_person_id,
        category_id: row.category_id,
        category_name: row.category_name,
        classification_version: row.classification_version,
        group_id: row.group_id,
        group_position: row.group_position,
        state: row.voided_at === null ? "effective" : "voided",
        replaces_transaction_id: row.replaces_transaction_id,
        replacement_transaction_id: row.replacement_transaction_id,
        version: row.version,
      })),
      next_cursor: rows.length > limit
        ? encodeCursor({ v: 2, s: fingerprint, d: page.at(-1)!.occurred_on, i: page.at(-1)!.id })
        : null,
    };
  });
}

export async function runLedgerTool(
  database: Database,
  identity: VerifiedIdentity,
  name: LedgerToolName,
  input: unknown,
): Promise<Record<string, unknown>> {
  switch (name) {
    case "configure_account":
      return await configureAccount(database, identity, input);
    case "manage_category":
      return await manageCategory(database, identity, input);
    case "record_transaction":
      return await recordTransaction(database, identity, input);
    case "correct_transaction":
      return await correctTransaction(database, identity, input);
    case "list_transactions":
      return await listTransactions(database, identity, input);
  }
}
