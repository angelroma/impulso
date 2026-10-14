import { z } from "zod";
import { validateDate } from "./finance_contracts.ts";
import { ApiError } from "./http.ts";
import { allocationReconciliationSchema, ledgerEntrySchema } from "./ledger_contracts.ts";
import { expectedPlanFields } from "./planning_contracts.ts";

const id = z.uuid().transform((value) => value.toLowerCase());
const date = z.string().refine((value) => {
  try {
    validateDate(value);
    return true;
  } catch {
    return false;
  }
});
const period = date.refine((value) => value.endsWith("-01"));
const text = (max: number) =>
  z.string().max(max).refine((value) => value.isWellFormed() && !value.includes("\0"));
const version = z.number().int().min(1).max(2147483646);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const cell = z.string().regex(/^[A-Z]{1,4}[1-9][0-9]{0,6}$/);
const sheetId = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const scope = { workspace_id: id, book_id: id };
export const importCoverageSchema = z.strictObject({
  authority: z.enum(["detail", "summary"]),
  expected_version: z.number().int().min(0).max(2147483646),
  reviewed_detail_count: z.number().int().min(0),
  reviewed_detail_digest: digest,
  accepted: z.boolean(),
});
const mapping = z.discriminatedUnion("role", [
  z.strictObject({ role: z.literal("unknown"), accepted: z.boolean() }),
  z.strictObject({ role: z.literal("reference"), accepted: z.boolean() }),
  z.strictObject({
    role: z.literal("actual_detail"),
    accepted: z.boolean(),
    entry: ledgerEntrySchema,
    coverage: importCoverageSchema.nullable(),
  }),
  z.strictObject({
    role: z.literal("actual_summary"),
    accepted: z.boolean(),
    kind: z.enum(["income", "expense"]),
    category_id: id.nullable(),
    coverage_scope: z.enum(["complete", "partial", "unknown"]),
    coverage: importCoverageSchema,
  }),
  z.strictObject({ role: z.literal("planned"), accepted: z.boolean(), ...expectedPlanFields }),
  z.strictObject({
    role: z.literal("opening_balance"),
    accepted: z.boolean(),
    account_id: id,
    opening_balance_on: date,
  }),
  z.strictObject({
    role: z.literal("valuation"),
    accepted: z.boolean(),
    asset_id: id.nullable(),
    account_id: id.nullable(),
    valued_on: date,
    source: text(2000).min(1),
  }).refine((value) => (value.asset_id === null) !== (value.account_id === null)),
]);
const sourceRow = z.strictObject({
  sheet_id: sheetId,
  source_cell: cell,
  period_start: period.nullable(),
  date_precision: z.enum(["day", "month", "unknown"]),
  observed_on: date.nullable(),
  original_text: text(2000),
  displayed_value: text(2000),
  raw_value: text(2000).nullable(),
  formula: text(2000).nullable(),
  selected: z.boolean(),
  parser: z.enum(["plain", "en_US", "es_ES"]),
  amount_sign: z.enum(["preserve", "absolute"]).optional(),
  currency: z.string().regex(/^[A-Z]{3}$/).nullable(),
  mapping,
  expected_targets: z.array(
    z.strictObject({
      type: z.enum(["account", "category", "asset", "plan_line"]),
      id,
      expected_version: version,
    }),
  ).max(24),
  replacement: z.strictObject({
    row_id: id,
    expected_version: version,
    expected_result_version: version,
    reason: text(2000).min(1),
    reconcile_allocations: z.array(allocationReconciliationSchema).max(100),
    prior_coverage: importCoverageSchema.nullable(),
  }).nullable(),
});
const sourceCell = z.strictObject({ sheet_id: sheetId, source_cell: cell });
const manifest = z.strictObject({
  workbook_id: text(200).min(1),
  source_version: text(200).min(1),
  captured_at: z.iso.datetime({ offset: true }),
  sheets: z.array(z.strictObject({
    sheet_id: sheetId,
    title: text(200),
    visibility: z.enum(["visible", "hidden"]),
    source_kind: z.enum(["active", "derived", "backup"]),
    selection: z.enum(["exclude", "authoritative", "reference"]),
    acknowledged_overlap: z.boolean(),
    ranges: z.array(z.string().regex(/^[A-Z]{1,4}[1-9][0-9]{0,6}(?::[A-Z]{1,4}[1-9][0-9]{0,6})?$/))
      .max(100),
  })).min(1).max(100),
  rows: z.array(sourceRow).max(100),
  reconciliation: z.strictObject({
    annual_net: text(128).nullable(),
    monthly_net: text(128).nullable(),
    missing_annual_cells: z.array(sourceCell).max(100),
    resolution: z.enum(["unresolved", "exclude_disputed"]),
    excluded_cells: z.array(sourceCell).max(100),
    accepted: z.boolean(),
  }),
});
const previewInput = z.strictObject({ ...scope, request_id: id, manifest });
const commitInput = z.strictObject({
  ...scope,
  request_id: id,
  batch_id: id,
  expected_version: version,
  review_digest: digest,
  accepted: z.literal(true),
});
const getInput = z.strictObject({
  ...scope,
  batch_id: id,
  limit: z.number().int().min(1).max(100).optional(),
  cursor: z.string().min(1).max(2048).optional(),
});
const role = z.enum([
  "actual_detail",
  "actual_summary",
  "planned",
  "opening_balance",
  "valuation",
  "reference",
  "unknown",
]);
const rowOutput = z.strictObject({
  row_id: id,
  row_number: z.number().int().min(1).max(100),
  sheet_id: sheetId,
  source_cell: cell,
  period_start: period.nullable(),
  original_text: z.string(),
  displayed_value: z.string(),
  role,
  accepted: z.boolean(),
  amount: z.string().nullable(),
  blockers: z.array(z.string()).max(100),
  consumed: z.boolean(),
  retired: z.boolean(),
  version,
  result: z.strictObject({
    transaction_id: id.nullable(),
    planned_item_id: id.nullable(),
    summary_id: id.nullable(),
    valuation_id: id.nullable(),
    account_id: id.nullable(),
  }),
  current_coverage: z.strictObject({
    version: z.number().int().min(0),
    detail_count: z.number().int().min(0),
    detail_digest: digest,
  }).nullable(),
  existing_source: z.strictObject({
    row_id: id,
    batch_id: id,
    version,
    role,
    result_version: version.nullable(),
  }).nullable(),
});
const reconciliationOutput = z.strictObject({
  annual_net: z.string().nullable(),
  monthly_net: z.string().nullable(),
  difference: z.string().nullable(),
  missing_annual_cells: z.array(sourceCell).max(100),
  unresolved: z.boolean(),
  resolution: z.enum(["unresolved", "exclude_disputed"]),
  excluded_cells: z.array(sourceCell).max(100),
  verified_savings: z.literal(false),
});
const batchOutput = z.strictObject({
  ...scope,
  batch_id: id,
  status: z.enum(["draft", "ready", "committed", "retired"]),
  action_status: z.enum(["created", "committed", "already_processed", "read"]),
  version,
  review_digest: digest,
  blockers: z.array(z.string()).max(1000),
  reconciliation: reconciliationOutput,
  workbook_id: z.string(),
  source_version: z.string(),
  captured_at: z.string(),
  row_count: z.number().int().min(0).max(100),
  rows: z.array(rowOutput).max(100),
  next_cursor: z.string().nullable(),
  coverage: z.strictObject({
    selected_rows: z.number().int().min(0).max(100),
    excluded_rows: z.number().int().min(0).max(100),
    committed_rows: z.number().int().min(0).max(100),
    remaining_rows: z.number().int().min(0).max(100),
    whole_workbook_complete: z.literal(false),
  }),
});
export const IMPORT_TOOL_SCHEMAS = {
  preview_finance_import: { input: previewInput, output: batchOutput },
  commit_finance_import: { input: commitInput, output: batchOutput },
  get_finance_import: { input: getInput, output: batchOutput },
} as const;
export type ImportToolName = keyof typeof IMPORT_TOOL_SCHEMAS;
export type ImportManifest = z.infer<typeof manifest>;
export type ImportSourceRow = z.infer<typeof sourceRow>;
export type ImportMapping = z.infer<typeof mapping>;
export type ImportCoverage = z.infer<typeof importCoverageSchema>;
export type PreviewImportInput = z.infer<typeof previewInput>;
export type CommitImportInput = z.infer<typeof commitInput>;
export type GetImportInput = z.infer<typeof getInput>;
export function parseImportInput<T>(schema: z.ZodType<T>, raw: unknown): T {
  let size: number;
  try {
    size = new TextEncoder().encode(JSON.stringify(raw)).length;
  } catch {
    throw new ApiError(400, "invalid_input", "A serializable import request is required.");
  }
  if (size > 32768) {
    throw new ApiError(413, "request_too_large", "Import requests cannot exceed 32 KiB.");
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new ApiError(
      400,
      "invalid_input",
      "The import request contains invalid or unsupported values.",
    );
  }
  return result.data;
}
