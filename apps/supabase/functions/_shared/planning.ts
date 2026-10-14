import { isUuid, type VerifiedIdentity } from "./auth.ts";
import type { Database } from "./database.ts";
import {
  actionRetired,
  assertVersion,
  checkFinancePeople,
  exactMoney,
  type FinanceActionContext,
  financeError,
  type FinanceMutationOutcome,
  fromMinorUnits,
  lockFinanceAccounts,
  minorUnits,
  withFinanceMutation,
  withFinanceRead,
} from "./finance_common.ts";
import { type Book, storedMoney } from "./finance.ts";
import { validateDate, workspaceLocalDate } from "./finance_contracts.ts";
import { ApiError } from "./http.ts";
import {
  type AssetInput,
  type BudgetInput,
  type DebtInput,
  type DomainInput,
  type DomainToolName,
  type DomainWriteInput,
  type ExpectedLine,
  type GoalInput,
  parseDomainInput,
  type PlanInput,
} from "./planning_contracts.ts";

type Values = Record<string, string | number | boolean | null>;
interface Resource {
  id: string;
  workspace_id: string;
  book_id: string;
  currency: string;
  version: number;
  name?: string;
  archived_at?: Date | null;
  canceled_at?: Date | null;
  retired_at?: Date | null;
  revoked_at?: Date | null;
  [key: string]: unknown;
}
type Table =
  | "budgets"
  | "planned_items"
  | "recurring_rules"
  | "planned_item_allocations"
  | "debt_details"
  | "savings_goals"
  | "goal_allocations"
  | "assets"
  | "asset_valuations";
const resourceTypes: Record<Table, string> = {
  budgets: "budget",
  planned_items: "planned_item",
  recurring_rules: "recurring_rule",
  planned_item_allocations: "planned_item_allocation",
  debt_details: "debt_detail",
  savings_goals: "savings_goal",
  goal_allocations: "goal_allocation",
  assets: "asset",
  asset_valuations: "asset_valuation",
};

function active(row: Resource): void {
  if (row.archived_at || row.canceled_at || row.retired_at || row.revoked_at) actionRetired();
}

async function resource(ctx: FinanceActionContext, table: Table, id: string, requireActive = true) {
  const { sql } = ctx;
  const [row] = await sql<Resource[]>`
    SELECT * FROM ${sql(`finance.${table}`)}
    WHERE workspace_id = ${ctx.workspaceId} AND book_id = ${ctx.book.id} AND id = ${id}
    FOR UPDATE
  `;
  if (!row) financeError("resource_access_denied", "Access to this resource is denied.", 403);
  if (requireActive) active(row);
  return row;
}

async function insert(ctx: FinanceActionContext, table: Table, fields: Values): Promise<Resource> {
  const { sql } = ctx;
  const values = {
    id: crypto.randomUUID(),
    workspace_id: ctx.workspaceId,
    book_id: ctx.book.id,
    currency: ctx.book.currency,
    created_by_user_id: ctx.identity.user_id,
    updated_by_user_id: ctx.identity.user_id,
    ...fields,
  };
  const [row] = await sql<Resource[]>`INSERT INTO ${sql(`finance.${table}`)} ${
    sql(values)
  } RETURNING *`;
  return row;
}

async function revise(ctx: FinanceActionContext, table: Table, row: Resource, fields: Values) {
  const { sql } = ctx;
  const values = { ...fields, version: row.version + 1, updated_by_user_id: ctx.identity.user_id };
  const [updated] = await sql<Resource[]>`
    UPDATE ${sql(`finance.${table}`)} SET ${sql(values)}, updated_at = now()
    WHERE workspace_id = ${ctx.workspaceId} AND book_id = ${ctx.book.id} AND id = ${row.id}
    RETURNING *
  `;
  return updated;
}

function outcome(
  ctx: FinanceActionContext,
  input: DomainWriteInput,
  table: Table,
  id: string,
  version: number,
  fields: readonly string[],
  action: FinanceMutationOutcome<unknown>["action"] = "update",
  ids = [id],
  extra = {},
): FinanceMutationOutcome<unknown> {
  return {
    result: {
      workspace_id: ctx.workspaceId,
      book_id: ctx.book.id,
      action: input.action,
      status: ctx.receipt ? "already_processed" : "completed",
      resource_id: id,
      resource_type: resourceTypes[table],
      version,
      ...extra,
    },
    resourceType: resourceTypes[table],
    resourceId: id,
    resourceIds: ids,
    changedFields: [...fields],
    action,
  };
}

function currency(ctx: FinanceActionContext, input: DomainWriteInput): void {
  if (input.currency !== ctx.book.currency) {
    financeError("currency_mismatch", "The currency must match the book.", 400);
  }
}

function normalized(input: DomainWriteInput, book: Book): unknown {
  const moneyFields = new Set([
    "amount",
    "quoted_total",
    "target_amount",
    "credit_limit",
    "minimum_payment",
  ]);
  function visit(value: unknown, key = ""): unknown {
    if (typeof value === "string" && moneyFields.has(key)) {
      return exactMoney(value, book.minor_unit, false);
    }
    if (Array.isArray(value)) return value.map((item) => visit(item));
    if (value !== null && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value).map(([name, item]) => [name, visit(item, name)]),
      );
    }
    return value;
  }
  return visit(input);
}

async function person(ctx: FinanceActionContext, id: string | null): Promise<void> {
  if (id !== null) await checkFinancePeople(ctx, [id], id);
}

async function category(ctx: FinanceActionContext, id: string | null, kind: string) {
  if (id === null) return;
  const { sql } = ctx;
  const [row] = await sql<{ kind: string; archived_at: Date | null }[]>`
    SELECT kind, archived_at FROM finance.categories
    WHERE workspace_id = ${ctx.workspaceId} AND book_id = ${ctx.book.id} AND id = ${id}
    FOR UPDATE
  `;
  if (!row || row.kind !== kind || kind === "transfer") {
    financeError("category_access_denied", "A compatible category is required.", 403);
  }
  if (row.archived_at !== null) actionRetired();
}

export function periodNumber(period: string): number {
  validateDate(period);
  if (!period.endsWith("-01")) {
    financeError("invalid_period", "A first-day month period is required.", 400);
  }
  return Number(period.slice(0, 4)) * 12 + Number(period.slice(5, 7)) - 1;
}

function periodDate(index: number): string {
  return `${String(Math.floor(index / 12)).padStart(4, "0")}-${
    String(index % 12 + 1).padStart(2, "0")
  }-01`;
}

export function recurrencePeriods(
  interval: "monthly" | "annual",
  start: string,
  end: string | null,
  from: string,
  through: string,
): string[] {
  const beginning = periodNumber(start), lower = periodNumber(from), upper = periodNumber(through);
  const last = end === null ? upper : Math.min(periodNumber(end), upper);
  if (upper < lower || (end !== null && periodNumber(end) < beginning)) {
    financeError("invalid_period", "The recurrence interval is invalid.", 400);
  }
  const step = interval === "monthly" ? 1 : 12;
  const first = beginning + Math.max(0, Math.ceil((lower - beginning) / step)) * step;
  if (last >= first && Math.floor((last - first) / step) + 1 > 100) {
    financeError(
      "occurrence_limit",
      "At most 100 occurrences may be materialized per action.",
      400,
    );
  }
  const periods = [];
  for (let value = first; value <= last; value += step) periods.push(periodDate(value));
  return periods;
}

export function recurrenceDueDate(
  period: string,
  day: number | null,
  policy: "last_day" | "reject" | null,
): string | null {
  periodNumber(period);
  if (day === null) {
    if (policy !== null) {
      financeError("invalid_day_policy", "A day policy requires an accepted due day.", 400);
    }
    return null;
  }
  if (!Number.isInteger(day) || day < 1 || day > 31 || policy === null) {
    financeError(
      "invalid_day_policy",
      "An accepted due day and short-month policy are required.",
      400,
    );
  }
  const year = Number(period.slice(0, 4)), month = Number(period.slice(5, 7));
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const last = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  if (day > last && policy === "reject") {
    financeError(
      "short_month_requires_review",
      "The accepted due day does not exist in this month.",
      400,
    );
  }
  return `${period.slice(0, 8)}${String(Math.min(day, last)).padStart(2, "0")}`;
}

export function paymentState(
  expected: bigint,
  paid: bigint,
  dueOn: string | null = null,
  today = "0001-01-01",
) {
  const remaining = expected > paid ? expected - paid : 0n;
  return {
    state: paid === 0n
      ? "unpaid"
      : paid < expected
      ? "partially_paid"
      : paid === expected
      ? "paid"
      : "overpaid",
    paid,
    remaining,
    excess: paid > expected ? paid - expected : 0n,
    overdue: dueOn !== null && dueOn < today && remaining > 0n,
  };
}

export function componentPaymentState(
  components: readonly { expected: bigint; paid: bigint }[],
  dueOn: string | null,
  today: string,
) {
  const paid = components.reduce((sum, line) => sum + line.paid, 0n);
  const remaining = components.reduce(
    (sum, line) => sum + (line.expected > line.paid ? line.expected - line.paid : 0n),
    0n,
  );
  const excess = components.reduce(
    (sum, line) => sum + (line.paid > line.expected ? line.paid - line.expected : 0n),
    0n,
  );
  return {
    paid,
    remaining,
    excess,
    overdue: dueOn !== null && dueOn < today && remaining > 0n,
    state: remaining > 0n
      ? paid > 0n ? "partially_paid" : "unpaid"
      : excess > 0n
      ? "overpaid"
      : "paid",
  };
}

function validateExpected(
  input: {
    period_start: string;
    due_on: string | null;
    quoted_total: string | null;
    components_resolved: boolean;
    lines: ExpectedLine[];
  },
  precision: number,
) {
  periodNumber(input.period_start);
  const quoted = input.quoted_total === null
    ? null
    : minorUnits(exactMoney(input.quoted_total, precision), precision);
  const sum = input.lines.reduce(
    (value, line) => value + minorUnits(exactMoney(line.amount, precision), precision),
    0n,
  );
  if (
    input.components_resolved
      ? input.lines.length === 0 || (quoted !== null && quoted !== sum)
      : input.lines.length !== 0 || quoted === null
  ) {
    financeError(
      "unresolved_components",
      "Resolved components must sum exactly to the accepted total; unresolved expectations retain only their quoted total.",
      400,
    );
  }
}

async function validateLines(ctx: FinanceActionContext, lines: ExpectedLine[]) {
  await lockFinanceAccounts(
    ctx,
    lines.flatMap((line) =>
      [line.source_account_id, line.destination_account_id].filter((id): id is string =>
        id !== null
      )
    ),
  );
  for (const line of lines) {
    exactMoney(line.amount, ctx.book.minor_unit);
    if (
      (line.kind === "income" && line.source_account_id !== null) ||
      (line.kind === "expense" && line.destination_account_id !== null) ||
      (line.kind === "transfer" && line.source_account_id !== null &&
        line.source_account_id === line.destination_account_id)
    ) {
      financeError(
        "invalid_plan_accounts",
        "The expected accounts must match the component kind.",
        400,
      );
    }
    await category(ctx, line.category_id, line.kind);
    await person(ctx, line.beneficiary_person_id);
  }
}

async function lines(
  ctx: FinanceActionContext,
  table: "planned_item_lines" | "recurring_rule_lines",
  parent: string,
) {
  const { sql } = ctx;
  const parentColumn = table === "planned_item_lines" ? "planned_item_id" : "rule_id";
  const rows = await sql<(ExpectedLine & { id: string; line_number: number })[]>`
    SELECT id, line_number, kind, amount::text, category_id, source_account_id,
      destination_account_id, beneficiary_person_id
    FROM ${sql(`finance.${table}`)} WHERE workspace_id = ${ctx.workspaceId}
      AND book_id = ${ctx.book.id} AND ${sql(parentColumn)} = ${parent} AND retired_at IS NULL
    ORDER BY line_number
  `;
  return rows.map((row) => ({
    ...row,
    amount: storedMoney(row.amount, ctx.book.minor_unit, true),
  }));
}

async function replaceLines(
  ctx: FinanceActionContext,
  table: "planned_item_lines" | "recurring_rule_lines",
  parent: string,
  values: ExpectedLine[],
) {
  const { sql } = ctx;
  const parentColumn = table === "planned_item_lines" ? "planned_item_id" : "rule_id";
  await sql`
    UPDATE ${
    sql(`finance.${table}`)
  } SET retired_at = now(), retired_by_user_id = ${ctx.identity.user_id},
      updated_at = now(), updated_by_user_id = ${ctx.identity.user_id}, version = version + 1
    WHERE workspace_id = ${ctx.workspaceId} AND book_id = ${ctx.book.id}
      AND ${sql(parentColumn)} = ${parent} AND retired_at IS NULL
  `;
  for (let i = 0; i < values.length; i++) {
    const value = {
      id: crypto.randomUUID(),
      workspace_id: ctx.workspaceId,
      book_id: ctx.book.id,
      currency: ctx.book.currency,
      [parentColumn]: parent,
      line_number: i + 1,
      kind: values[i].kind,
      category_id: values[i].category_id,
      source_account_id: values[i].source_account_id,
      destination_account_id: values[i].destination_account_id,
      beneficiary_person_id: values[i].beneficiary_person_id,
      amount: exactMoney(values[i].amount, ctx.book.minor_unit),
      created_by_user_id: ctx.identity.user_id,
      updated_by_user_id: ctx.identity.user_id,
    };
    await sql`INSERT INTO ${sql(`finance.${table}`)} ${sql(value)}`;
  }
}

async function noSettlement(ctx: FinanceActionContext, plannedId: string) {
  const { sql } = ctx;
  const settled = await sql`SELECT id FROM finance.planned_item_allocations
    WHERE workspace_id = ${ctx.workspaceId} AND book_id = ${ctx.book.id}
      AND planned_item_id = ${plannedId} AND revoked_at IS NULL LIMIT 1`;
  if (settled.length) {
    financeError(
      "settlement_requires_review",
      "Linked payment evidence must be reconciled before revising components.",
    );
  }
}

async function budgetAction(
  ctx: FinanceActionContext,
  input: Exclude<BudgetInput, { action: "get" | "list" }>,
) {
  let row: Resource;
  if (input.action === "create") {
    if (ctx.receipt) row = await resource(ctx, "budgets", ctx.receipt.resource_ids[0]);
    else {
      await person(ctx, input.person_id);
      await category(ctx, input.category_id, "expense");
      if (input.ends_on <= input.starts_on) {
        financeError("invalid_interval", "The budget end must be after its start.", 400);
      }
      row = await insert(ctx, "budgets", {
        name: input.name,
        person_id: input.person_id,
        category_id: input.category_id,
        starts_on: input.starts_on,
        ends_on: input.ends_on,
        amount: exactMoney(input.amount, ctx.book.minor_unit),
      });
    }
  } else {
    row = await resource(ctx, "budgets", input.budget_id, !ctx.receipt);
    if (ctx.receipt) {
      if (input.action !== "archive") active(row);
      await person(ctx, row.person_id as string | null);
      await category(ctx, row.category_id as string | null, "expense");
      return outcome(ctx, input, "budgets", row.id, input.expected_version + 1, []);
    }
    assertVersion(row.version, input.expected_version);
    if (input.action === "archive") {
      row = await revise(ctx, "budgets", row, {
        archived_at: new Date().toISOString(),
        archived_by_user_id: ctx.identity.user_id,
      });
    } else {
      await person(ctx, input.person_id);
      await category(ctx, input.category_id, "expense");
      if (input.ends_on <= input.starts_on) {
        financeError("invalid_interval", "The budget end must be after its start.", 400);
      }
      row = await revise(ctx, "budgets", row, {
        name: input.name,
        person_id: input.person_id,
        category_id: input.category_id,
        starts_on: input.starts_on,
        ends_on: input.ends_on,
        amount: exactMoney(input.amount, ctx.book.minor_unit),
      });
    }
  }
  await person(ctx, row.person_id as string | null);
  await category(ctx, row.category_id as string | null, "expense");
  return outcome(ctx, input, "budgets", row.id, input.action === "create" ? 1 : row.version, [
    "name",
    "amount",
    "category_id",
    "person_id",
    "starts_on",
    "ends_on",
  ], input.action === "create" ? "create" : input.action === "archive" ? "archive" : "update");
}

async function debtAccount(ctx: FinanceActionContext, id: string) {
  const account = (await lockFinanceAccounts(ctx, [id])).get(id)!;
  if (!["loan", "credit_card"].includes(account.account_kind)) {
    financeError(
      "invalid_debt_account",
      "Debt metadata requires a reviewed loan or credit-card account.",
      400,
    );
  }
  return account;
}

async function activeDebtReference(ctx: FinanceActionContext, accountId: string) {
  await debtAccount(ctx, accountId);
  const { sql } = ctx;
  const [detail] = await sql<
    { archived_at: Date | null }[]
  >`SELECT archived_at FROM finance.debt_details
    WHERE workspace_id = ${ctx.workspaceId} AND book_id = ${ctx.book.id} AND account_id = ${accountId} FOR UPDATE`;
  if (!detail) {
    financeError(
      "debt_access_denied",
      "Accepted debt details are required for this repayment expectation.",
      403,
    );
  }
  if (detail.archived_at !== null) actionRetired();
}

function debtFields(
  ctx: FinanceActionContext,
  input: Extract<DebtInput, { action: "create" | "revise" }>,
): Values {
  return {
    creditor: input.creditor,
    credit_limit: input.credit_limit === null
      ? null
      : exactMoney(input.credit_limit, ctx.book.minor_unit, false),
    annual_rate: input.annual_rate === null ? null : exactMoney(input.annual_rate, 4, false),
    minimum_payment: input.minimum_payment === null
      ? null
      : exactMoney(input.minimum_payment, ctx.book.minor_unit, false),
    statement_day: input.statement_day,
    due_day: input.due_day,
    payment_terms: input.payment_terms,
  };
}

async function debtAction(
  ctx: FinanceActionContext,
  input: Exclude<DebtInput, { action: "get" | "list" }>,
) {
  let row: Resource;
  if (input.action === "create") {
    await debtAccount(ctx, input.account_id);
    row = ctx.receipt
      ? await resource(ctx, "debt_details", ctx.receipt.resource_ids[0])
      : await insert(ctx, "debt_details", {
        account_id: input.account_id,
        ...debtFields(ctx, input),
      });
  } else {
    row = await resource(ctx, "debt_details", input.debt_id, !ctx.receipt);
    await debtAccount(ctx, String(row.account_id));
    if (!ctx.receipt) {
      assertVersion(row.version, input.expected_version);
      row = await revise(
        ctx,
        "debt_details",
        row,
        input.action === "archive"
          ? { archived_at: new Date().toISOString(), archived_by_user_id: ctx.identity.user_id }
          : debtFields(ctx, input),
      );
    } else if (input.action !== "archive") active(row);
  }
  return outcome(
    ctx,
    input,
    "debt_details",
    row.id,
    input.action === "create" ? 1 : input.expected_version + 1,
    [
      "creditor",
      "credit_limit",
      "annual_rate",
      "minimum_payment",
      "statement_day",
      "due_day",
      "payment_terms",
    ],
    input.action === "create" ? "create" : input.action === "archive" ? "archive" : "update",
  );
}

function planFields(input: Extract<PlanInput, { action: "create" | "revise" }>): Values {
  return {
    name: input.name,
    period_start: input.period_start,
    due_on: input.due_on,
    debt_account_id: input.debt_account_id,
    quoted_total: input.quoted_total,
    components_resolved: input.components_resolved,
  };
}

function ruleFields(input: Extract<PlanInput, { action: "create_rule" | "revise_rule" }>): Values {
  return {
    name: input.name,
    interval: input.interval,
    start_period: input.start_period,
    end_period: input.end_period,
    due_day: input.due_day,
    short_month_policy: input.short_month_policy,
  };
}

async function preparePlan(
  ctx: FinanceActionContext,
  input: Extract<PlanInput, { action: "create" | "revise" }>,
) {
  validateExpected(input, ctx.book.minor_unit);
  await validateLines(ctx, input.lines);
  if (input.debt_account_id !== null) await activeDebtReference(ctx, input.debt_account_id);
}

async function currentPlanParents(ctx: FinanceActionContext, row: Resource) {
  await validateLines(ctx, await lines(ctx, "planned_item_lines", row.id));
  if (row.debt_account_id !== null) await activeDebtReference(ctx, String(row.debt_account_id));
}

async function reviseOccurrences(
  ctx: FinanceActionContext,
  rule: Resource,
  input: Extract<PlanInput, { action: "revise_rule" | "cancel_rule" }>,
) {
  const { sql } = ctx;
  if (input.effective_from < `${workspaceLocalDate(ctx.timezone).slice(0, 7)}-01`) {
    financeError(
      "invalid_effective_period",
      "A recurrence change requires a current or future effective period.",
      400,
    );
  }
  const occurrences = await sql<Resource[]>`
    SELECT p.* FROM finance.planned_items p
    WHERE p.workspace_id = ${ctx.workspaceId} AND p.book_id = ${ctx.book.id}
      AND p.rule_id = ${rule.id} AND p.period_start >= ${input.effective_from}::date
      AND p.canceled_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM finance.planned_item_allocations a
        WHERE a.workspace_id = p.workspace_id AND a.book_id = p.book_id
          AND a.planned_item_id = p.id AND a.revoked_at IS NULL)
    ORDER BY p.id FOR UPDATE
  `;
  for (const occurrence of occurrences) {
    if (input.action === "cancel_rule") {
      await revise(ctx, "planned_items", occurrence, {
        canceled_at: new Date().toISOString(),
        canceled_by_user_id: ctx.identity.user_id,
      });
    } else {
      const period = asDate(occurrence.period_start)!;
      const eligible =
        recurrencePeriods(input.interval, input.start_period, input.end_period, period, period)
          .length > 0;
      if (!eligible) {
        await revise(ctx, "planned_items", occurrence, {
          canceled_at: new Date().toISOString(),
          canceled_by_user_id: ctx.identity.user_id,
        });
      } else {
        await revise(ctx, "planned_items", occurrence, {
          name: input.name,
          due_on: recurrenceDueDate(period, input.due_day, input.short_month_policy),
          rule_version: rule.version,
          quoted_total: null,
          components_resolved: true,
        });
        await replaceLines(ctx, "planned_item_lines", occurrence.id, input.lines);
      }
    }
  }
}

async function planAction(
  ctx: FinanceActionContext,
  input: Exclude<PlanInput, { action: "get" | "list" }>,
): Promise<FinanceMutationOutcome<unknown>> {
  const { sql } = ctx;
  if (input.action === "link") {
    const row = await resource(ctx, "planned_items", input.planned_item_id);
    if (ctx.receipt) {
      const allocation = await resource(
        ctx,
        "planned_item_allocations",
        ctx.receipt.resource_ids[0],
      );
      await currentAllocation(ctx, allocation);
      return outcome(ctx, input, "planned_item_allocations", allocation.id, 1, []);
    }
    assertVersion(row.version, input.expected_version);
    const [allocation] = await applySettlementLinks(ctx, input.transaction_id, [{
      planned_item_line_id: input.planned_item_line_id,
      amount: input.amount,
    }], row.id);
    return outcome(ctx, input, "planned_item_allocations", allocation, 1, [
      "planned_item_line_id",
      "transaction_id",
      "amount",
    ], "create");
  }
  if (input.action === "revoke") {
    const row = await resource(ctx, "planned_item_allocations", input.allocation_id, !ctx.receipt);
    const parent = await resource(ctx, "planned_items", String(row.planned_item_id), false);
    await currentPlanParents(ctx, parent);
    if (!ctx.receipt) {
      assertVersion(row.version, input.expected_version);
      await revokeAllocation(ctx, row);
      await revise(ctx, "planned_items", parent, {});
    }
    return outcome(ctx, input, "planned_item_allocations", row.id, input.expected_version + 1, [
      "revoked_at",
    ], "revoke");
  }
  if (input.action === "materialize") {
    const row = await resource(ctx, "recurring_rules", input.rule_id);
    const template = await lines(ctx, "recurring_rule_lines", row.id);
    await validateLines(ctx, template);
    if (ctx.receipt) {
      const ids = ctx.receipt.resource_ids.slice(1);
      for (const id of ids) await currentPlanParents(ctx, await resource(ctx, "planned_items", id));
      return outcome(
        ctx,
        input,
        "recurring_rules",
        row.id,
        input.expected_version,
        [],
        "create",
        ctx.receipt.resource_ids,
        { occurrence_ids: ids },
      );
    }
    assertVersion(row.version, input.expected_version);
    const periods = recurrencePeriods(
      row.interval as "monthly" | "annual",
      asDate(row.start_period)!,
      asDate(row.end_period),
      input.from_period,
      input.through_period,
    );
    const ids: string[] = [];
    for (const period of periods) {
      const [existing] = await sql<Resource[]>`SELECT * FROM finance.planned_items
        WHERE workspace_id = ${ctx.workspaceId} AND book_id = ${ctx.book.id}
          AND rule_id = ${row.id} AND period_start = ${period}::date FOR UPDATE`;
      if (existing) {
        ids.push(existing.id);
        continue;
      }
      const occurrence = await insert(ctx, "planned_items", {
        name: String(row.name),
        period_start: period,
        due_on: recurrenceDueDate(
          period,
          row.due_day as number | null,
          row.short_month_policy as "last_day" | "reject" | null,
        ),
        rule_id: row.id,
        rule_version: row.version,
        debt_account_id: null,
        quoted_total: null,
        components_resolved: true,
      });
      await replaceLines(ctx, "planned_item_lines", occurrence.id, template);
      ids.push(occurrence.id);
    }
    return outcome(ctx, input, "recurring_rules", row.id, row.version, ["occurrences"], "create", [
      row.id,
      ...ids,
    ], { occurrence_ids: ids });
  }
  if (
    input.action === "create_rule" || input.action === "revise_rule" ||
    input.action === "cancel_rule"
  ) {
    let row: Resource;
    if (input.action !== "cancel_rule") {
      recurrencePeriods(
        input.interval,
        input.start_period,
        input.end_period,
        input.start_period,
        input.start_period,
      );
      recurrenceDueDate(input.start_period, input.due_day, input.short_month_policy);
      await validateLines(ctx, input.lines);
    }
    if (input.action === "create_rule") {
      row = ctx.receipt
        ? await resource(ctx, "recurring_rules", ctx.receipt.resource_ids[0])
        : await insert(ctx, "recurring_rules", ruleFields(input));
      if (!ctx.receipt) await replaceLines(ctx, "recurring_rule_lines", row.id, input.lines);
    } else {
      row = await resource(ctx, "recurring_rules", input.rule_id, !ctx.receipt);
      if (!ctx.receipt) {
        assertVersion(row.version, input.expected_version);
        row = await revise(
          ctx,
          "recurring_rules",
          row,
          input.action === "cancel_rule"
            ? { canceled_at: new Date().toISOString(), canceled_by_user_id: ctx.identity.user_id }
            : ruleFields(input),
        );
        if (input.action === "revise_rule") {
          await replaceLines(ctx, "recurring_rule_lines", row.id, input.lines);
        }
        await reviseOccurrences(ctx, row, input);
      } else if (input.action !== "cancel_rule") active(row);
    }
    await validateLines(ctx, await lines(ctx, "recurring_rule_lines", row.id));
    return outcome(
      ctx,
      input,
      "recurring_rules",
      row.id,
      input.action === "create_rule" ? 1 : input.expected_version + 1,
      ["name", "interval", "start_period", "end_period", "due_day", "short_month_policy", "lines"],
      input.action === "create_rule" ? "create" : "update",
    );
  }
  let row: Resource;
  if (input.action === "create") {
    await preparePlan(ctx, input);
    row = ctx.receipt
      ? await resource(ctx, "planned_items", ctx.receipt.resource_ids[0])
      : await insert(ctx, "planned_items", planFields(input));
    if (!ctx.receipt) await replaceLines(ctx, "planned_item_lines", row.id, input.lines);
  } else {
    row = await resource(ctx, "planned_items", input.planned_item_id, !ctx.receipt);
    if (!ctx.receipt) {
      assertVersion(row.version, input.expected_version);
      if (input.action === "revise") {
        await preparePlan(ctx, input);
        await noSettlement(ctx, row.id);
        row = await revise(ctx, "planned_items", row, planFields(input));
        await replaceLines(ctx, "planned_item_lines", row.id, input.lines);
      } else {row = await revise(ctx, "planned_items", row, {
          canceled_at: new Date().toISOString(),
          canceled_by_user_id: ctx.identity.user_id,
        });}
    } else if (input.action !== "cancel") active(row);
  }
  await currentPlanParents(ctx, row);
  return outcome(
    ctx,
    input,
    "planned_items",
    row.id,
    input.action === "create" ? 1 : input.expected_version + 1,
    ["name", "period_start", "due_on", "quoted_total", "components_resolved", "lines"],
    input.action === "create" ? "create" : "update",
  );
}

interface AllocationChange {
  allocation_id: string;
  expected_version: number;
  action: "revoke" | "replace";
  amount?: string;
}

async function revokeAllocation(ctx: FinanceActionContext, row: Resource) {
  return await revise(ctx, "planned_item_allocations", row, {
    revoked_at: new Date().toISOString(),
    revoked_by_user_id: ctx.identity.user_id,
  });
}

async function currentAllocation(ctx: FinanceActionContext, row: Resource) {
  const { sql } = ctx;
  await currentPlanParents(ctx, await resource(ctx, "planned_items", String(row.planned_item_id)));
  const [transaction] =
    await sql`SELECT id, source_account_id, destination_account_id, beneficiary_person_id
    FROM finance.transactions WHERE workspace_id = ${ctx.workspaceId} AND book_id = ${ctx.book.id}
      AND id = ${String(row.transaction_id)} AND voided_at IS NULL`;
  if (!transaction) actionRetired();
  await lockFinanceAccounts(
    ctx,
    [transaction.source_account_id, transaction.destination_account_id].filter((id): id is string =>
      typeof id === "string"
    ),
  );
  if (transaction.beneficiary_person_id) {
    await checkFinancePeople(ctx, [transaction.beneficiary_person_id], null);
  }
}

export async function applySettlementLinks(
  ctx: FinanceActionContext,
  transactionId: string,
  links: readonly { planned_item_line_id: string; amount: string }[],
  requiredPlanId?: string,
): Promise<string[]> {
  if (links.length > 10) {
    financeError("allocation_limit", "At most ten payment links may be recorded at once.", 400);
  }
  const { sql } = ctx;
  const [actual] = await sql<{
    id: string;
    kind: string;
    amount: string;
    currency: string;
    source_account_id: string | null;
    destination_account_id: string | null;
    beneficiary_person_id: string | null;
    voided_at: Date | null;
  }[]>`SELECT id, kind, amount::text, currency, source_account_id, destination_account_id,
    beneficiary_person_id, voided_at FROM finance.transactions WHERE workspace_id = ${ctx.workspaceId}
      AND book_id = ${ctx.book.id} AND id = ${transactionId}`;
  if (!actual || actual.currency !== ctx.book.currency) {
    financeError("transaction_access_denied", "Access to this transaction is denied.", 403);
  }
  if (actual.voided_at !== null) actionRetired();
  await lockFinanceAccounts(
    ctx,
    [actual.source_account_id, actual.destination_account_id].filter((id): id is string =>
      id !== null
    ),
  );
  const [lockedActual] = await sql<
    { voided_at: Date | null }[]
  >`SELECT voided_at FROM finance.transactions
    WHERE workspace_id = ${ctx.workspaceId} AND book_id = ${ctx.book.id} AND id = ${transactionId} FOR UPDATE`;
  if (!lockedActual || lockedActual.voided_at !== null) actionRetired();
  if (actual.beneficiary_person_id !== null) {
    await checkFinancePeople(ctx, [actual.beneficiary_person_id], null);
  }
  const ids: string[] = [];
  for (
    const link of [...links].sort((a, b) =>
      a.planned_item_line_id.localeCompare(b.planned_item_line_id)
    )
  ) {
    const [line] = await sql<
      (ExpectedLine & { id: string; planned_item_id: string; retired_at: Date | null })[]
    >`
      SELECT id, planned_item_id, kind, amount::text, category_id, source_account_id,
        destination_account_id, beneficiary_person_id, retired_at
      FROM finance.planned_item_lines WHERE workspace_id = ${ctx.workspaceId}
        AND book_id = ${ctx.book.id} AND id = ${link.planned_item_line_id} FOR UPDATE`;
    if (!line || (requiredPlanId !== undefined && line.planned_item_id !== requiredPlanId)) {
      financeError("plan_access_denied", "Access to this expected component is denied.", 403);
    }
    if (line.retired_at !== null) actionRetired();
    const plan = await resource(ctx, "planned_items", line.planned_item_id);
    if (
      !plan.components_resolved || line.kind !== actual.kind ||
      (line.source_account_id !== null && line.source_account_id !== actual.source_account_id) ||
      (line.destination_account_id !== null &&
        line.destination_account_id !== actual.destination_account_id) ||
      (line.beneficiary_person_id !== null &&
        line.beneficiary_person_id !== actual.beneficiary_person_id) ||
      (plan.debt_account_id !== null && actual.kind === "transfer" &&
        actual.destination_account_id !== plan.debt_account_id)
    ) {
      financeError(
        "incompatible_settlement",
        "The actual component does not match this expectation.",
        400,
      );
    }
    if (line.category_id !== null) {
      const [classification] = await sql<{ category_id: string | null }[]>`
        SELECT category_id FROM finance.transaction_classifications
        WHERE workspace_id = ${ctx.workspaceId} AND book_id = ${ctx.book.id} AND transaction_id = ${actual.id}`;
      if (classification?.category_id !== line.category_id) {
        financeError(
          "incompatible_settlement",
          "The actual classification does not match the expected category.",
          400,
        );
      }
    }
    if (plan.debt_account_id !== null) await activeDebtReference(ctx, String(plan.debt_account_id));
    const amount = exactMoney(link.amount, ctx.book.minor_unit);
    const [allocated] = await sql<
      { amount: string }[]
    >`SELECT coalesce(sum(amount), 0)::text AS amount
      FROM finance.planned_item_allocations WHERE workspace_id = ${ctx.workspaceId}
        AND book_id = ${ctx.book.id} AND transaction_id = ${transactionId} AND revoked_at IS NULL`;
    if (
      minorUnits(allocated.amount, ctx.book.minor_unit) + minorUnits(amount, ctx.book.minor_unit) >
        minorUnits(actual.amount, ctx.book.minor_unit)
    ) {
      financeError(
        "actual_amount_overallocated",
        "The allocation exceeds this movement's available amount.",
      );
    }
    const allocation = await insert(ctx, "planned_item_allocations", {
      planned_item_id: plan.id,
      planned_item_line_id: line.id,
      transaction_id: actual.id,
      kind: actual.kind,
      amount,
    });
    await revise(ctx, "planned_items", plan, {});
    ids.push(allocation.id);
  }
  return ids;
}

export async function reconcileTransactionAllocations(
  ctx: FinanceActionContext,
  originalId: string,
  replacementId: string | null,
  changes: readonly AllocationChange[],
): Promise<void> {
  const { sql } = ctx;
  const existing = await sql<Resource[]>`SELECT * FROM finance.planned_item_allocations
    WHERE workspace_id = ${ctx.workspaceId} AND book_id = ${ctx.book.id}
      AND transaction_id = ${originalId} AND revoked_at IS NULL ORDER BY id FOR UPDATE`;
  if (
    existing.length !== changes.length ||
    new Set(changes.map((change) => change.allocation_id)).size !== changes.length ||
    existing.some((row) => !changes.some((change) => change.allocation_id === row.id))
  ) {
    financeError(
      "settlement_requires_review",
      "Every linked allocation needs an explicit correction or revocation.",
    );
  }
  for (const row of existing) {
    const change = changes.find((item) => item.allocation_id === row.id)!;
    assertVersion(row.version, change.expected_version);
    if (change.action === "replace" && (replacementId === null || change.amount === undefined)) {
      financeError(
        "invalid_settlement_correction",
        "A replacement movement and accepted amount are required.",
        400,
      );
    }
    await revokeAllocation(ctx, row);
    const plan = await resource(ctx, "planned_items", String(row.planned_item_id), false);
    await revise(ctx, "planned_items", plan, {});
    if (change.action === "replace") {
      await applySettlementLinks(ctx, replacementId!, [{
        planned_item_line_id: String(row.planned_item_line_id),
        amount: change.amount!,
      }]);
    }
  }
}

function asDate(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}

export async function createImportedPlan(ctx: FinanceActionContext, input: {
  name: string;
  period_start: string;
  due_on: string | null;
  debt_account_id?: string | null;
  quoted_total: string | null;
  components_resolved: boolean;
  lines: ExpectedLine[];
}): Promise<string> {
  validateExpected(input, ctx.book.minor_unit);
  await validateLines(ctx, input.lines);
  if (input.debt_account_id) await activeDebtReference(ctx, input.debt_account_id);
  const row = await insert(ctx, "planned_items", {
    name: input.name,
    period_start: input.period_start,
    due_on: input.due_on,
    debt_account_id: input.debt_account_id ?? null,
    quoted_total: input.quoted_total,
    components_resolved: input.components_resolved,
  });
  await replaceLines(ctx, "planned_item_lines", row.id, input.lines);
  return row.id;
}

export async function retireImportedPlan(
  ctx: FinanceActionContext,
  id: string,
  expectedVersion: number,
): Promise<void> {
  const plan = await resource(ctx, "planned_items", id);
  assertVersion(plan.version, expectedVersion);
  await noSettlement(ctx, id);
  await revise(ctx, "planned_items", plan, {
    canceled_at: new Date().toISOString(),
    canceled_by_user_id: ctx.identity.user_id,
  });
}

export async function createImportedValuation(ctx: FinanceActionContext, input: {
  asset_id: string | null;
  account_id: string | null;
  valued_on: string;
  amount: string;
  source: string;
}, replacesId: string | null = null): Promise<string> {
  await valuationTarget(ctx, input.asset_id, input.account_id);
  validateDate(input.valued_on);
  const amount = exactMoney(input.amount, ctx.book.minor_unit, false);
  if (replacesId !== null) {
    const previous = await resource(ctx, "asset_valuations", replacesId);
    if (previous.asset_id !== input.asset_id || previous.account_id !== input.account_id) {
      financeError(
        "valuation_target_immutable",
        "A replacement valuation must retain its original holding.",
        400,
      );
    }
    await revise(ctx, "asset_valuations", previous, {
      retired_at: new Date().toISOString(),
      retired_by_user_id: ctx.identity.user_id,
    });
  }
  const row = await insert(ctx, "asset_valuations", {
    ...input,
    amount,
    replaces_valuation_id: replacesId,
  });
  return row.id;
}

function goalFields(
  ctx: FinanceActionContext,
  input: Extract<GoalInput, { action: "create" | "revise" }>,
): Values {
  return {
    name: input.name,
    target_amount: exactMoney(input.target_amount, ctx.book.minor_unit),
    target_on: input.target_on,
    person_id: input.person_id,
  };
}

export function availableEarmarkFunds(balance: bigint, allocated: bigint): bigint {
  return balance > allocated ? balance - allocated : 0n;
}

export function valuationFresh(valuedOn: string, asOf: string, maxAge: number): boolean {
  validateDate(valuedOn);
  validateDate(asOf);
  if (!Number.isInteger(maxAge) || maxAge < 1 || maxAge > 3660 || valuedOn > asOf) return false;
  // Date.parse on ISO strings preserves years 0001..0099 rather than Date.UTC's 1900 coercion.
  return (Date.parse(`${asOf}T00:00:00Z`) - Date.parse(`${valuedOn}T00:00:00Z`)) / 86400000 <=
    maxAge;
}

async function accountFunding(
  ctx: FinanceActionContext,
  accountId: string,
  basis: string,
  valuationId: string | null,
  asOf: string,
  maxAge: number,
): Promise<bigint> {
  const account = (await lockFinanceAccounts(ctx, [accountId])).get(accountId)!;
  if (
    !["cash", "bank", "investment"].includes(account.account_kind) ||
    account.opening_balance_on === null || account.opening_balance_on > asOf
  ) {
    financeError(
      "unsupported_funding_account",
      "Funding requires an eligible account with a reviewed opening boundary.",
    );
  }
  const { sql } = ctx;
  if (basis === "valuation") {
    if (account.account_kind !== "investment" || valuationId === null) {
      financeError(
        "invalid_funding_basis",
        "Only investment accounts may use an accepted valuation basis.",
        400,
      );
    }
    const value = await resource(ctx, "asset_valuations", valuationId);
    if (value.account_id !== accountId || !valuationFresh(asDate(value.valued_on)!, asOf, maxAge)) {
      financeError("valuation_unavailable", "An applicable fresh accepted valuation is required.");
    }
    const [latest] = await sql<{ id: string }[]>`SELECT id FROM finance.asset_valuations
      WHERE workspace_id = ${ctx.workspaceId} AND book_id = ${ctx.book.id} AND account_id = ${accountId}
        AND retired_at IS NULL AND valued_on <= ${asOf}::date ORDER BY valued_on DESC, id DESC LIMIT 1`;
    if (latest?.id !== valuationId) {
      financeError("valuation_requires_review", "Use the latest applicable accepted valuation.");
    }
    return minorUnits(String(value.amount), ctx.book.minor_unit);
  }
  if (basis !== "ledger" || valuationId !== null) {
    financeError("invalid_funding_basis", "Ledger funding must not specify a valuation.", 400);
  }
  const [row] = await sql<{ value: string }[]>`
    SELECT (${account.opening_balance}::numeric + coalesce(sum(CASE
      WHEN destination_account_id = ${accountId} THEN amount ELSE 0 END),0)
      - coalesce(sum(CASE WHEN source_account_id = ${accountId} THEN amount ELSE 0 END),0))::text AS value
    FROM finance.transactions WHERE workspace_id = ${ctx.workspaceId} AND book_id = ${ctx.book.id}
      AND (source_account_id = ${accountId} OR destination_account_id = ${accountId})
      AND occurred_on >= ${account.opening_balance_on}::date AND occurred_on <= ${asOf}::date
      AND voided_at IS NULL
  `;
  return minorUnits(row.value, ctx.book.minor_unit);
}

async function goalAction(
  ctx: FinanceActionContext,
  input: Exclude<GoalInput, { action: "get" | "list" }>,
): Promise<FinanceMutationOutcome<unknown>> {
  const { sql } = ctx;
  if (input.action === "release") {
    const allocation = await resource(ctx, "goal_allocations", input.allocation_id, !ctx.receipt);
    await lockFinanceAccounts(ctx, [String(allocation.account_id)]);
    const goal = await resource(ctx, "savings_goals", String(allocation.goal_id), false);
    await person(ctx, goal.person_id as string | null);
    if (!ctx.receipt) {
      assertVersion(allocation.version, input.expected_version);
      await revise(ctx, "goal_allocations", allocation, {
        revoked_at: new Date().toISOString(),
        revoked_by_user_id: ctx.identity.user_id,
      });
      await revise(ctx, "savings_goals", goal, {});
    }
    return outcome(ctx, input, "goal_allocations", allocation.id, input.expected_version + 1, [
      "revoked_at",
    ], "revoke");
  }
  if (input.action === "set") {
    const account = (await lockFinanceAccounts(ctx, [input.account_id])).get(input.account_id)!;
    const goal = await resource(ctx, "savings_goals", input.goal_id);
    await person(ctx, goal.person_id as string | null);
    if (ctx.receipt) {
      const allocation = await resource(ctx, "goal_allocations", ctx.receipt.resource_ids[0]);
      if (allocation.account_id !== account.id) actionRetired();
      return outcome(ctx, input, "goal_allocations", allocation.id, 1, []);
    }
    assertVersion(goal.version, input.expected_version);
    if (input.as_of !== workspaceLocalDate(ctx.timezone)) {
      financeError(
        "funding_date_requires_review",
        "Earmarking funds requires the current disclosed workspace date.",
        400,
      );
    }
    const amount = exactMoney(input.amount, ctx.book.minor_unit);
    if ((input.allocation_id === null) !== (input.allocation_expected_version === null)) {
      financeError(
        "invalid_allocation_revision",
        "An existing earmark needs its identifier and expected version.",
        400,
      );
    }
    if (input.allocation_id !== null) {
      const previous = await resource(ctx, "goal_allocations", input.allocation_id);
      if (previous.goal_id !== goal.id || previous.account_id !== account.id) {
        financeError(
          "allocation_access_denied",
          "The existing earmark belongs to another scope.",
          403,
        );
      }
      assertVersion(previous.version, input.allocation_expected_version!);
      await revise(ctx, "goal_allocations", previous, {
        revoked_at: new Date().toISOString(),
        revoked_by_user_id: ctx.identity.user_id,
      });
    }
    const existing = await sql<
      { amount: string; funding_basis: string; valuation_id: string | null }[]
    >`
      SELECT a.amount::text, a.funding_basis, a.valuation_id FROM finance.goal_allocations a
      JOIN finance.savings_goals g ON g.workspace_id = a.workspace_id AND g.book_id = a.book_id AND g.id = a.goal_id
      WHERE a.workspace_id = ${ctx.workspaceId} AND a.book_id = ${ctx.book.id}
        AND a.account_id = ${account.id} AND a.revoked_at IS NULL AND g.canceled_at IS NULL
      ORDER BY a.id FOR UPDATE OF a
    `;
    if (
      existing.some((row) =>
        row.funding_basis !== input.funding_basis || row.valuation_id !== input.valuation_id
      )
    ) {
      financeError(
        "funding_basis_conflict",
        "All active earmarks from this account need the same reviewed funding basis.",
      );
    }
    const balance = await accountFunding(
      ctx,
      account.id,
      input.funding_basis,
      input.valuation_id,
      input.as_of,
      input.valuation_max_age_days ?? 90,
    );
    const allocated = existing.reduce(
      (sum, row) => sum + minorUnits(row.amount, ctx.book.minor_unit),
      0n,
    );
    if (minorUnits(amount, ctx.book.minor_unit) > availableEarmarkFunds(balance, allocated)) {
      financeError(
        "insufficient_unallocated_funds",
        "This account has insufficient supported unallocated funds.",
      );
    }
    const allocation = await insert(ctx, "goal_allocations", {
      goal_id: goal.id,
      account_id: account.id,
      amount,
      funding_basis: input.funding_basis,
      valuation_id: input.valuation_id,
    });
    await revise(ctx, "savings_goals", goal, {});
    return outcome(ctx, input, "goal_allocations", allocation.id, 1, [
      "goal_id",
      "account_id",
      "amount",
      "funding_basis",
      "valuation_id",
    ], "create");
  }
  let row: Resource;
  if (input.action === "create") {
    await person(ctx, input.person_id);
    row = ctx.receipt
      ? await resource(ctx, "savings_goals", ctx.receipt.resource_ids[0])
      : await insert(ctx, "savings_goals", goalFields(ctx, input));
  } else {
    row = await resource(ctx, "savings_goals", input.goal_id, !ctx.receipt);
    await person(ctx, row.person_id as string | null);
    if (!ctx.receipt) {
      assertVersion(row.version, input.expected_version);
      if (input.action === "revise") await person(ctx, input.person_id);
      row = await revise(
        ctx,
        "savings_goals",
        row,
        input.action === "cancel"
          ? { canceled_at: new Date().toISOString(), canceled_by_user_id: ctx.identity.user_id }
          : goalFields(ctx, input),
      );
    } else if (input.action !== "cancel") active(row);
  }
  await person(ctx, row.person_id as string | null);
  return outcome(
    ctx,
    input,
    "savings_goals",
    row.id,
    input.action === "create" ? 1 : input.expected_version + 1,
    ["name", "target_amount", "target_on", "person_id"],
    input.action === "create" ? "create" : "update",
  );
}

function assetFields(input: Extract<AssetInput, { action: "create" | "revise" }>): Values {
  return {
    name: input.name,
    identity_text: input.identity_text,
    ownership_text: input.ownership_text,
    person_id: input.person_id,
  };
}

async function uniqueAssetIdentity(
  ctx: FinanceActionContext,
  identity: string,
  excluding: string | null,
) {
  const { sql } = ctx;
  const duplicate = await sql`SELECT id FROM finance.assets WHERE workspace_id = ${ctx.workspaceId}
    AND book_id = ${ctx.book.id} AND identity_text = ${identity} AND archived_at IS NULL
    AND (${excluding}::uuid IS NULL OR id <> ${excluding}::uuid) LIMIT 1`;
  if (duplicate.length) {
    financeError(
      "asset_identity_requires_review",
      "This holding identity is already represented by an active manual asset.",
    );
  }
}

async function valuationTarget(
  ctx: FinanceActionContext,
  assetId: string | null,
  accountId: string | null,
) {
  if ((assetId === null) === (accountId === null)) {
    financeError(
      "invalid_valuation_target",
      "A valuation must target exactly one manual asset or investment account.",
      400,
    );
  }
  if (accountId !== null) {
    const account = (await lockFinanceAccounts(ctx, [accountId])).get(accountId)!;
    if (account.account_kind !== "investment") {
      financeError(
        "invalid_valuation_target",
        "Only a reviewed investment account may receive an account valuation.",
        400,
      );
    }
  } else {
    const asset = await resource(ctx, "assets", assetId!);
    await person(ctx, asset.person_id as string | null);
  }
}

async function assetAction(
  ctx: FinanceActionContext,
  input: Exclude<AssetInput, { action: "get" | "list" }>,
): Promise<FinanceMutationOutcome<unknown>> {
  if (input.action === "append_valuation" || input.action === "revise_valuation") {
    await valuationTarget(ctx, input.asset_id, input.account_id);
    const amount = exactMoney(input.amount, ctx.book.minor_unit, false);
    let row: Resource;
    if (ctx.receipt) row = await resource(ctx, "asset_valuations", ctx.receipt.resource_ids[0]);
    else {
      let previousId: string | null = null;
      if (input.action === "revise_valuation") {
        const previous = await resource(ctx, "asset_valuations", input.valuation_id);
        assertVersion(previous.version, input.expected_version);
        if (previous.asset_id !== input.asset_id || previous.account_id !== input.account_id) {
          financeError(
            "valuation_target_immutable",
            "A corrected valuation must retain its original holding.",
            400,
          );
        }
        previousId = previous.id;
        await revise(ctx, "asset_valuations", previous, {
          retired_at: new Date().toISOString(),
          retired_by_user_id: ctx.identity.user_id,
        });
      }
      row = await insert(ctx, "asset_valuations", {
        asset_id: input.asset_id,
        account_id: input.account_id,
        valued_on: input.valued_on,
        amount,
        source: input.source,
        replaces_valuation_id: previousId,
      });
    }
    return outcome(ctx, input, "asset_valuations", row.id, 1, [
      "asset_id",
      "account_id",
      "valued_on",
      "amount",
      "source",
      "replaces_valuation_id",
    ], input.action === "append_valuation" ? "create" : "correct");
  }
  let row: Resource;
  if (input.action === "create") {
    await person(ctx, input.person_id);
    if (!ctx.receipt) await uniqueAssetIdentity(ctx, input.identity_text, null);
    row = ctx.receipt
      ? await resource(ctx, "assets", ctx.receipt.resource_ids[0])
      : await insert(ctx, "assets", assetFields(input));
  } else {
    row = await resource(ctx, "assets", input.asset_id, !ctx.receipt);
    await person(ctx, row.person_id as string | null);
    if (!ctx.receipt) {
      assertVersion(row.version, input.expected_version);
      if (input.action === "revise") {
        await person(ctx, input.person_id);
        await uniqueAssetIdentity(ctx, input.identity_text, row.id);
      }
      row = await revise(
        ctx,
        "assets",
        row,
        input.action === "archive"
          ? { archived_at: new Date().toISOString(), archived_by_user_id: ctx.identity.user_id }
          : assetFields(input),
      );
    } else if (input.action !== "archive") active(row);
  }
  await person(ctx, row.person_id as string | null);
  return outcome(
    ctx,
    input,
    "assets",
    row.id,
    input.action === "create" ? 1 : input.expected_version + 1,
    ["name", "identity_text", "ownership_text", "person_id"],
    input.action === "create" ? "create" : input.action === "archive" ? "archive" : "update",
  );
}

function mainTable(name: DomainToolName): Table {
  return ({
    manage_budget: "budgets",
    manage_plan: "planned_items",
    manage_debt: "debt_details",
    manage_goal: "savings_goals",
    manage_asset: "assets",
  } as const)[name];
}

async function prelockAccounts(ctx: FinanceActionContext, input: DomainWriteInput) {
  const accountIds: string[] = [], resourceIds = [...ctx.receipt?.resource_ids ?? []];
  const accountKeys = new Set([
    "account_id",
    "source_account_id",
    "destination_account_id",
    "debt_account_id",
  ]);
  function inspect(value: unknown) {
    if (Array.isArray(value)) {
      value.forEach(inspect);
      return;
    }
    if (value === null || typeof value !== "object") return;
    for (const [key, entry] of Object.entries(value)) {
      if (typeof entry === "string" && accountKeys.has(key)) accountIds.push(entry);
      else if (
        typeof entry === "string" && key.endsWith("_id") &&
        ![
          "request_id",
          "workspace_id",
          "book_id",
          "category_id",
          "person_id",
          "beneficiary_person_id",
        ].includes(key)
      ) resourceIds.push(entry);
      else if (entry !== null && typeof entry === "object") inspect(entry);
    }
  }
  inspect(input);
  const { sql } = ctx, ids = sql.array([...new Set(resourceIds)], 2950);
  // Discover references without locking parents, then acquire all account locks in one order.
  const rows = await sql<{ account_id: string | null }[]>`
    SELECT source_account_id AS account_id FROM finance.planned_item_lines
      WHERE workspace_id = ${ctx.workspaceId} AND book_id = ${ctx.book.id} AND retired_at IS NULL
        AND (planned_item_id = ANY(${ids}) OR id = ANY(${ids}))
    UNION SELECT destination_account_id FROM finance.planned_item_lines
      WHERE workspace_id = ${ctx.workspaceId} AND book_id = ${ctx.book.id} AND retired_at IS NULL
        AND (planned_item_id = ANY(${ids}) OR id = ANY(${ids}))
    UNION SELECT source_account_id FROM finance.recurring_rule_lines
      WHERE workspace_id = ${ctx.workspaceId} AND book_id = ${ctx.book.id} AND retired_at IS NULL AND rule_id = ANY(${ids})
    UNION SELECT destination_account_id FROM finance.recurring_rule_lines
      WHERE workspace_id = ${ctx.workspaceId} AND book_id = ${ctx.book.id} AND retired_at IS NULL AND rule_id = ANY(${ids})
    UNION SELECT source_account_id FROM finance.transactions
      WHERE workspace_id = ${ctx.workspaceId} AND book_id = ${ctx.book.id} AND (id = ANY(${ids}) OR id IN (
        SELECT transaction_id FROM finance.planned_item_allocations WHERE workspace_id = ${ctx.workspaceId} AND book_id = ${ctx.book.id} AND id = ANY(${ids})))
    UNION SELECT destination_account_id FROM finance.transactions
      WHERE workspace_id = ${ctx.workspaceId} AND book_id = ${ctx.book.id} AND (id = ANY(${ids}) OR id IN (
        SELECT transaction_id FROM finance.planned_item_allocations WHERE workspace_id = ${ctx.workspaceId} AND book_id = ${ctx.book.id} AND id = ANY(${ids})))
    UNION SELECT account_id FROM finance.goal_allocations WHERE workspace_id = ${ctx.workspaceId}
      AND book_id = ${ctx.book.id} AND revoked_at IS NULL AND (id = ANY(${ids}) OR goal_id = ANY(${ids}))
    UNION SELECT account_id FROM finance.debt_details WHERE workspace_id = ${ctx.workspaceId}
      AND book_id = ${ctx.book.id} AND id = ANY(${ids})
    UNION SELECT account_id FROM finance.asset_valuations WHERE workspace_id = ${ctx.workspaceId}
      AND book_id = ${ctx.book.id} AND id = ANY(${ids})
    UNION SELECT debt_account_id FROM finance.planned_items WHERE workspace_id = ${ctx.workspaceId}
      AND book_id = ${ctx.book.id} AND id = ANY(${ids})
  `;
  await lockFinanceAccounts(ctx, [
    ...accountIds,
    ...rows.map((row) => row.account_id).filter((id): id is string => id !== null),
  ]);
}

function cursor(
  input: Extract<DomainInput, { action: "list" }>,
  name: DomainToolName,
): string | null {
  if (!input.cursor) return null;
  try {
    const value = JSON.parse(atob(input.cursor));
    if (
      Object.keys(value).sort().join(",") !== "b,i,k,n,s,v,w" || value.v !== 1 ||
      value.w !== input.workspace_id || value.b !== input.book_id || value.n !== name ||
      value.k !== ("resource_kind" in input ? input.resource_kind ?? "plan" : null) ||
      value.s !== Boolean(input.include_inactive) || typeof value.i !== "string" ||
      !isUuid(value.i)
    ) throw new Error();
    return value.i;
  } catch {
    return financeError(
      "invalid_cursor",
      "A continuation bound to this scope and filter is required.",
      400,
    );
  }
}

async function readDetails(ctx: FinanceActionContext, table: Table, row: Resource) {
  const { sql } = ctx, precision = ctx.book.minor_unit, today = workspaceLocalDate(ctx.timezone);
  const value = (amount: unknown) =>
    amount === null || amount === undefined ? null : storedMoney(String(amount), precision, false);
  if (table === "budgets") {
    return {
      type: "budget",
      person_id: row.person_id,
      category_id: row.category_id,
      starts_on: asDate(row.starts_on),
      ends_on: asDate(row.ends_on),
    };
  }
  if (table === "recurring_rules") {
    const template = await lines(ctx, "recurring_rule_lines", row.id);
    await checkFinancePeople(
      ctx,
      template.map((line) => line.beneficiary_person_id).filter((id): id is string => id !== null),
      null,
    );
    return {
      type: "rule",
      interval: row.interval,
      start_period: asDate(row.start_period),
      end_period: asDate(row.end_period),
      due_day: row.due_day,
      short_month_policy: row.short_month_policy,
      lines: template.map((line) => ({
        ...line,
        amount: storedMoney(line.amount, precision, true),
      })),
    };
  }
  if (table === "planned_items") {
    const components = await lines(ctx, "planned_item_lines", row.id);
    await checkFinancePeople(
      ctx,
      components.map((line) => line.beneficiary_person_id).filter((id): id is string =>
        id !== null
      ),
      null,
    );
    const allocations = await sql<
      {
        id: string;
        planned_item_line_id: string;
        transaction_id: string;
        amount: string;
        version: number;
        revoked: boolean;
      }[]
    >`
      SELECT id, planned_item_line_id, transaction_id, amount::text, version, revoked_at IS NOT NULL AS revoked
      FROM finance.planned_item_allocations WHERE workspace_id = ${ctx.workspaceId}
        AND book_id = ${ctx.book.id} AND planned_item_id = ${row.id} ORDER BY id LIMIT 101`;
    if (allocations.length > 100) {
      financeError("report_too_large", "The settlement history exceeds this bounded response.");
    }
    const allocated = await sql<
      { planned_item_line_id: string; amount: string }[]
    >`SELECT a.planned_item_line_id, sum(a.amount)::text AS amount
      FROM finance.planned_item_allocations a JOIN finance.transactions t
        ON t.workspace_id = a.workspace_id AND t.book_id = a.book_id AND t.id = a.transaction_id
      WHERE a.workspace_id = ${ctx.workspaceId} AND a.book_id = ${ctx.book.id}
        AND a.planned_item_id = ${row.id} AND a.revoked_at IS NULL AND t.voided_at IS NULL
      GROUP BY a.planned_item_line_id`;
    const total = row.quoted_total === null
      ? components.reduce((sum, line) => sum + minorUnits(line.amount, precision), 0n)
      : minorUnits(String(row.quoted_total), precision);
    const state = row.components_resolved
      ? componentPaymentState(
        components.map((line) => ({
          expected: minorUnits(line.amount, precision),
          paid: minorUnits(
            allocated.find((allocation) => allocation.planned_item_line_id === line.id)?.amount ??
              "0",
            precision,
          ),
        })),
        asDate(row.due_on),
        today,
      )
      : paymentState(total, 0n, asDate(row.due_on), today);
    return {
      type: "plan",
      period_start: asDate(row.period_start),
      due_on: asDate(row.due_on),
      debt_account_id: row.debt_account_id,
      quoted_total: value(row.quoted_total),
      components_resolved: row.components_resolved,
      rule_id: row.rule_id,
      rule_version: row.rule_version,
      lines: components.map((line) => ({
        ...line,
        amount: storedMoney(line.amount, precision, true),
      })),
      paid_amount: fromMinorUnits(state.paid, precision),
      outstanding_amount: fromMinorUnits(state.remaining, precision),
      excess_amount: fromMinorUnits(state.excess, precision),
      allocations: allocations.map((allocation) => ({
        ...allocation,
        amount: storedMoney(allocation.amount, precision, true),
      })),
      payment_state: state.state,
      overdue: row.canceled_at ? false : state.overdue,
    };
  }
  if (table === "debt_details") {
    await lockFinanceAccounts(ctx, [String(row.account_id)]);
    return {
      type: "debt",
      account_id: row.account_id,
      creditor: row.creditor,
      credit_limit: value(row.credit_limit),
      annual_rate: row.annual_rate === null ? null : storedMoney(String(row.annual_rate), 4, false),
      minimum_payment: value(row.minimum_payment),
      statement_day: row.statement_day,
      due_day: row.due_day,
      payment_terms: row.payment_terms,
    };
  }
  if (table === "savings_goals") {
    const allocations = await sql<Resource[]>`SELECT * FROM finance.goal_allocations
      WHERE workspace_id = ${ctx.workspaceId} AND book_id = ${ctx.book.id} AND goal_id = ${row.id}
        AND revoked_at IS NULL ORDER BY id LIMIT 101`;
    if (allocations.length > 100) {
      financeError("report_too_large", "The goal allocation detail exceeds this bounded response.");
    }
    const result = [];
    for (const allocation of allocations) {
      let status = "unavailable";
      try {
        const funds = await accountFunding(
          ctx,
          String(allocation.account_id),
          String(allocation.funding_basis),
          allocation.valuation_id as string | null,
          today,
          90,
        );
        const [total] = await sql<
          { amount: string }[]
        >`SELECT coalesce(sum(a.amount),0)::text AS amount
          FROM finance.goal_allocations a JOIN finance.savings_goals g
            ON g.workspace_id = a.workspace_id AND g.book_id = a.book_id AND g.id = a.goal_id
          WHERE a.workspace_id = ${ctx.workspaceId} AND a.book_id = ${ctx.book.id}
            AND a.account_id = ${
          String(allocation.account_id)
        } AND a.revoked_at IS NULL AND g.canceled_at IS NULL`;
        status = funds < minorUnits(total.amount, precision) ? "shortfall" : "supported";
      } catch (error) {
        if (!(error instanceof ApiError) || [401, 403].includes(error.status)) throw error;
      }
      result.push({
        id: allocation.id,
        account_id: allocation.account_id,
        amount: value(allocation.amount),
        funding_basis: allocation.funding_basis,
        valuation_id: allocation.valuation_id,
        version: allocation.version,
        backing_status: status,
      });
    }
    return {
      type: "goal",
      person_id: row.person_id,
      target_on: asDate(row.target_on),
      earmarked_amount: fromMinorUnits(
        allocations.reduce(
          (sum, allocation) => sum + minorUnits(String(allocation.amount), precision),
          0n,
        ),
        precision,
      ),
      funding_shortfall: result.some((allocation) => allocation.backing_status !== "supported"),
      allocations: result,
      as_of: today,
      valuation_max_age_days: 90,
    };
  }
  const [latest] = await sql<
    { id: string; valued_on: string; amount: string; source: string; version: number }[]
  >`
    SELECT id, valued_on::text, amount::text, source, version FROM finance.asset_valuations
    WHERE workspace_id = ${ctx.workspaceId} AND book_id = ${ctx.book.id} AND asset_id = ${row.id}
      AND retired_at IS NULL AND valued_on <= ${today}::date ORDER BY valued_on DESC, id DESC LIMIT 1`;
  const [history] = await sql<
    { count: number }[]
  >`SELECT count(*)::int AS count FROM finance.asset_valuations
    WHERE workspace_id = ${ctx.workspaceId} AND book_id = ${ctx.book.id} AND asset_id = ${row.id}`;
  return {
    type: "asset",
    identity_text: row.identity_text,
    ownership_text: row.ownership_text,
    person_id: row.person_id,
    latest_valuation: latest ? { ...latest, amount: value(latest.amount) } : null,
    valuation_history_count: history.count,
    as_of: today,
  };
}

async function readAction(
  ctx: FinanceActionContext,
  name: DomainToolName,
  input: Extract<DomainInput, { action: "get" | "list" }>,
) {
  const { sql } = ctx;
  const table = name === "manage_plan" && "resource_kind" in input && input.resource_kind === "rule"
      ? "recurring_rules"
      : mainTable(name),
    limit = input.action === "get" ? 1 : input.limit ?? 50;
  const after = input.action === "list" ? cursor(input, name) : null;
  const inactiveColumn =
    table === "planned_items" || table === "recurring_rules" || table === "savings_goals"
      ? "canceled_at"
      : "archived_at";
  const rows = await sql<Resource[]>`SELECT * FROM ${sql(`finance.${table}`)}
    WHERE workspace_id = ${ctx.workspaceId} AND book_id = ${ctx.book.id}
      AND (${input.action !== "get"} OR id = ${
    input.action === "get" ? input.resource_id : null
  }::uuid)
      AND (${input.action === "get" || input.include_inactive === true} OR ${
    sql(inactiveColumn)
  } IS NULL)
      AND (${after}::uuid IS NULL OR id > ${after}::uuid)
    ORDER BY id LIMIT ${limit + 1}`;
  if (input.action === "get" && rows.length === 0) {
    financeError("resource_access_denied", "Access to this resource is denied.", 403);
  }
  const items = [];
  for (const row of rows.slice(0, limit)) {
    if (typeof row.person_id === "string") await checkFinancePeople(ctx, [row.person_id], null);
    const rawAmount = row.amount ?? row.target_amount ?? row.credit_limit ?? null;
    items.push({
      id: row.id,
      name: row.name ?? (typeof row.creditor === "string" ? row.creditor : "Debt"),
      version: row.version,
      currency: row.currency,
      inactive: Boolean(row[inactiveColumn]),
      amount: rawAmount === null
        ? null
        : storedMoney(String(rawAmount), ctx.book.minor_unit, false),
      date: asDate(row.period_start ?? row.target_on ?? row.starts_on ?? null),
      details: await readDetails(ctx, table, row),
    });
  }
  const next = rows.length > limit
    ? btoa(
      JSON.stringify({
        v: 1,
        w: ctx.workspaceId,
        b: ctx.book.id,
        n: name,
        s: input.action === "list" && Boolean(input.include_inactive),
        k: "resource_kind" in input ? input.resource_kind ?? "plan" : null,
        i: rows[limit - 1].id,
      }),
    )
    : null;
  return {
    workspace_id: ctx.workspaceId,
    book_id: ctx.book.id,
    action: input.action,
    items,
    next_cursor: next,
  };
}

export function runDomainTool(
  database: Database,
  identity: VerifiedIdentity,
  name: DomainToolName,
  raw: unknown,
): Promise<unknown> {
  const input = parseDomainInput(name, raw);
  if (input.action === "get" || input.action === "list") {
    return withFinanceRead(
      database,
      identity,
      input.workspace_id,
      input.book_id,
      (ctx) => readAction(ctx, name, input),
    );
  }
  return withFinanceMutation(database, identity, input, name, async (ctx) => {
    currency(ctx, input);
    await prelockAccounts(ctx, input);
    switch (name) {
      case "manage_budget":
        return await budgetAction(ctx, input as Exclude<BudgetInput, { action: "get" | "list" }>);
      case "manage_plan":
        return await planAction(ctx, input as Exclude<PlanInput, { action: "get" | "list" }>);
      case "manage_debt":
        return await debtAction(ctx, input as Exclude<DebtInput, { action: "get" | "list" }>);
      case "manage_goal":
        return await goalAction(ctx, input as Exclude<GoalInput, { action: "get" | "list" }>);
      case "manage_asset":
        return await assetAction(ctx, input as Exclude<AssetInput, { action: "get" | "list" }>);
    }
  }, normalized);
}
