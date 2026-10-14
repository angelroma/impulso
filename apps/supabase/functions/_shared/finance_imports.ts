import type { VerifiedIdentity } from "./auth.ts";
import type { Database } from "./database.ts";
import { type Book, storedMoney } from "./finance.ts";
import { normalizeMoney, supportedCurrency } from "./finance_contracts.ts";
import {
  actionRetired,
  assertVersion,
  checkFinancePeople,
  exactMoney,
  type FinanceActionContext,
  financeError,
  financeFingerprint,
  fromMinorUnits,
  lockFinanceAccounts,
  minorUnits,
  withFinanceMutation,
  withFinanceRead,
} from "./finance_common.ts";
import {
  type CommitImportInput,
  type GetImportInput,
  IMPORT_TOOL_SCHEMAS,
  type ImportCoverage,
  type ImportManifest,
  type ImportSourceRow,
  type ImportToolName,
  parseImportInput,
  type PreviewImportInput,
} from "./import_contracts.ts";
import { normalizeLedgerEntry, postLedgerEntry, reviseLedgerEntry } from "./ledger.ts";
import { createImportedPlan, createImportedValuation, retireImportedPlan } from "./planning.ts";
import { ApiError } from "./http.ts";

interface Batch {
  id: string;
  actor_user_id: string;
  workbook_id: string;
  source_version: string;
  captured_at: Date;
  manifest: ImportManifest;
  review_digest: string;
  status: "draft" | "ready" | "committed" | "retired";
  blockers: string[];
  reconciliation: ReturnType<typeof reconcileManifest>;
  version: number;
}
interface ImportRow {
  id: string;
  batch_id: string;
  row_number: number;
  sheet_id: string;
  source_cell: string;
  period_start: string | null;
  source_key: string;
  source_digest: string;
  source_snapshot: ImportSourceRow;
  mapping: ImportSourceRow["mapping"];
  role: ImportSourceRow["mapping"]["role"];
  amount: string | null;
  blockers: string[];
  accepted: boolean;
  consumed_at: Date | null;
  retired_at: Date | null;
  version: number;
  created_by_user_id: string | null;
  result_transaction_id: string | null;
  result_planned_item_id: string | null;
  result_summary_id: string | null;
  result_valuation_id: string | null;
  result_account_id: string | null;
  replaces_row_id: string | null;
}
interface CoverageState {
  version: number;
  detail_count: number;
  detail_digest: string;
}
interface PreparedRow {
  source: ImportSourceRow;
  amount: string | null;
  blockers: string[];
  sourceKey: string;
  sourceDigest: string;
  existing: ImportRow | null;
  currentCoverage: CoverageState | null;
}

export function parseSourceMoney(
  value: string,
  rule: "plain" | "en_US" | "es_ES",
  precision: number,
  signRule: "preserve" | "absolute" = "preserve",
): string {
  let exact = value.trim();
  if (rule === "en_US") {
    if (!/^-?(?:\d+|[1-9]\d{0,2}(?:,\d{3})+)(?:\.\d+)?$/.test(exact)) {
      financeError(
        "ambiguous_source_amount",
        "The value does not match its accepted parsing rule.",
        400,
      );
    }
    exact = exact.replaceAll(",", "");
  } else if (rule === "es_ES") {
    if (!/^-?(?:\d+|[1-9]\d{0,2}(?:\.\d{3})+)(?:,\d+)?$/.test(exact)) {
      financeError(
        "ambiguous_source_amount",
        "The value does not match its accepted parsing rule.",
        400,
      );
    }
    exact = exact.replaceAll(".", "").replace(",", ".");
  }
  const normalized = normalizeMoney(exact, precision, false);
  return signRule === "absolute" && normalized.startsWith("-") ? normalized.slice(1) : normalized;
}

export function reconcileManifest(manifest: ImportManifest, precision: number) {
  const input = manifest.reconciliation;
  const annual = input.annual_net === null
    ? null
    : parseSourceMoney(input.annual_net, "plain", precision);
  const monthly = input.monthly_net === null
    ? null
    : parseSourceMoney(input.monthly_net, "plain", precision);
  const difference = annual === null || monthly === null
    ? null
    : fromMinorUnits(minorUnits(annual, precision) - minorUnits(monthly, precision), precision);
  return {
    annual_net: annual,
    monthly_net: monthly,
    difference,
    missing_annual_cells: input.missing_annual_cells,
    unresolved: (difference !== null && minorUnits(difference, precision) !== 0n) ||
      input.missing_annual_cells.length > 0,
    resolution: input.resolution,
    excluded_cells: input.excluded_cells,
    verified_savings: false as const,
  };
}

export function stableSourceKey(
  workbook: string,
  row: Pick<ImportSourceRow, "sheet_id" | "source_cell" | "period_start">,
): string {
  return JSON.stringify([workbook, row.sheet_id, row.source_cell, row.period_start]);
}
function coordinates(cell: string): [number, number] {
  const match = /^([A-Z]+)([0-9]+)$/.exec(cell)!;
  return [
    Array.from(match[1]).reduce((value, letter) => value * 26 + letter.charCodeAt(0) - 64, 0),
    Number(match[2]),
  ];
}
function inRanges(cell: string, ranges: readonly string[]): boolean {
  const [column, row] = coordinates(cell);
  return ranges.some((range) => {
    const [first, last = first] = range.split(":");
    const [a, b] = coordinates(first), [c, d] = coordinates(last);
    return column >= a && column <= c && row >= b && row <= d;
  });
}
const selected = (manifest: ImportManifest, row: ImportSourceRow) =>
  row.selected && manifest.sheets.find((sheet) =>
      sheet.sheet_id === row.sheet_id
    )?.selection === "authoritative" &&
  row.mapping.role !== "reference" && !manifest.reconciliation.excluded_cells.some((cell) =>
    cell.sheet_id === row.sheet_id && cell.source_cell === row.source_cell
  );
const scope = (ctx: FinanceActionContext) => ({
  workspace_id: ctx.workspaceId,
  book_id: ctx.book.id,
});

async function readBatch(ctx: FinanceActionContext, id: string): Promise<Batch> {
  const { sql } = ctx;
  const [batch] = await sql<
    Batch[]
  >`SELECT id, actor_user_id, workbook_id, source_version, captured_at, manifest,
    pg_catalog.encode(review_digest, 'hex') AS review_digest, status, blockers, reconciliation, version
    FROM finance.import_batches WHERE workspace_id = ${ctx.workspaceId} AND book_id = ${ctx.book.id} AND id = ${id} FOR UPDATE`;
  if (!batch || batch.actor_user_id !== ctx.identity.user_id) {
    financeError("import_access_denied", "Access to this import is denied.", 403);
  }
  if (batch.status === "retired") actionRetired();
  return batch;
}

async function batchRows(ctx: FinanceActionContext, batchId: string): Promise<ImportRow[]> {
  const { sql } = ctx;
  return await sql<
    ImportRow[]
  >`SELECT id, batch_id, row_number, sheet_id::text, source_cell, period_start::text, source_key,
    pg_catalog.encode(source_digest, 'hex') AS source_digest, source_snapshot, mapping, role, amount::text,
    blockers, accepted, consumed_at, retired_at, version, created_by_user_id, result_transaction_id,
    result_planned_item_id, result_summary_id, result_valuation_id, result_account_id, replaces_row_id
    FROM finance.import_rows WHERE workspace_id = ${ctx.workspaceId} AND book_id = ${ctx.book.id} AND batch_id = ${batchId} ORDER BY row_number FOR UPDATE`;
}

async function consumedSource(
  ctx: FinanceActionContext,
  workbook: string,
  row: ImportSourceRow,
): Promise<ImportRow | null> {
  const { sql } = ctx;
  const [existing] = await sql<
    ImportRow[]
  >`SELECT id, batch_id, row_number, sheet_id::text, source_cell, period_start::text, source_key,
    pg_catalog.encode(source_digest, 'hex') AS source_digest, source_snapshot, mapping, role, amount::text, blockers,
    accepted, consumed_at, retired_at, version, created_by_user_id, result_transaction_id, result_planned_item_id,
    result_summary_id, result_valuation_id, result_account_id, replaces_row_id
    FROM finance.import_rows WHERE workspace_id = ${ctx.workspaceId} AND book_id = ${ctx.book.id}
      AND workbook_id = ${workbook} AND sheet_id = ${row.sheet_id} AND source_cell = ${row.source_cell}
      AND period_start IS NOT DISTINCT FROM ${row.period_start}::text::date
      AND consumed_at IS NOT NULL AND retired_at IS NULL FOR UPDATE`;
  return existing ?? null;
}

export async function importCoverageState(
  ctx: FinanceActionContext,
  period: string,
  kind: string,
  categoryId: string | null,
): Promise<CoverageState> {
  const { sql } = ctx;
  const [coverage] = await sql<
    { version: number }[]
  >`SELECT version FROM finance.report_coverage WHERE workspace_id = ${ctx.workspaceId} AND book_id = ${ctx.book.id}
    AND period_start = ${period}::date AND kind = ${kind} AND category_id IS NOT DISTINCT FROM ${categoryId}::uuid FOR UPDATE`;
  const [detail] = await sql<
    { detail_count: number; detail_digest: string }[]
  >`SELECT count(*)::int AS detail_count,
    pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(coalesce(string_agg(t.id::text || ':' || t.version::text || ':' || coalesce(c.version, 0)::text, ',' ORDER BY t.id), ''), 'UTF8')), 'hex') AS detail_digest
    FROM finance.transactions t LEFT JOIN finance.transaction_classifications c ON c.workspace_id = t.workspace_id AND c.book_id = t.book_id AND c.transaction_id = t.id
    WHERE t.workspace_id = ${ctx.workspaceId} AND t.book_id = ${ctx.book.id} AND t.voided_at IS NULL AND t.kind = ${kind}
      AND date_trunc('month', t.occurred_on::timestamp)::date = ${period}::date AND c.category_id IS NOT DISTINCT FROM ${categoryId}::uuid`;
  return { version: coverage?.version ?? 0, ...detail };
}

function coverageKey(
  row: ImportSourceRow,
): { period: string; kind: string; category: string | null; review: ImportCoverage | null } | null {
  if (row.mapping.role === "actual_summary" && row.period_start) {
    return {
      period: row.period_start,
      kind: row.mapping.kind,
      category: row.mapping.category_id,
      review: row.mapping.coverage,
    };
  }
  if (row.mapping.role === "actual_detail" && row.mapping.entry.kind !== "transfer") {
    return {
      period: `${row.mapping.entry.occurred_on.slice(0, 7)}-01`,
      kind: row.mapping.entry.kind,
      category: row.mapping.entry.category_id,
      review: row.mapping.coverage,
    };
  }
  return null;
}

async function validateTargets(
  ctx: FinanceActionContext,
  source: ImportSourceRow,
  checkVersions = true,
): Promise<void> {
  const required = new Map<string, "account" | "category" | "asset" | "plan_line">();
  const categoryKinds = new Map<string, string>();
  const requireCategory = (id: string, kind: string) => {
    if (categoryKinds.has(id) && categoryKinds.get(id) !== kind) {
      financeError(
        "category_kind_mismatch",
        "One category cannot represent different financial kinds.",
      );
    }
    required.set(id, "category");
    categoryKinds.set(id, kind);
  };
  const mapping = source.mapping;
  if (mapping.role === "actual_detail") {
    const entry = mapping.entry;
    if ("source_account_id" in entry) required.set(entry.source_account_id, "account");
    if ("destination_account_id" in entry) required.set(entry.destination_account_id, "account");
    if (entry.category_id) requireCategory(entry.category_id, entry.kind);
    for (const link of entry.settlement_links ?? []) {
      required.set(link.planned_item_line_id, "plan_line");
    }
    if (entry.beneficiary_person_id) {
      await checkFinancePeople(ctx, [entry.beneficiary_person_id], entry.beneficiary_person_id);
    }
  } else if (mapping.role === "actual_summary" && mapping.category_id) {
    requireCategory(mapping.category_id, mapping.kind);
  } else if (mapping.role === "opening_balance") required.set(mapping.account_id, "account");
  else if (mapping.role === "valuation") {
    if (mapping.account_id) required.set(mapping.account_id, "account");
    if (mapping.asset_id) required.set(mapping.asset_id, "asset");
  } else if (mapping.role === "planned") {
    if (mapping.debt_account_id) required.set(mapping.debt_account_id, "account");
    for (const line of mapping.lines) {
      if (line.source_account_id) required.set(line.source_account_id, "account");
      if (line.destination_account_id) required.set(line.destination_account_id, "account");
      if (line.category_id) requireCategory(line.category_id, line.kind);
      if (line.beneficiary_person_id) {
        await checkFinancePeople(ctx, [line.beneficiary_person_id], line.beneficiary_person_id);
      }
    }
  }
  if (
    new Set(source.expected_targets.map((target) => `${target.type}:${target.id}`)).size !==
      source.expected_targets.length || required.size !== source.expected_targets.length
  ) {
    financeError(
      "target_review_required",
      "Review the exact destination resources and their versions.",
    );
  }
  const accounts = await lockFinanceAccounts(
    ctx,
    [...required].filter(([, type]) => type === "account").map(([id]) => id),
  );
  if (mapping.role === "actual_detail") {
    for (const account of accounts.values()) {
      if (
        account.opening_balance_on !== null &&
        mapping.entry.occurred_on < account.opening_balance_on
      ) {
        financeError(
          "opening_boundary_conflict",
          "The imported movement precedes an accepted opening date.",
        );
      }
    }
  }
  for (
    const target of [...source.expected_targets].sort((a, b) =>
      a.type.localeCompare(b.type) || a.id.localeCompare(b.id)
    )
  ) {
    if (required.get(target.id) !== target.type) {
      financeError(
        "target_review_required",
        "The reviewed destinations do not match the source mapping.",
      );
    }
    if (target.type === "account") {
      if (checkVersions) assertVersion(accounts.get(target.id)!.version, target.expected_version);
      continue;
    }
    const { sql } = ctx;
    if (target.type === "plan_line") {
      const [line] =
        await sql`SELECT l.version, l.retired_at, p.canceled_at FROM finance.planned_item_lines l
        JOIN finance.planned_items p ON p.workspace_id = l.workspace_id AND p.book_id = l.book_id AND p.id = l.planned_item_id
        WHERE l.workspace_id = ${ctx.workspaceId} AND l.book_id = ${ctx.book.id} AND l.id = ${target.id} FOR UPDATE OF l, p`;
      if (!line) {
        financeError("target_access_denied", "Access to this expected component is denied.", 403);
      }
      if (line.retired_at !== null || line.canceled_at !== null) actionRetired();
      if (checkVersions) assertVersion(line.version, target.expected_version);
      continue;
    }
    const rows = target.type === "category"
      ? await sql`SELECT version, archived_at, currency, kind FROM finance.categories WHERE workspace_id = ${ctx.workspaceId} AND book_id = ${ctx.book.id} AND id = ${target.id} FOR UPDATE`
      : await sql`SELECT version, archived_at, currency, person_id FROM finance.assets WHERE workspace_id = ${ctx.workspaceId} AND book_id = ${ctx.book.id} AND id = ${target.id} FOR UPDATE`;
    if (!rows[0] || rows[0].currency !== ctx.book.currency) {
      financeError("target_access_denied", "Access to this destination is denied.", 403);
    }
    if (rows[0].archived_at !== null) {
      financeError("target_archived", "This destination is archived.");
    }
    if (checkVersions) assertVersion(rows[0].version, target.expected_version);
    if (target.type === "category" && rows[0].kind !== categoryKinds.get(target.id)) {
      financeError("category_kind_mismatch", "The category kind must match its financial mapping.");
    }
    if (target.type === "asset" && rows[0].person_id) {
      await checkFinancePeople(ctx, [rows[0].person_id], null);
    }
  }
}

function normalizeSource(source: ImportSourceRow, book: Book): ImportSourceRow {
  const mapping = source.mapping;
  if (mapping.role === "actual_detail") {
    return { ...source, mapping: { ...mapping, entry: normalizeLedgerEntry(mapping.entry, book) } };
  }
  if (mapping.role === "planned") {
    return {
      ...source,
      mapping: {
        ...mapping,
        quoted_total: mapping.quoted_total === null
          ? null
          : exactMoney(mapping.quoted_total, book.minor_unit),
        lines: mapping.lines.map((line) => ({
          ...line,
          amount: exactMoney(line.amount, book.minor_unit),
        })),
      },
    };
  }
  return source;
}

async function prepareRow(
  ctx: FinanceActionContext,
  manifest: ImportManifest,
  raw: ImportSourceRow,
): Promise<PreparedRow> {
  const sourceKey = stableSourceKey(manifest.workbook_id, raw);
  const sourceDigest = await financeFingerprint("import_source", {
    source_version: manifest.source_version,
    sheet_id: raw.sheet_id,
    source_cell: raw.source_cell,
    period_start: raw.period_start,
    date_precision: raw.date_precision,
    observed_on: raw.observed_on,
    original_text: raw.original_text,
    displayed_value: raw.displayed_value,
    raw_value: raw.raw_value,
    formula: raw.formula,
    parser: raw.parser,
    amount_sign: raw.amount_sign ?? "preserve",
    currency: raw.currency,
  });
  const result: PreparedRow = {
    source: raw,
    amount: null,
    blockers: [],
    sourceKey,
    sourceDigest,
    existing: null,
    currentCoverage: null,
  };
  if (!selected(manifest, raw)) return result;
  const sheet = manifest.sheets.find((sheet) => sheet.sheet_id === raw.sheet_id)!;
  const block = (code: string) => {
    if (!result.blockers.includes(code)) result.blockers.push(code);
  };
  result.existing = await consumedSource(ctx, manifest.workbook_id, raw);
  if (
    result.existing?.created_by_user_id !== undefined &&
    result.existing.created_by_user_id !== ctx.identity.user_id
  ) {
    block("source_already_consumed");
    result.existing = null;
  }
  let duplicate = false;
  if (!inRanges(raw.source_cell, sheet.ranges)) block("source_range_not_accepted");
  if (
    (sheet.source_kind === "backup" || sheet.visibility === "hidden") && !sheet.acknowledged_overlap
  ) block("backup_selection_requires_review");
  if (sheet.source_kind === "derived") block("derived_source_cannot_post");
  if (!raw.mapping.accepted) block("mapping_not_accepted");
  if (raw.mapping.role === "unknown") block("financial_role_unknown");
  if (raw.currency === null) block("currency_unknown");
  else {
    try {
      supportedCurrency(raw.currency);
      if (raw.currency !== ctx.book.currency) block("currency_mismatch");
    } catch {
      block("currency_unsupported");
    }
  }
  try {
    if (raw.raw_value === null && raw.displayed_value.trim() === "") block("source_value_missing");
    else {result.amount = parseSourceMoney(
        raw.raw_value ?? raw.displayed_value,
        raw.parser,
        ctx.book.minor_unit,
        raw.amount_sign ?? "preserve",
      );}
    result.source = normalizeSource(raw, ctx.book);
    duplicate = result.existing !== null && raw.replacement === null &&
      result.existing.source_digest === sourceDigest &&
      await financeFingerprint("import_mapping", result.existing.mapping) ===
        await financeFingerprint("import_mapping", result.source.mapping);
    await validateTargets(ctx, result.source, !duplicate);
    const mapping = result.source.mapping;
    if (mapping.role === "actual_detail") {
      if (result.amount !== mapping.entry.amount) block("source_mapping_amount_mismatch");
      if (
        raw.period_start && mapping.entry.occurred_on.slice(0, 7) !== raw.period_start.slice(0, 7)
      ) block("source_period_mismatch");
      if (raw.date_precision !== "day" || raw.observed_on !== mapping.entry.occurred_on) {
        block("actual_detail_requires_observed_date");
      }
    } else if (mapping.role === "actual_summary") {
      if (!raw.period_start) block("source_period_missing");
      if (mapping.coverage_scope !== "complete") block("summary_coverage_incomplete");
      if (result.amount && minorUnits(result.amount, ctx.book.minor_unit) < 0n) {
        block("summary_amount_negative");
      }
    } else if (mapping.role === "planned") {
      if (raw.period_start === null || mapping.period_start !== raw.period_start) {
        block("source_period_mismatch");
      }
      if (mapping.quoted_total === null || result.amount !== mapping.quoted_total) {
        block("source_mapping_amount_mismatch");
      }
      if (
        mapping.components_resolved &&
        mapping.lines.reduce(
            (sum, line) => sum + minorUnits(line.amount, ctx.book.minor_unit),
            0n,
          ) !==
          minorUnits(mapping.quoted_total ?? "0", ctx.book.minor_unit)
      ) block("component_total_mismatch");
      if (!mapping.components_resolved && mapping.lines.length) {
        block("unresolved_components_have_lines");
      }
    } else if (mapping.role === "opening_balance") {
      const account = (await lockFinanceAccounts(ctx, [mapping.account_id])).get(
        mapping.account_id,
      )!;
      if (
        result.amount !== storedMoney(account.opening_balance, ctx.book.minor_unit, false) ||
        account.opening_balance_on !== mapping.opening_balance_on
      ) block("immutable_opening_requires_reconciliation");
    } else if (mapping.role === "valuation") {
      if (result.amount && minorUnits(result.amount, ctx.book.minor_unit) < 0n) {
        block("valuation_amount_negative");
      }
      if (
        mapping.account_id &&
        (await lockFinanceAccounts(ctx, [mapping.account_id])).get(mapping.account_id)!
            .account_kind !== "investment"
      ) block("valuation_target_ineligible");
    }
    const key = coverageKey(result.source);
    if (key) {
      result.currentCoverage = await importCoverageState(ctx, key.period, key.kind, key.category);
      const { sql } = ctx;
      const [summary] =
        await sql`SELECT id FROM finance.monthly_summaries WHERE workspace_id = ${ctx.workspaceId} AND book_id = ${ctx.book.id} AND period_start = ${key.period}::date AND kind = ${key.kind} AND category_id IS NOT DISTINCT FROM ${key.category}::uuid AND retired_at IS NULL LIMIT 1`;
      if (duplicate) {
        await currentResult(ctx, result.existing!);
      } else if (key.review) {
        if (
          !key.review.accepted || key.review.expected_version !== result.currentCoverage.version ||
          key.review.reviewed_detail_count !== result.currentCoverage.detail_count ||
          key.review.reviewed_detail_digest !== result.currentCoverage.detail_digest
        ) block("coverage_review_required");
      } else if (summary || result.currentCoverage.version > 0) block("coverage_review_required");
    }
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 401 || error.status === 403) throw error;
      block(error.code);
    } else throw error;
  }
  if (result.existing) {
    const existing = result.existing;
    if (existing.created_by_user_id !== ctx.identity.user_id) {
      block("source_already_consumed");
      result.existing = null;
    } else if (raw.replacement) {
      if (
        raw.replacement.row_id !== existing.id ||
        raw.replacement.expected_version !== existing.version
      ) block("source_replacement_stale");
      const priorKey = coverageKey(existing.source_snapshot), nextKey = coverageKey(result.source);
      if (
        priorKey &&
        JSON.stringify([priorKey.period, priorKey.kind, priorKey.category]) !==
          JSON.stringify(nextKey ? [nextKey.period, nextKey.kind, nextKey.category] : null)
      ) {
        const review = raw.replacement.prior_coverage;
        const state = await importCoverageState(
          ctx,
          priorKey.period,
          priorKey.kind,
          priorKey.category,
        );
        if (
          !review?.accepted || review.expected_version !== state.version ||
          review.reviewed_detail_count !== state.detail_count ||
          review.reviewed_detail_digest !== state.detail_digest
        ) block("prior_coverage_review_required");
      }
    } else if (
      existing.source_digest !== sourceDigest ||
      await financeFingerprint("import_mapping", existing.mapping) !==
        await financeFingerprint("import_mapping", result.source.mapping)
    ) block("source_replacement_required");
  } else if (raw.replacement) block("source_replacement_missing");
  return result;
}

function cursorFor(ctx: FinanceActionContext, batch: Batch, row: number, limit: number): string {
  return btoa(
    JSON.stringify({
      b: batch.id,
      u: ctx.identity.user_id,
      d: batch.review_digest,
      v: batch.version,
      r: row,
      l: limit,
    }),
  ).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}
function readCursor(
  ctx: FinanceActionContext,
  batch: Batch,
  value: string | undefined,
  limit: number,
): number {
  if (!value) return 0;
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error();
    const raw = value.replaceAll("-", "+").replaceAll("_", "/");
    const cursor = JSON.parse(atob(raw.padEnd(Math.ceil(raw.length / 4) * 4, "=")));
    if (
      Object.keys(cursor).sort().join() !== "b,d,l,r,u,v" || cursor.b !== batch.id ||
      cursor.u !== ctx.identity.user_id || cursor.d !== batch.review_digest ||
      cursor.v !== batch.version || cursor.l !== limit || !Number.isInteger(cursor.r) ||
      cursor.r < 0 || cursor.r > 100
    ) throw new Error();
    return cursor.r;
  } catch {
    return financeError(
      "invalid_cursor",
      "A continuation for this caller and frozen batch is required.",
      400,
    );
  }
}
async function batchResult(
  ctx: FinanceActionContext,
  batch: Batch,
  actionStatus: "created" | "committed" | "already_processed" | "read",
  limit = 100,
  cursor?: string,
) {
  const rows = await batchRows(ctx, batch.id);
  const after = readCursor(ctx, batch, cursor, limit);
  const page = rows.filter((row) => row.row_number > after).slice(0, limit);
  const output = [];
  for (const row of page) {
    const key = coverageKey(row.source_snapshot);
    const existing = await consumedSource(ctx, batch.workbook_id, row.source_snapshot);
    let existingSource = null;
    if (existing?.created_by_user_id === ctx.identity.user_id) {
      const { sql } = ctx;
      const [result] = await sql<
        { version: number }[]
      >`SELECT version FROM finance.transactions WHERE workspace_id = ${ctx.workspaceId} AND book_id = ${ctx.book.id} AND id = ${existing.result_transaction_id}
        UNION ALL SELECT version FROM finance.planned_items WHERE workspace_id = ${ctx.workspaceId} AND book_id = ${ctx.book.id} AND id = ${existing.result_planned_item_id}
        UNION ALL SELECT version FROM finance.monthly_summaries WHERE workspace_id = ${ctx.workspaceId} AND book_id = ${ctx.book.id} AND id = ${existing.result_summary_id}
        UNION ALL SELECT version FROM finance.asset_valuations WHERE workspace_id = ${ctx.workspaceId} AND book_id = ${ctx.book.id} AND id = ${existing.result_valuation_id}
        UNION ALL SELECT version FROM finance.accounts WHERE workspace_id = ${ctx.workspaceId} AND book_id = ${ctx.book.id} AND id = ${existing.result_account_id}`;
      existingSource = {
        row_id: existing.id,
        batch_id: existing.batch_id,
        version: existing.version,
        role: existing.role,
        result_version: result?.version ?? null,
      };
    }
    output.push({
      row_id: row.id,
      row_number: row.row_number,
      sheet_id: Number(row.sheet_id),
      source_cell: row.source_cell,
      period_start: row.period_start,
      original_text: row.source_snapshot.original_text,
      displayed_value: row.source_snapshot.displayed_value,
      role: row.role,
      accepted: row.accepted,
      amount: row.amount === null ? null : storedMoney(row.amount, ctx.book.minor_unit, false),
      blockers: row.blockers,
      consumed: row.consumed_at !== null,
      retired: row.retired_at !== null,
      version: row.version,
      result: {
        transaction_id: row.result_transaction_id,
        planned_item_id: row.result_planned_item_id,
        summary_id: row.result_summary_id,
        valuation_id: row.result_valuation_id,
        account_id: row.result_account_id,
      },
      current_coverage: key
        ? await importCoverageState(ctx, key.period, key.kind, key.category)
        : null,
      existing_source: existingSource,
    });
  }
  const selectedRows = rows.filter((row) => selected(batch.manifest, row.source_snapshot));
  const committed = selectedRows.filter((row) =>
    [
      row.result_transaction_id,
      row.result_planned_item_id,
      row.result_summary_id,
      row.result_valuation_id,
      row.result_account_id,
    ].some((id) => id !== null)
  ).length;
  return {
    ...scope(ctx),
    batch_id: batch.id,
    status: batch.status,
    action_status: actionStatus,
    version: batch.version,
    review_digest: batch.review_digest,
    blockers: batch.blockers,
    reconciliation: batch.reconciliation,
    workbook_id: batch.workbook_id,
    source_version: batch.source_version,
    captured_at: batch.captured_at.toISOString(),
    row_count: rows.length,
    rows: output,
    next_cursor: page.length && rows.some((row) => row.row_number > page.at(-1)!.row_number)
      ? cursorFor(ctx, batch, page.at(-1)!.row_number, limit)
      : null,
    coverage: {
      selected_rows: selectedRows.length,
      excluded_rows: rows.length - selectedRows.length,
      committed_rows: committed,
      remaining_rows: selectedRows.length - committed,
      whole_workbook_complete: false as const,
    },
  };
}

function manifestChecks(manifest: ImportManifest): void {
  if (new Set(manifest.sheets.map((sheet) => sheet.sheet_id)).size !== manifest.sheets.length) {
    financeError("invalid_input", "Sheet identities cannot repeat.", 400);
  }
  const identities = manifest.rows.map((row) => stableSourceKey(manifest.workbook_id, row));
  if (
    new Set(identities).size !== identities.length ||
    manifest.rows.some((row) => !manifest.sheets.some((sheet) => sheet.sheet_id === row.sheet_id))
  ) {
    financeError(
      "invalid_input",
      "Every source cell needs one declared sheet and unique identity.",
      400,
    );
  }
}
function reconciliationBlockers(
  manifest: ImportManifest,
  result: ReturnType<typeof reconcileManifest>,
): string[] {
  if (!result.unresolved) return [];
  const accepted = manifest.reconciliation.accepted &&
    manifest.reconciliation.resolution === "exclude_disputed" &&
    result.missing_annual_cells.every((cell) =>
      manifest.reconciliation.excluded_cells.some((excluded) =>
        excluded.sheet_id === cell.sheet_id && excluded.source_cell === cell.source_cell
      )
    );
  return accepted ? [] : ["source_reconciliation_unresolved"];
}

export function previewFinanceImport(database: Database, identity: VerifiedIdentity, raw: unknown) {
  const input: PreviewImportInput = parseImportInput(
    IMPORT_TOOL_SCHEMAS.preview_finance_import.input,
    raw,
  );
  manifestChecks(input.manifest);
  return withFinanceMutation(database, identity, input, "preview_finance_import", async (ctx) => {
    if (ctx.receipt) {
      if (ctx.receipt.resource_ids.length !== 1) actionRetired();
      const batch = await readBatch(ctx, ctx.receipt.resource_ids[0]);
      return {
        result: await batchResult(ctx, batch, "already_processed"),
        resourceType: "import_batch",
        resourceId: batch.id,
        resourceIds: [batch.id],
        changedFields: [],
        action: "create",
      };
    }
    const reconciliation = reconcileManifest(input.manifest, ctx.book.minor_unit);
    const blockers = reconciliationBlockers(input.manifest, reconciliation);
    const prepared: PreparedRow[] = [];
    for (const row of input.manifest.rows) {
      prepared.push(await prepareRow(ctx, input.manifest, row));
    }
    for (let index = 0; index < prepared.length; index++) {
      for (const blocker of prepared[index].blockers) {
        blockers.push(`row_${index + 1}:${blocker}`);
      }
    }
    if (!prepared.some((row) => selected(input.manifest, row.source))) {
      blockers.push("no_selected_financial_rows");
    }
    const coverages = new Map<string, string>();
    for (const row of prepared.filter((row) => selected(input.manifest, row.source))) {
      const key = coverageKey(row.source);
      if (key?.review) {
        const identity = JSON.stringify([key.period, key.kind, key.category]);
        const review = JSON.stringify(key.review);
        if (coverages.has(identity) && coverages.get(identity) !== review) {
          blockers.push("conflicting_batch_coverage");
        }
        coverages.set(identity, review);
      }
    }
    const frozen = { ...input.manifest, rows: prepared.map((row) => row.source) };
    const digest = await financeFingerprint("import_review", {
      manifest: frozen,
      blockers,
      reconciliation,
      sources: prepared.map((row) => ({
        source_digest: row.sourceDigest,
        existing_row_id: row.existing?.id ?? null,
        existing_version: row.existing?.version ?? null,
        current_coverage: row.currentCoverage,
      })),
    });
    const id = crypto.randomUUID(), { sql } = ctx;
    await sql`INSERT INTO finance.import_batches (id, workspace_id, book_id, currency, actor_user_id, workbook_id, source_version, captured_at, manifest, review_digest, status, blockers, reconciliation, created_by_user_id, updated_by_user_id)
      VALUES (${id}, ${ctx.workspaceId}, ${ctx.book.id}, ${ctx.book.currency}, ${identity.user_id}, ${frozen.workbook_id}, ${frozen.source_version}, ${frozen.captured_at}, ${
      sql.json(frozen)
    }, pg_catalog.decode(${digest}, 'hex'), ${blockers.length ? "draft" : "ready"}, ${
      sql.array(blockers)
    }, ${sql.json(reconciliation)}, ${identity.user_id}, ${identity.user_id})`;
    for (let index = 0; index < prepared.length; index++) {
      const row = prepared[index], source = row.source, mapping = source.mapping;
      await sql`INSERT INTO finance.import_rows (workspace_id, book_id, currency, batch_id, row_number, workbook_id, sheet_id, source_cell, period_start, source_key, source_digest, source_snapshot, mapping, role, amount, accepted, blockers, replaces_row_id, created_by_user_id, updated_by_user_id)
        VALUES (${ctx.workspaceId}, ${ctx.book.id}, ${ctx.book.currency}, ${id}, ${
        index + 1
      }, ${frozen.workbook_id}, ${source.sheet_id}, ${source.source_cell}, ${source.period_start}, ${row.sourceKey}, pg_catalog.decode(${row.sourceDigest}, 'hex'), ${
        sql.json(source)
      }, ${sql.json(mapping)}, ${mapping.role}, ${row.amount}, ${
        selected(frozen, source) && mapping.accepted
      }, ${sql.array(row.blockers)}, ${
        source.replacement?.row_id ?? null
      }, ${identity.user_id}, ${identity.user_id})`;
    }
    const batch = await readBatch(ctx, id);
    return {
      result: await batchResult(ctx, batch, "created"),
      resourceType: "import_batch",
      resourceId: id,
      resourceIds: [id],
      changedFields: ["manifest", "review_digest", "status", "blockers"],
      action: "create",
    };
  });
}

async function retirePrior(
  ctx: FinanceActionContext,
  prepared: PreparedRow,
  row: ImportRow,
): Promise<void> {
  const previous = prepared.existing!, replacement = prepared.source.replacement!, { sql } = ctx;
  if (previous.id !== replacement.row_id || previous.version !== replacement.expected_version) {
    financeError("source_replacement_stale", "The consumed source version changed.");
  }
  if (previous.result_transaction_id) {
    const [actual] = await sql<
      { version: number }[]
    >`SELECT version FROM finance.transactions WHERE workspace_id = ${ctx.workspaceId} AND book_id = ${ctx.book.id} AND id = ${previous.result_transaction_id}`;
    if (!actual) actionRetired();
    assertVersion(actual.version, replacement.expected_result_version);
    if (prepared.source.mapping.role !== "actual_detail") {
      await reviseLedgerEntry(
        ctx,
        previous.result_transaction_id,
        replacement.expected_result_version,
        replacement.reason,
        crypto.randomUUID(),
        null,
        replacement.reconcile_allocations,
      );
    }
  } else if (previous.result_planned_item_id) {
    await retireImportedPlan(
      ctx,
      previous.result_planned_item_id,
      replacement.expected_result_version,
    );
  } else if (previous.result_summary_id) {
    const [summary] = await sql<
      { version: number; retired_at: Date | null }[]
    >`SELECT version, retired_at FROM finance.monthly_summaries WHERE workspace_id = ${ctx.workspaceId} AND book_id = ${ctx.book.id} AND id = ${previous.result_summary_id} FOR UPDATE`;
    if (!summary || summary.retired_at !== null) actionRetired();
    assertVersion(summary.version, replacement.expected_result_version);
    await sql`UPDATE finance.monthly_summaries SET retired_at = now(), retired_by_user_id = ${ctx.identity.user_id}, version = version + 1, updated_at = now(), updated_by_user_id = ${ctx.identity.user_id} WHERE id = ${previous.result_summary_id}`;
  } else if (
    previous.result_valuation_id &&
    (prepared.source.mapping.role !== "valuation" ||
      previous.source_snapshot.mapping.role !== "valuation" ||
      prepared.source.mapping.asset_id !== previous.source_snapshot.mapping.asset_id ||
      prepared.source.mapping.account_id !== previous.source_snapshot.mapping.account_id)
  ) {
    const [valuation] = await sql<
      { version: number; retired_at: Date | null }[]
    >`SELECT version, retired_at FROM finance.asset_valuations WHERE workspace_id = ${ctx.workspaceId} AND book_id = ${ctx.book.id} AND id = ${previous.result_valuation_id} FOR UPDATE`;
    if (!valuation || valuation.retired_at !== null) actionRetired();
    assertVersion(valuation.version, replacement.expected_result_version);
    await sql`UPDATE finance.asset_valuations SET retired_at = now(), retired_by_user_id = ${ctx.identity.user_id}, version = version + 1, updated_at = now(), updated_by_user_id = ${ctx.identity.user_id} WHERE id = ${previous.result_valuation_id}`;
  } else if (previous.result_account_id) {
    const account = (await lockFinanceAccounts(ctx, [previous.result_account_id])).get(
      previous.result_account_id,
    )!;
    assertVersion(account.version, replacement.expected_result_version);
  }
  await sql`UPDATE finance.import_rows SET retired_at = now(), retired_by_user_id = ${ctx.identity.user_id}, version = version + 1, updated_at = now(), updated_by_user_id = ${ctx.identity.user_id} WHERE id = ${previous.id}`;
  if (row.replaces_row_id !== previous.id) {
    financeError("source_replacement_stale", "The reviewed replacement reference changed.");
  }
}

async function writeImportedRow(ctx: FinanceActionContext, row: ImportRow, prepared: PreparedRow) {
  const { sql } = ctx, mapping = prepared.source.mapping;
  let transactionId: string | null = null,
    planId: string | null = null,
    summaryId: string | null = null,
    valuationId: string | null = null,
    accountId: string | null = null;
  const previous = prepared.existing;
  if (previous && !prepared.source.replacement) {
    await currentResult(ctx, previous);
    transactionId = previous.result_transaction_id;
    planId = previous.result_planned_item_id;
    summaryId = previous.result_summary_id;
    valuationId = previous.result_valuation_id;
    accountId = previous.result_account_id;
  } else {
    if (previous) await retirePrior(ctx, prepared, row);
    if (mapping.role === "actual_detail") {
      if (previous?.result_transaction_id) {
        const revision = await reviseLedgerEntry(
          ctx,
          previous.result_transaction_id,
          prepared.source.replacement!.expected_result_version,
          prepared.source.replacement!.reason,
          crypto.randomUUID(),
          mapping.entry,
          prepared.source.replacement!.reconcile_allocations,
        );
        transactionId = revision.replacement!.id;
      } else transactionId = (await postLedgerEntry(ctx, mapping.entry, crypto.randomUUID())).id;
    } else if (mapping.role === "actual_summary") {
      summaryId = crypto.randomUUID();
      await sql`INSERT INTO finance.monthly_summaries (id, workspace_id, book_id, currency, period_start, kind, amount, category_id, import_row_id, replaces_summary_id, created_by_user_id, updated_by_user_id)
        VALUES (${summaryId}, ${ctx.workspaceId}, ${ctx.book.id}, ${ctx.book.currency}, ${prepared.source.period_start}, ${mapping.kind}, ${prepared
        .amount!}, ${mapping.category_id}, ${row.id}, ${
        previous?.result_summary_id ?? null
      }, ${ctx.identity.user_id}, ${ctx.identity.user_id})`;
    } else if (mapping.role === "planned") planId = await createImportedPlan(ctx, mapping);
    else if (mapping.role === "opening_balance") accountId = mapping.account_id;
    else if (mapping.role === "valuation") {
      if (previous?.result_valuation_id) {
        const [old] = await sql<
          { version: number }[]
        >`SELECT version FROM finance.asset_valuations WHERE id = ${previous.result_valuation_id}`;
        if (!old) actionRetired();
        assertVersion(old.version, prepared.source.replacement!.expected_result_version);
      }
      const sameTarget = previous?.source_snapshot.mapping.role === "valuation" &&
        previous.source_snapshot.mapping.asset_id === mapping.asset_id &&
        previous.source_snapshot.mapping.account_id === mapping.account_id;
      valuationId = await createImportedValuation(ctx, {
        asset_id: mapping.asset_id,
        account_id: mapping.account_id,
        valued_on: mapping.valued_on,
        amount: prepared.amount!,
        source: mapping.source,
      }, sameTarget ? previous!.result_valuation_id : null);
    } else {financeError(
        "financial_role_unknown",
        "A financial destination must be accepted before commit.",
      );}
  }
  await sql`UPDATE finance.import_rows SET result_transaction_id = ${transactionId}, result_planned_item_id = ${planId}, result_summary_id = ${summaryId}, result_valuation_id = ${valuationId}, result_account_id = ${accountId},
    consumed_at = ${
    previous && !prepared.source.replacement ? null : new Date()
  }, version = version + 1, updated_at = now(), updated_by_user_id = ${ctx.identity.user_id} WHERE id = ${row.id}`;
}

async function currentResult(ctx: FinanceActionContext, row: ImportRow) {
  const { sql } = ctx;
  if (row.retired_at !== null) actionRetired();
  await validateTargets(ctx, row.source_snapshot, false);
  if (row.result_transaction_id) {
    const [result] =
      await sql`SELECT voided_at FROM finance.transactions WHERE workspace_id = ${ctx.workspaceId} AND book_id = ${ctx.book.id} AND id = ${row.result_transaction_id}`;
    if (!result || result.voided_at !== null) actionRetired();
  } else if (row.result_summary_id) {
    const [result] =
      await sql`SELECT retired_at FROM finance.monthly_summaries WHERE workspace_id = ${ctx.workspaceId} AND book_id = ${ctx.book.id} AND id = ${row.result_summary_id}`;
    if (!result || result.retired_at !== null) actionRetired();
  } else if (row.result_planned_item_id) {
    const [result] =
      await sql`SELECT canceled_at FROM finance.planned_items WHERE workspace_id = ${ctx.workspaceId} AND book_id = ${ctx.book.id} AND id = ${row.result_planned_item_id}`;
    if (!result || result.canceled_at !== null) actionRetired();
  } else if (row.result_valuation_id) {
    const [result] =
      await sql`SELECT retired_at FROM finance.asset_valuations WHERE workspace_id = ${ctx.workspaceId} AND book_id = ${ctx.book.id} AND id = ${row.result_valuation_id}`;
    if (!result || result.retired_at !== null) actionRetired();
  }
}

export function commitFinanceImport(database: Database, identity: VerifiedIdentity, raw: unknown) {
  const input: CommitImportInput = parseImportInput(
    IMPORT_TOOL_SCHEMAS.commit_finance_import.input,
    raw,
  );
  return withFinanceMutation(database, identity, input, "commit_finance_import", async (ctx) => {
    const batch = await readBatch(ctx, input.batch_id);
    if (input.review_digest !== batch.review_digest) {
      financeError("stale_import_review", "The commit must match the reviewed frozen digest.");
    }
    if (
      ctx.receipt &&
      (ctx.receipt.resource_ids.length !== 1 || ctx.receipt.resource_ids[0] !== batch.id)
    ) actionRetired();
    const rows = await batchRows(ctx, batch.id);
    if (batch.status === "committed") {
      if (batch.version !== input.expected_version + 1) {
        financeError("version_conflict", "The import version has changed.");
      }
      for (const row of rows.filter((row) => selected(batch.manifest, row.source_snapshot))) {
        await currentResult(ctx, row);
      }
      return {
        result: await batchResult(ctx, batch, "already_processed"),
        resourceType: "import_batch",
        resourceId: batch.id,
        resourceIds: [batch.id],
        changedFields: [],
        action: "update",
      };
    }
    if (ctx.receipt) actionRetired();
    assertVersion(batch.version, input.expected_version);
    if (batch.status !== "ready" || batch.blockers.length) {
      financeError(
        "import_blocked",
        "Resolve the selected batch blockers in a new reviewed preview.",
      );
    }
    const prepared: PreparedRow[] = [];
    for (const row of rows) {
      prepared.push(await prepareRow(ctx, batch.manifest, row.source_snapshot));
    }
    if (prepared.some((row) => row.blockers.length)) {
      financeError(
        "stale_import_review",
        "A destination, source consumption, or coverage changed after preview.",
      );
    }
    const { sql } = ctx;
    for (let index = 0; index < rows.length; index++) {
      if (selected(batch.manifest, prepared[index].source)) {
        await writeImportedRow(ctx, rows[index], prepared[index]);
      }
    }
    const coverageWrites = new Map<string, ReturnType<typeof coverageKey>>();
    for (
      const row of prepared.filter((row) =>
        selected(batch.manifest, row.source) && (!row.existing || row.source.replacement)
      )
    ) {
      const key = coverageKey(row.source);
      if (key?.review) {
        coverageWrites.set(JSON.stringify([key.period, key.kind, key.category]), key);
      }
      if (row.existing && row.source.replacement?.prior_coverage) {
        const prior = coverageKey(row.existing.source_snapshot);
        if (
          prior && !coverageWrites.has(JSON.stringify([prior.period, prior.kind, prior.category]))
        ) {
          coverageWrites.set(JSON.stringify([prior.period, prior.kind, prior.category]), {
            ...prior,
            review: row.source.replacement.prior_coverage,
          });
        }
      }
    }
    for (const key of coverageWrites.values()) {
      if (!key?.review) continue;
      const state = await importCoverageState(ctx, key.period, key.kind, key.category);
      await sql`INSERT INTO finance.report_coverage (workspace_id, book_id, currency, period_start, kind, category_id, authority, reviewed_detail_count, reviewed_detail_digest, created_by_user_id, updated_by_user_id)
        VALUES (${ctx.workspaceId}, ${ctx.book.id}, ${ctx.book.currency}, ${key.period}, ${key.kind}, ${key.category}, ${key.review.authority}, ${state.detail_count}, pg_catalog.decode(${state.detail_digest}, 'hex'), ${identity.user_id}, ${identity.user_id})
        ON CONFLICT (workspace_id, book_id, currency, period_start, kind, category_id) DO UPDATE SET authority = EXCLUDED.authority, reviewed_detail_count = EXCLUDED.reviewed_detail_count,
          reviewed_detail_digest = EXCLUDED.reviewed_detail_digest, version = finance.report_coverage.version + 1, updated_at = now(), updated_by_user_id = EXCLUDED.updated_by_user_id`;
    }
    await sql`UPDATE finance.import_batches SET status = 'committed', committed_at = now(), version = version + 1, updated_at = now(), updated_by_user_id = ${identity.user_id} WHERE id = ${batch.id}`;
    const committed = await readBatch(ctx, batch.id);
    return {
      result: await batchResult(ctx, committed, "committed"),
      resourceType: "import_batch",
      resourceId: batch.id,
      resourceIds: [batch.id],
      changedFields: ["status", "committed_at", "result_ids", "report_coverage"],
      action: "update",
    };
  });
}

export function getFinanceImport(database: Database, identity: VerifiedIdentity, raw: unknown) {
  const input: GetImportInput = parseImportInput(IMPORT_TOOL_SCHEMAS.get_finance_import.input, raw);
  return withFinanceRead(
    database,
    identity,
    input.workspace_id,
    input.book_id,
    async (ctx) =>
      await batchResult(
        ctx,
        await readBatch(ctx, input.batch_id),
        "read",
        input.limit ?? 50,
        input.cursor,
      ),
  );
}

export async function runImportTool(
  database: Database,
  identity: VerifiedIdentity,
  name: ImportToolName,
  raw: unknown,
): Promise<Record<string, unknown>> {
  switch (name) {
    case "preview_finance_import":
      return await previewFinanceImport(database, identity, raw);
    case "commit_finance_import":
      return await commitFinanceImport(database, identity, raw);
    case "get_finance_import":
      return await getFinanceImport(database, identity, raw);
  }
}
