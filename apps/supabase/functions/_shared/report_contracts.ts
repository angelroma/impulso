import { z } from "zod";
import { validateDate } from "./finance_contracts.ts";
import { ApiError } from "./http.ts";

const uuid = z.string().uuid().transform((value) => value.toLowerCase());
const date = z.string().refine((value) => {
  try {
    validateDate(value);
    return true;
  } catch {
    return false;
  }
});
const amount = z.string().regex(/^-?\d+(?:\.\d{1,4})?$/);
const nullableAmount = amount.nullable();
const kind = z.enum(["income", "expense", "transfer"]);
const accountKind = z.enum(["unknown", "cash", "bank", "investment", "credit_card", "loan"]);
export const reportInputSchema = z.strictObject({
  workspace_id: uuid,
  book_id: uuid,
  report: z.enum(["balances", "cash_flow", "plan_vs_actual", "upcoming", "goals", "net_worth"]),
  starts_on: date,
  ends_on: date,
  as_of: date,
  valuation_max_age_days: z.number().int().min(1).max(3660).optional(),
}).refine((input) =>
  input.starts_on <= input.ends_on &&
  (Number(input.ends_on.slice(0, 4)) - Number(input.starts_on.slice(0, 4))) * 12 +
        Number(input.ends_on.slice(5, 7)) - Number(input.starts_on.slice(5, 7)) < 36
);
const issue = z.strictObject({
  code: z.string(),
  resource_id: uuid.nullable(),
  message: z.string(),
});
const account = z.strictObject({
  account_id: uuid,
  name: z.string(),
  account_kind: accountKind,
  opening_balance_on: date.nullable(),
  ledger_balance: nullableAmount,
  reported_value: nullableAmount,
  valuation_id: uuid.nullable(),
  valued_on: date.nullable(),
  valuation_source: z.string().nullable(),
});
const monthly = z.strictObject({
  period_start: date,
  kind,
  category_id: uuid.nullable(),
  amount,
  basis: z.enum(["detail", "summary", "unresolved"]),
  detail_count: z.number().int().nonnegative(),
});
const plan = z.strictObject({
  planned_item_id: uuid,
  name: z.string(),
  period_start: date,
  due_on: date.nullable(),
  components_resolved: z.boolean(),
  expected: amount,
  paid: amount,
  remaining: amount,
  payment_state: z.enum(["unpaid", "partially_paid", "paid", "overpaid", "unresolved"]),
  excess_amount: amount,
  overdue: z.boolean(),
  canceled: z.boolean(),
});
const budget = z.strictObject({
  budget_id: uuid,
  name: z.string(),
  person_id: uuid.nullable(),
  category_id: uuid.nullable(),
  starts_on: date,
  ends_on: date,
  limit: amount,
  used: nullableAmount,
  remaining: nullableAmount,
  complete: z.boolean(),
});
const goal = z.strictObject({
  goal_id: uuid,
  name: z.string(),
  target_amount: amount,
  target_on: date.nullable(),
  earmarked: amount,
  backed: amount,
  shortfall: amount,
});
const asset = z.strictObject({
  asset_id: uuid,
  name: z.string(),
  valuation_id: uuid.nullable(),
  valued_on: date.nullable(),
  amount: nullableAmount,
  source: z.string().nullable(),
});
export const reportOutputSchema = z.strictObject({
  workspace_id: uuid,
  book_id: uuid,
  report: reportInputSchema.shape.report,
  currency: z.string().regex(/^[A-Z]{3}$/),
  starts_on: date,
  ends_on: date,
  as_of: date,
  valuation_max_age_days: z.number().int(),
  basis: z.literal("effective_ledger_and_reviewed_coverage"),
  complete: z.boolean(),
  issues: z.array(issue).max(500),
  income: amount,
  expense: amount,
  income_less_expense: amount,
  transferred: amount,
  net_worth: nullableAmount,
  projected_balance: nullableAmount,
  accounts: z.array(account).max(100),
  monthly: z.array(monthly).max(100),
  plans: z.array(plan).max(100),
  budgets: z.array(budget).max(100),
  goals: z.array(goal).max(100),
  assets: z.array(asset).max(100),
});
export type FinanceReportInput = z.infer<typeof reportInputSchema>;
export type FinanceReportResult = z.infer<typeof reportOutputSchema>;
export function validateReportInput(raw: unknown): FinanceReportInput {
  const parsed = reportInputSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ApiError(400, "invalid_input", "A valid bounded Finance report request is required.");
  }
  return parsed.data;
}
