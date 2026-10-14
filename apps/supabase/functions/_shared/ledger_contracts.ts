import { z } from "zod";
import { normalizeMoney, supportedCurrency, validateDate } from "./finance_contracts.ts";
import { ApiError } from "./http.ts";

const uuid = z.string().uuid().transform((value) => value.toLowerCase());
const text = (limit: number) =>
  z.string().trim().min(1).refine((value) =>
    value.isWellFormed() && !value.includes("\0") && Array.from(value).length <= limit
  );
const date = z.string().refine((value) => {
  try {
    validateDate(value);
    return true;
  } catch {
    return false;
  }
});
const currency = z.string().refine((value) => {
  try {
    supportedCurrency(value);
    return true;
  } catch {
    return false;
  }
});
const money = z.string().max(128).refine((value) => {
  try {
    normalizeMoney(value, 4, true);
    return true;
  } catch {
    return false;
  }
});
const version = z.number().int().min(1).max(2147483646);
const scope = { workspace_id: uuid, book_id: uuid };
const mutation = { ...scope, request_id: uuid };
const status = z.enum([
  "created",
  "updated",
  "archived",
  "voided",
  "replaced",
  "already_processed",
]);
const accountKind = z.enum(["unknown", "cash", "bank", "investment", "credit_card", "loan"]);
const settlement = z.strictObject({ planned_item_line_id: uuid, amount: money });
const entryBase = {
  amount: money,
  currency,
  occurred_on: date,
  description: text(2000),
  beneficiary_person_id: uuid.nullable(),
  category_id: uuid.nullable(),
  settlement_links: z.array(settlement).max(10).optional(),
};
export const ledgerEntrySchema = z.discriminatedUnion("kind", [
  z.strictObject({ ...entryBase, kind: z.literal("income"), destination_account_id: uuid }),
  z.strictObject({ ...entryBase, kind: z.literal("expense"), source_account_id: uuid }),
  z.strictObject({
    ...entryBase,
    kind: z.literal("transfer"),
    source_account_id: uuid,
    destination_account_id: uuid,
    category_id: z.null(),
  })
    .refine((value) => value.source_account_id !== value.destination_account_id),
]);

const configureInput = z.strictObject({
  ...mutation,
  account_id: uuid,
  expected_version: version,
  account_kind: accountKind,
  opening_balance_on: date.nullable(),
});
const configureOutput = z.strictObject({
  ...scope,
  status,
  account_id: uuid,
  account_kind: accountKind,
  opening_balance_on: date.nullable(),
  version,
});
const categoryInput = z.discriminatedUnion("action", [
  z.strictObject({
    ...mutation,
    action: z.literal("create"),
    kind: z.enum(["income", "expense"]),
    name: text(200),
  }),
  z.strictObject({
    ...mutation,
    action: z.literal("rename"),
    category_id: uuid,
    expected_version: version,
    name: text(200),
  }),
  z.strictObject({
    ...mutation,
    action: z.literal("archive"),
    category_id: uuid,
    expected_version: version,
  }),
  z.strictObject({
    ...mutation,
    action: z.literal("classify"),
    transaction_id: uuid,
    category_id: uuid.nullable(),
    expected_version: z.number().int().min(0).max(2147483646),
  }),
  z.strictObject({
    ...scope,
    action: z.literal("list"),
    kind: z.enum(["income", "expense"]).optional(),
    include_archived: z.boolean().optional(),
    page_size: z.number().int().min(1).max(100).optional(),
    cursor: z.string().min(1).max(2048).optional(),
  }),
]);
const categorySummary = z.strictObject({
  category_id: uuid,
  name: z.string(),
  kind: z.enum(["income", "expense"]),
  version,
  archived: z.boolean(),
});
const categoryOutput = z.discriminatedUnion("action", [
  z.strictObject({ ...scope, action: z.literal("create"), status, category: categorySummary }),
  z.strictObject({ ...scope, action: z.literal("rename"), status, category: categorySummary }),
  z.strictObject({ ...scope, action: z.literal("archive"), status, category: categorySummary }),
  z.strictObject({
    ...scope,
    action: z.literal("classify"),
    status,
    transaction_id: uuid,
    category_id: uuid.nullable(),
    version,
  }),
  z.strictObject({
    ...scope,
    action: z.literal("list"),
    categories: z.array(categorySummary).max(100),
    next_cursor: z.string().nullable(),
  }),
]);
const recordInput = z.discriminatedUnion("action", [
  z.strictObject({ ...mutation, action: z.literal("single"), entry: ledgerEntrySchema }),
  z.strictObject({
    ...mutation,
    action: z.literal("group"),
    description: text(2000),
    currency,
    total_amount: money,
    entries: z.array(ledgerEntrySchema).min(2).max(10),
  }),
]);
const postedEntry = z.strictObject({
  transaction_id: uuid,
  request_id: uuid,
  kind: z.enum(["income", "expense", "transfer"]),
  amount: z.string(),
  currency,
  occurred_on: date,
});
const recordOutput = z.discriminatedUnion("action", [
  z.strictObject({ ...scope, status, action: z.literal("single"), entry: postedEntry }),
  z.strictObject({
    ...scope,
    status,
    action: z.literal("group"),
    group_id: uuid,
    entries: z.array(postedEntry).min(2).max(10),
    total_amount: z.string(),
    currency,
  }),
]);
export const allocationReconciliationSchema = z.discriminatedUnion("action", [
  z.strictObject({ allocation_id: uuid, expected_version: version, action: z.literal("revoke") }),
  z.strictObject({
    allocation_id: uuid,
    expected_version: version,
    action: z.literal("replace"),
    amount: money,
  }),
]);
const correctionBase = {
  ...mutation,
  transaction_id: uuid,
  expected_version: version,
  reason: text(2000),
  reconcile_allocations: z.array(allocationReconciliationSchema).max(100),
};
const correctionInput = z.discriminatedUnion("action", [
  z.strictObject({ ...correctionBase, action: z.literal("void") }),
  z.strictObject({
    ...correctionBase,
    action: z.literal("replace"),
    replacement: ledgerEntrySchema,
  }),
]);
const correctionOutput = z.discriminatedUnion("action", [
  z.strictObject({ ...scope, status, action: z.literal("void"), transaction_id: uuid, version }),
  z.strictObject({
    ...scope,
    status,
    action: z.literal("replace"),
    transaction_id: uuid,
    version,
    replacement: postedEntry,
  }),
]);
const listingInput = z.strictObject({
  ...scope,
  from: date,
  to: date,
  account_id: uuid.optional(),
  category_id: uuid.nullable().optional(),
  kind: z.enum(["income", "expense", "transfer"]).optional(),
  state: z.enum(["effective", "voided", "all"]).optional(),
  page_size: z.number().int().min(1).max(100).optional(),
  cursor: z.string().min(1).max(2048).optional(),
})
  .refine((value) =>
    value.from <= value.to &&
    Number(new Date(`${value.to}T00:00:00Z`)) - Number(new Date(`${value.from}T00:00:00Z`)) <=
      3660 * 86400000
  );
const listedEntry = postedEntry.extend({
  source_account_id: uuid.nullable(),
  destination_account_id: uuid.nullable(),
  description: z.string(),
  beneficiary_person_id: uuid.nullable(),
  category_id: uuid.nullable(),
  category_name: z.string().nullable(),
  classification_version: z.number().int().min(0),
  group_id: uuid.nullable(),
  group_position: z.number().int().min(1).max(10).nullable(),
  state: z.enum(["effective", "voided"]),
  replaces_transaction_id: uuid.nullable(),
  replacement_transaction_id: uuid.nullable(),
  version,
});
const listingOutput = z.strictObject({
  ...scope,
  from: date,
  to: date,
  entries: z.array(listedEntry).max(100),
  next_cursor: z.string().nullable(),
});

export const LEDGER_TOOL_SCHEMAS = {
  configure_account: { input: configureInput, output: configureOutput },
  manage_category: { input: categoryInput, output: categoryOutput },
  record_transaction: { input: recordInput, output: recordOutput },
  correct_transaction: { input: correctionInput, output: correctionOutput },
  list_transactions: { input: listingInput, output: listingOutput },
} as const;
export type LedgerToolName = keyof typeof LEDGER_TOOL_SCHEMAS;
export type LedgerEntry = z.infer<typeof ledgerEntrySchema>;
export type ConfigureAccountInput = z.infer<typeof configureInput>;
export type ManageCategoryInput = z.infer<typeof categoryInput>;
export type RecordTransactionInput = z.infer<typeof recordInput>;
export type CorrectTransactionInput = z.infer<typeof correctionInput>;
export type ListTransactionsInput = z.infer<typeof listingInput>;
export type AllocationReconciliation = z.infer<typeof allocationReconciliationSchema>;

export function parseLedgerInput<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    throw new ApiError(
      400,
      "invalid_input",
      "The ledger request contains invalid or unsupported values.",
    );
  }
  return parsed.data;
}
