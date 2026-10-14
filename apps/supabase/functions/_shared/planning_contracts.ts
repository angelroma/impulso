import { z } from "zod";
import { validateDate } from "./finance_contracts.ts";
import { ApiError } from "./http.ts";

const id = z.uuid().transform((value) => value.toLowerCase());
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  try {
    validateDate(value);
    return true;
  } catch {
    return false;
  }
});
const period = date.refine((value) => value.endsWith("-01"));
const money = z.string().max(128).regex(/^(?:0|[1-9]\d{0,15})(?:\.\d{1,4})?$/);
const text = z.string().min(1).refine((value) =>
  value.trim() === value && value.isWellFormed() && !value.includes("\0") &&
  Array.from(value).length <= 200
);
const note = z.string().min(1).refine((value) =>
  value.trim() === value && value.isWellFormed() && !value.includes("\0") &&
  Array.from(value).length <= 2000
);
const version = z.number().int().min(1).max(2147483646);
const scope = { workspace_id: id, book_id: id };
const write = { ...scope, request_id: id, currency: z.string().regex(/^[A-Z]{3}$/) };
const line = z.object({
  kind: z.enum(["income", "expense", "transfer"]),
  amount: money,
  category_id: id.nullable(),
  source_account_id: id.nullable(),
  destination_account_id: id.nullable(),
  beneficiary_person_id: id.nullable(),
}).strict();
const expected = {
  name: text,
  period_start: period,
  due_on: date.nullable(),
  debt_account_id: id.nullable(),
  quoted_total: money.nullable(),
  components_resolved: z.boolean(),
  lines: z.array(line).max(10),
};
export { expected as expectedPlanFields, line as expectedLineSchema };
const recurrence = {
  name: text,
  interval: z.enum(["monthly", "annual"]),
  start_period: period,
  end_period: period.nullable(),
  due_day: z.number().int().min(1).max(31).nullable(),
  short_month_policy: z.enum(["last_day", "reject"]).nullable(),
  lines: z.array(line).min(1).max(10),
};
const budget = {
  name: text,
  person_id: id.nullable(),
  category_id: id.nullable(),
  starts_on: date,
  ends_on: date,
  amount: money,
};
const debt = {
  creditor: note.nullable(),
  credit_limit: money.nullable(),
  annual_rate: money.nullable(),
  minimum_payment: money.nullable(),
  statement_day: z.number().int().min(1).max(31).nullable(),
  due_day: z.number().int().min(1).max(31).nullable(),
  payment_terms: note.nullable(),
};
const goal = {
  name: text,
  target_amount: money,
  target_on: date.nullable(),
  person_id: id.nullable(),
};
const asset = {
  name: text,
  identity_text: note,
  ownership_text: note,
  person_id: id.nullable(),
  distinct_from_account_holdings: z.literal(true),
};
const valuation = {
  asset_id: id.nullable(),
  account_id: id.nullable(),
  valued_on: date,
  amount: money,
  source: note,
};
const get = z.object({ ...scope, action: z.literal("get"), resource_id: id }).strict();
const list = z.object({
  ...scope,
  action: z.literal("list"),
  limit: z.number().int().min(1).max(100).optional(),
  cursor: z.string().max(1024).optional(),
  include_inactive: z.boolean().optional(),
}).strict();

const budgetInput = z.discriminatedUnion("action", [
  z.object({ ...write, action: z.literal("create"), ...budget }).strict(),
  z.object({
    ...write,
    action: z.literal("revise"),
    budget_id: id,
    expected_version: version,
    ...budget,
  }).strict(),
  z.object({ ...write, action: z.literal("archive"), budget_id: id, expected_version: version })
    .strict(),
  get,
  list,
]);
const planInput = z.discriminatedUnion("action", [
  z.object({ ...write, action: z.literal("create"), ...expected }).strict(),
  z.object({
    ...write,
    action: z.literal("revise"),
    planned_item_id: id,
    expected_version: version,
    ...expected,
  }).strict(),
  z.object({
    ...write,
    action: z.literal("cancel"),
    planned_item_id: id,
    expected_version: version,
  }).strict(),
  z.object({ ...write, action: z.literal("create_rule"), ...recurrence }).strict(),
  z.object({
    ...write,
    action: z.literal("revise_rule"),
    rule_id: id,
    expected_version: version,
    effective_from: period,
    ...recurrence,
  }).strict(),
  z.object({
    ...write,
    action: z.literal("cancel_rule"),
    rule_id: id,
    expected_version: version,
    effective_from: period,
  }).strict(),
  z.object({
    ...write,
    action: z.literal("materialize"),
    rule_id: id,
    expected_version: version,
    from_period: period,
    through_period: period,
  }).strict(),
  z.object({
    ...write,
    action: z.literal("link"),
    planned_item_id: id,
    expected_version: version,
    planned_item_line_id: id,
    transaction_id: id,
    amount: money,
  }).strict(),
  z.object({ ...write, action: z.literal("revoke"), allocation_id: id, expected_version: version })
    .strict(),
  get.extend({ resource_kind: z.enum(["plan", "rule"]).optional() }),
  list.extend({ resource_kind: z.enum(["plan", "rule"]).optional() }),
]);
const debtInput = z.discriminatedUnion("action", [
  z.object({ ...write, action: z.literal("create"), account_id: id, ...debt }).strict(),
  z.object({
    ...write,
    action: z.literal("revise"),
    debt_id: id,
    expected_version: version,
    ...debt,
  }).strict(),
  z.object({ ...write, action: z.literal("archive"), debt_id: id, expected_version: version })
    .strict(),
  get,
  list,
]);
const goalInput = z.discriminatedUnion("action", [
  z.object({ ...write, action: z.literal("create"), ...goal }).strict(),
  z.object({
    ...write,
    action: z.literal("revise"),
    goal_id: id,
    expected_version: version,
    ...goal,
  }).strict(),
  z.object({ ...write, action: z.literal("cancel"), goal_id: id, expected_version: version })
    .strict(),
  z.object({
    ...write,
    action: z.literal("set"),
    goal_id: id,
    expected_version: version,
    account_id: id,
    allocation_id: id.nullable(),
    allocation_expected_version: version.nullable(),
    amount: money,
    funding_basis: z.enum(["ledger", "valuation"]),
    valuation_id: id.nullable(),
    as_of: date,
    valuation_max_age_days: z.number().int().min(1).max(3660).optional(),
  }).strict(),
  z.object({ ...write, action: z.literal("release"), allocation_id: id, expected_version: version })
    .strict(),
  get,
  list,
]);
const assetInput = z.discriminatedUnion("action", [
  z.object({ ...write, action: z.literal("create"), ...asset }).strict(),
  z.object({
    ...write,
    action: z.literal("revise"),
    asset_id: id,
    expected_version: version,
    ...asset,
  }).strict(),
  z.object({ ...write, action: z.literal("archive"), asset_id: id, expected_version: version })
    .strict(),
  z.object({ ...write, action: z.literal("append_valuation"), ...valuation }).strict(),
  z.object({
    ...write,
    action: z.literal("revise_valuation"),
    valuation_id: id,
    expected_version: version,
    ...valuation,
  }).strict(),
  get,
  list,
]);

const mutation = (action: string, extra = {}) =>
  z.object({
    ...scope,
    action: z.literal(action),
    status: z.enum(["completed", "already_processed"]),
    resource_id: id,
    resource_type: z.enum([
      "budget",
      "planned_item",
      "recurring_rule",
      "planned_item_allocation",
      "debt_detail",
      "savings_goal",
      "goal_allocation",
      "asset",
      "asset_valuation",
    ]),
    version,
    ...extra,
  }).strict();
const outputLine = line.extend({ id, line_number: z.number().int().min(1).max(10) }).strict();
const totalMoney = z.string().regex(/^\d+(?:\.\d{1,4})?$/);
const settlementSummary = z.object({
  id,
  planned_item_line_id: id,
  transaction_id: id,
  amount: money,
  version,
  revoked: z.boolean(),
}).strict();
const valueSummary = z.object({ id, valued_on: date, amount: money, source: z.string(), version })
  .strict();
const allocationSummary = z.object({
  id,
  account_id: id,
  amount: money,
  funding_basis: z.enum(["ledger", "valuation"]),
  valuation_id: id.nullable(),
  version,
  backing_status: z.enum(["supported", "shortfall", "unavailable"]),
}).strict();
const details = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("budget"),
    person_id: id.nullable(),
    category_id: id.nullable(),
    starts_on: date,
    ends_on: date,
  }).strict(),
  z.object({
    type: z.literal("plan"),
    period_start: period,
    due_on: date.nullable(),
    debt_account_id: id.nullable(),
    quoted_total: money.nullable(),
    components_resolved: z.boolean(),
    rule_id: id.nullable(),
    rule_version: version.nullable(),
    lines: z.array(outputLine).max(10),
    paid_amount: totalMoney,
    outstanding_amount: totalMoney,
    excess_amount: totalMoney,
    allocations: z.array(settlementSummary).max(100),
    payment_state: z.enum(["unpaid", "partially_paid", "paid", "overpaid"]),
    overdue: z.boolean(),
  }).strict(),
  z.object({
    type: z.literal("rule"),
    interval: z.enum(["monthly", "annual"]),
    start_period: period,
    end_period: period.nullable(),
    due_day: z.number().int().nullable(),
    short_month_policy: z.enum(["last_day", "reject"]).nullable(),
    lines: z.array(outputLine).max(10),
  }).strict(),
  z.object({
    type: z.literal("debt"),
    account_id: id,
    creditor: z.string().nullable(),
    credit_limit: money.nullable(),
    annual_rate: money.nullable(),
    minimum_payment: money.nullable(),
    statement_day: z.number().int().nullable(),
    due_day: z.number().int().nullable(),
    payment_terms: z.string().nullable(),
  }).strict(),
  z.object({
    type: z.literal("goal"),
    person_id: id.nullable(),
    target_on: date.nullable(),
    earmarked_amount: totalMoney,
    funding_shortfall: z.boolean(),
    allocations: z.array(allocationSummary).max(100),
    as_of: date,
    valuation_max_age_days: z.literal(90),
  }).strict(),
  z.object({
    type: z.literal("asset"),
    identity_text: z.string(),
    ownership_text: z.string(),
    person_id: id.nullable(),
    latest_valuation: valueSummary.nullable(),
    valuation_history_count: z.number().int().min(0),
    as_of: date,
  }).strict(),
]);
const item = z.object({
  id,
  name: z.string(),
  version,
  currency: z.string(),
  inactive: z.boolean(),
  amount: money.nullable(),
  date: date.nullable(),
  details,
}).strict();
const readOutput = (action: "get" | "list") =>
  z.object({
    ...scope,
    action: z.literal(action),
    items: z.array(item).max(100),
    next_cursor: z.string().nullable(),
  }).strict();
const output = (actions: readonly string[]) =>
  z.union([
    ...actions.map((action) =>
      mutation(action, action === "materialize" ? { occurrence_ids: z.array(id).max(100) } : {})
    ),
    readOutput("get"),
    readOutput("list"),
  ]);

export const DOMAIN_TOOL_SCHEMAS = {
  manage_budget: { input: budgetInput, output: output(["create", "revise", "archive"]) },
  manage_plan: {
    input: planInput,
    output: output([
      "create",
      "revise",
      "cancel",
      "create_rule",
      "revise_rule",
      "cancel_rule",
      "materialize",
      "link",
      "revoke",
    ]),
  },
  manage_debt: { input: debtInput, output: output(["create", "revise", "archive"]) },
  manage_goal: {
    input: goalInput,
    output: output(["create", "revise", "cancel", "set", "release"]),
  },
  manage_asset: {
    input: assetInput,
    output: output(["create", "revise", "archive", "append_valuation", "revise_valuation"]),
  },
} as const;

export type DomainToolName = keyof typeof DOMAIN_TOOL_SCHEMAS;
export type BudgetInput = z.infer<typeof budgetInput>;
export type PlanInput = z.infer<typeof planInput>;
export type DebtInput = z.infer<typeof debtInput>;
export type GoalInput = z.infer<typeof goalInput>;
export type AssetInput = z.infer<typeof assetInput>;
export type ExpectedLine = z.infer<typeof line>;
export type DomainInput = BudgetInput | PlanInput | DebtInput | GoalInput | AssetInput;
export type DomainWriteInput = Exclude<DomainInput, { action: "get" | "list" }>;

export function parseDomainInput(name: DomainToolName, value: unknown): DomainInput {
  const parsed = DOMAIN_TOOL_SCHEMAS[name].input.safeParse(value);
  if (!parsed.success) {
    throw new ApiError(400, "invalid_input", "A supported closed Finance action is required.");
  }
  return parsed.data;
}
