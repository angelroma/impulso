import type { VerifiedIdentity } from "./auth.ts";
import type { Database } from "./database.ts";
import {
  checkFinancePeople,
  financeError,
  fromMinorUnits,
  withFinanceRead,
} from "./finance_common.ts";
import { workspaceLocalDate } from "./finance_contracts.ts";
import {
  type FinanceReportInput,
  type FinanceReportResult,
  reportOutputSchema,
  validateReportInput,
} from "./report_contracts.ts";

type Flow = {
  period_start: string;
  kind: "income" | "expense" | "transfer";
  category_id: string | null;
  amount: string;
  detail_count: number;
  detail_digest?: string;
};
type Valuation = { id: string; valued_on: string; amount: string; source: string };
type ReportAccount = {
  id: string;
  name: string;
  account_kind: "unknown" | "cash" | "bank" | "investment" | "credit_card" | "loan";
  person_id: string | null;
  opening_balance_on: string | null;
  balance: string;
  valuation: Valuation | null;
};
type PlanLine = {
  id: string;
  kind: Flow["kind"];
  amount: string;
  paid: string;
  source_account_id: string | null;
  destination_account_id: string | null;
};
type Plan = {
  id: string;
  name: string;
  period_start: string;
  due_on: string | null;
  components_resolved: boolean;
  quoted_total: string | null;
  canceled: boolean;
  lines: PlanLine[];
};
type GoalAllocation = { account_id: string; amount: string; funding_basis: "ledger" | "valuation" };
type ReportCoverage = {
  period_start: string;
  kind: "income" | "expense";
  category_id: string | null;
  authority: "detail" | "summary";
  reviewed_detail_count: number;
  reviewed_detail_digest: string | null;
};
type ReportBudget = {
  id: string;
  name: string;
  person_id: string | null;
  category_id: string | null;
  amount: string;
  starts_on: string;
  ends_on: string;
  flows: Flow[];
  summaries: Flow[];
  coverage: ReportCoverage[];
};
export interface ReportSnapshot {
  accounts: ReportAccount[];
  flows: Flow[];
  summaries: Flow[];
  coverage: ReportCoverage[];
  plans: Plan[];
  budgets: ReportBudget[];
  goals: {
    id: string;
    name: string;
    target_amount: string;
    target_on: string | null;
    allocations: GoalAllocation[];
  }[];
  assets: { id: string; name: string; person_id: string | null; valuation: Valuation | null }[];
  person_ids: string[];
  archived_accounts: number;
  unresolved_imports: number;
}

export function moneyUnits(value: string, precision: number): bigint {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(value);
  if (!match || !Number.isInteger(precision) || precision < 0 || precision > 4) {
    financeError("invalid_report_data", "The stored monetary evidence is invalid.");
  }
  const fraction = match[3] ?? "";
  if (/[1-9]/.test(fraction.slice(precision))) {
    financeError("invalid_report_data", "Stored evidence exceeds the book currency precision.");
  }
  return BigInt(`${match[1]}${match[2]}${fraction.slice(0, precision).padEnd(precision, "0")}`);
}
const maxZero = (value: bigint) => value < 0n ? 0n : value;
const flowKey = (row: { period_start: string; kind: string; category_id: string | null }) =>
  `${row.period_start}|${row.kind}|${row.category_id ?? ""}`;
export function paymentState(
  expected: bigint,
  paid: bigint,
  outstanding = maxZero(expected - paid),
): "unpaid" | "partially_paid" | "paid" | "overpaid" {
  return paid === 0n
    ? "unpaid"
    : outstanding > 0n
    ? "partially_paid"
    : paid > expected
    ? "overpaid"
    : "paid";
}
export function dateAge(asOf: string, date: string): number {
  return Math.floor(
    (Number(new Date(`${asOf}T00:00:00Z`)) - Number(new Date(`${date}T00:00:00Z`))) / 86400000,
  );
}
export function monthEnd(period: string): string {
  const year = Number(period.slice(0, 4)), month = Number(period.slice(5, 7));
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  return `${period.slice(0, 7)}-${
    [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]
  }`;
}
export const EMPTY_DETAIL_DIGEST =
  "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

export function buildFinanceReport(
  input: FinanceReportInput,
  snapshot: ReportSnapshot,
  currency: string,
  precision: number,
  localDate: string,
): FinanceReportResult {
  const money = (value: bigint) => fromMinorUnits(value, precision);
  const units = (value: string) => moneyUnits(value, precision);
  const issues: FinanceReportResult["issues"] = [];
  const issue = (code: string, resourceId: string | null, message: string) => {
    if (issues.length >= 500) {
      financeError("report_too_large", "Narrow the report scope before trying again.", 400);
    }
    issues.push({ code, resource_id: resourceId, message });
  };
  const maxAge = input.valuation_max_age_days ?? 90;
  const needsPlans = ["plan_vs_actual", "upcoming"].includes(input.report);
  const needsCoverage = ["cash_flow", "plan_vs_actual", "upcoming"].includes(input.report);
  const needsAccounts = input.report !== "cash_flow";
  const needsGoals = input.report === "goals";
  const accountsInScope = needsAccounts ? snapshot.accounts : [];
  const plansInScope = needsPlans ? snapshot.plans : [];
  const budgetsInScope = input.report === "plan_vs_actual" ? snapshot.budgets : [];
  const goalsInScope = needsGoals ? snapshot.goals : [];
  const assetsInScope = input.report === "net_worth" ? snapshot.assets : [];
  for (
    const rows of [
      accountsInScope,
      needsCoverage ? snapshot.flows : [],
      needsCoverage ? snapshot.summaries : [],
      needsCoverage ? snapshot.coverage : [],
      plansInScope,
      budgetsInScope,
      goalsInScope,
      assetsInScope,
    ]
  ) {
    if (rows.length > 100) {
      financeError("report_too_large", "Narrow the report scope before trying again.", 400);
    }
  }
  if (needsAccounts && snapshot.archived_accounts) {
    issue(
      "archived_accounts_excluded",
      null,
      "Archived accounts are excluded; account coverage is incomplete.",
    );
  }
  if (snapshot.unresolved_imports) {
    issue(
      "import_review_pending",
      null,
      "Unresolved import evidence is excluded from verified results.",
    );
  }
  const accountBalances = new Map<string, bigint>();
  const valuationBalances = new Map<string, bigint>();
  const valuationBackedAccounts = new Set(
    goalsInScope.flatMap((goal) =>
      goal.allocations.filter((allocation) => allocation.funding_basis === "valuation").map((
        allocation,
      ) => allocation.account_id)
    ),
  );
  let netWorth = 0n;
  const accounts = accountsInScope.map((account) => {
    let ledger: bigint | null = null;
    if (!account.opening_balance_on || account.opening_balance_on > input.as_of) {
      issue(
        "opening_coverage_unknown",
        account.id,
        "A reviewed opening boundary on or before this date is required.",
      );
    } else {
      ledger = units(account.balance);
      accountBalances.set(account.id, ledger);
    }
    if (account.account_kind === "unknown") {
      issue(
        "account_type_unknown",
        account.id,
        "Review the account type before treating its classification as complete.",
      );
    }
    let value = ledger;
    const valuationRelevant = input.report === "net_worth" ||
      valuationBackedAccounts.has(account.id);
    const valuation = account.account_kind === "investment" && valuationRelevant
      ? account.valuation
      : null;
    if (valuation) {
      value = units(valuation.amount);
      if (dateAge(input.as_of, valuation.valued_on) > maxAge) {
        issue(
          "valuation_stale",
          account.id,
          "The accepted valuation is older than the disclosed freshness boundary.",
        );
      } else if (ledger !== null) valuationBalances.set(account.id, value);
    } else if (account.account_kind === "investment" && valuationRelevant) {
      issue(
        "investment_valuation_missing",
        account.id,
        "Only ledger cost is available; market value is unknown.",
      );
    }
    if (value !== null) netWorth += value;
    return {
      account_id: account.id,
      name: account.name,
      account_kind: account.account_kind,
      opening_balance_on: account.opening_balance_on,
      ledger_balance: ledger === null ? null : money(ledger),
      reported_value: value === null ? null : money(value),
      valuation_id: valuation?.id ?? null,
      valued_on: valuation?.valued_on ?? null,
      valuation_source: valuation?.source ?? null,
    };
  });
  const assets = assetsInScope.map((asset) => {
    const valuation = asset.valuation;
    if (!valuation) {
      issue(
        "asset_value_unknown",
        asset.id,
        "This owned asset has no accepted value on or before the report date.",
      );
    } else {
      netWorth += units(valuation.amount);
      if (dateAge(input.as_of, valuation.valued_on) > maxAge) {
        issue(
          "valuation_stale",
          asset.id,
          "The accepted valuation is older than the disclosed freshness boundary.",
        );
      }
    }
    return {
      asset_id: asset.id,
      name: asset.name,
      valuation_id: valuation?.id ?? null,
      valued_on: valuation?.valued_on ?? null,
      amount: valuation ? money(units(valuation.amount)) : null,
      source: valuation?.source ?? null,
    };
  });
  const detail = new Map((needsCoverage ? snapshot.flows : []).map((row) => [flowKey(row), row]));
  const summary = new Map(
    (needsCoverage ? snapshot.summaries : []).map((row) => [flowKey(row), row]),
  );
  const coverage = new Map(
    (needsCoverage ? snapshot.coverage : []).map((row) => [flowKey(row), row]),
  );
  let income = 0n, expense = 0n, transferred = 0n;
  const monthly: FinanceReportResult["monthly"] = [];
  for (const key of new Set([...detail.keys(), ...summary.keys()])) {
    const actual = detail.get(key), aggregate = summary.get(key), choice = coverage.get(key);
    const row = actual ?? aggregate!;
    let selected = actual, basis: "detail" | "summary" | "unresolved" = "detail";
    const wholeMonth = row.period_start >= input.starts_on &&
      monthEnd(row.period_start) <= input.ends_on;
    if (aggregate) {
      if (
        !choice ||
        (choice.authority === "summary" &&
          (choice.reviewed_detail_count !== (actual?.detail_count ?? 0) ||
            choice.reviewed_detail_digest !== (actual?.detail_digest ?? EMPTY_DETAIL_DIGEST))) ||
        (choice.authority === "summary" && !wholeMonth)
      ) {
        selected = undefined;
        basis = "unresolved";
        issue(
          "summary_coverage_unresolved",
          null,
          "Monthly summary overlap, changed detail, or daily precision needs an accepted coverage review.",
        );
      } else if (choice.authority === "summary") {
        selected = aggregate;
        basis = "summary";
      }
    }
    const amount = selected ? units(selected.amount) : 0n;
    if (
      basis === "summary" &&
      ["balances", "net_worth", "plan_vs_actual", "upcoming"].includes(input.report)
    ) {
      issue(
        "summary_has_no_account_effect",
        null,
        "Monthly summaries cannot establish account balances or settle bills.",
      );
    }
    if (row.kind === "income") income += amount;
    else if (row.kind === "expense") expense += amount;
    else transferred += amount;
    monthly.push({
      period_start: row.period_start,
      kind: row.kind,
      category_id: row.category_id,
      amount: money(amount),
      basis,
      detail_count: actual?.detail_count ?? 0,
    });
  }
  if (monthly.length > 100) {
    financeError("report_too_large", "Narrow the report scope before trying again.", 400);
  }
  const projectionDeltas = new Map<string, bigint>();
  const plans = plansInScope.map((plan) => {
    const expected = plan.components_resolved
      ? plan.lines.reduce((sum, line) => sum + units(line.amount), 0n)
      : units(plan.quoted_total ?? "0");
    const paid = plan.lines.reduce((sum, line) => sum + units(line.paid), 0n);
    const outstanding = plan.components_resolved
      ? plan.lines.reduce((sum, line) => sum + maxZero(units(line.amount) - units(line.paid)), 0n)
      : maxZero(expected - paid);
    const excess = plan.lines.reduce(
      (sum, line) => sum + maxZero(units(line.paid) - units(line.amount)),
      0n,
    );
    const remaining = plan.canceled ? 0n : outstanding;
    if (!plan.canceled && !plan.components_resolved) {
      issue(
        "plan_components_unresolved",
        plan.id,
        "The expected total has no accepted financial component breakdown.",
      );
    }
    for (const line of plan.lines) {
      if (plan.canceled || !plan.components_resolved) continue;
      const left = maxZero(units(line.amount) - units(line.paid));
      const effectiveDue = plan.due_on;
      if (effectiveDue && (effectiveDue < input.starts_on || effectiveDue > input.ends_on)) {
        continue;
      }
      if (!effectiveDue || effectiveDue <= input.as_of) {
        if (left) {
          issue(
            "projection_date_unresolved",
            plan.id,
            "An outstanding expectation has no supported future date relative to the baseline.",
          );
        }
        continue;
      }
      if (line.source_account_id) {
        projectionDeltas.set(
          line.source_account_id,
          (projectionDeltas.get(line.source_account_id) ?? 0n) - left,
        );
      } else if (line.kind !== "income" && left) {
        issue(
          "projection_account_unresolved",
          plan.id,
          "An expected outflow has no accepted source account.",
        );
      }
      if (line.destination_account_id) {
        projectionDeltas.set(
          line.destination_account_id,
          (projectionDeltas.get(line.destination_account_id) ?? 0n) + left,
        );
      } else if (line.kind !== "expense" && left) {
        issue(
          "projection_account_unresolved",
          plan.id,
          "An expected inflow has no accepted destination account.",
        );
      }
    }
    return {
      planned_item_id: plan.id,
      name: plan.name,
      period_start: plan.period_start,
      due_on: plan.due_on,
      components_resolved: plan.components_resolved,
      expected: money(expected),
      paid: money(paid),
      remaining: money(remaining),
      payment_state: plan.components_resolved
        ? paymentState(expected, paid, outstanding)
        : "unresolved" as const,
      excess_amount: money(excess),
      overdue: !plan.canceled && !!plan.due_on && plan.due_on < localDate && remaining > 0n,
      canceled: plan.canceled,
    };
  });
  const budgets = budgetsInScope.map((budget) => {
    for (const rows of [budget.flows, budget.summaries, budget.coverage]) {
      if (rows.length > 100) {
        financeError("report_too_large", "Narrow the budget scope before trying again.", 400);
      }
    }
    const details = new Map(budget.flows.map((row) => [flowKey(row), row]));
    const summaries = new Map(budget.summaries.map((row) => [flowKey(row), row]));
    const choices = new Map(budget.coverage.map((row) => [flowKey(row), row]));
    let used = 0n, complete = true;
    for (const key of new Set([...details.keys(), ...summaries.keys()])) {
      const actual = details.get(key), aggregate = summaries.get(key), choice = choices.get(key);
      if (!aggregate) {
        used += units(actual?.amount ?? "0");
        continue;
      }
      if (choice?.authority === "detail") {
        used += units(actual?.amount ?? "0");
        continue;
      }
      const wholeMonth = aggregate.period_start >= budget.starts_on &&
        monthEnd(aggregate.period_start) <= budget.ends_on;
      if (
        choice?.authority === "summary" && budget.person_id === null && wholeMonth &&
        choice.reviewed_detail_count === (actual?.detail_count ?? 0) &&
        choice.reviewed_detail_digest === (actual?.detail_digest ?? EMPTY_DETAIL_DIGEST)
      ) used += units(aggregate.amount);
      else complete = false;
    }
    if (!complete) {
      issue(
        "budget_coverage_unresolved",
        budget.id,
        "Monthly summaries, attribution or changed detail cannot establish this exact budget interval.",
      );
    }
    return {
      budget_id: budget.id,
      name: budget.name,
      person_id: budget.person_id,
      category_id: budget.category_id,
      starts_on: budget.starts_on,
      ends_on: budget.ends_on,
      limit: money(units(budget.amount)),
      used: complete ? money(used) : null,
      remaining: complete ? money(units(budget.amount) - used) : null,
      complete,
    };
  });
  if (
    budgets.some((row) => row.category_id === null) &&
    budgets.some((row) => row.category_id !== null)
  ) {
    issue(
      "overlapping_budget_limits",
      null,
      "Whole-book and category limits are separate comparisons and must not be added together.",
    );
  }
  const allEarmarks = new Map<string, bigint>();
  for (const goal of goalsInScope) {
    if (goal.allocations.length > 100) {
      financeError("report_too_large", "Narrow the goal scope before trying again.", 400);
    }
    for (const allocation of goal.allocations) {
      allEarmarks.set(
        allocation.account_id,
        (allEarmarks.get(allocation.account_id) ?? 0n) + units(allocation.amount),
      );
    }
  }
  const goals = goalsInScope.map((goal) => {
    let earmarked = 0n, backed = 0n;
    for (const allocation of goal.allocations) {
      const amount = units(allocation.amount);
      earmarked += amount;
      const account = accountsInScope.find((account) => account.id === allocation.account_id);
      const eligible = account && ["cash", "bank", "investment"].includes(account.account_kind);
      const funds = !eligible
        ? undefined
        : allocation.funding_basis === "valuation"
        ? valuationBalances.get(allocation.account_id)
        : accountBalances.get(allocation.account_id);
      const total = allEarmarks.get(allocation.account_id)!;
      // Proportional backing prevents counting the same shortfall as available funds for every goal.
      const available = funds === undefined ? 0n : maxZero(funds);
      backed += available >= total ? amount : total ? available * amount / total : 0n;
      if (funds === undefined) {
        issue(
          "goal_backing_unavailable",
          goal.id,
          "A supporting account baseline or fresh accepted valuation is unavailable.",
        );
      }
    }
    if (backed < earmarked) {
      issue("goal_underfunded", goal.id, "Earmarked funds exceed their current available backing.");
    }
    return {
      goal_id: goal.id,
      name: goal.name,
      target_amount: money(units(goal.target_amount)),
      target_on: goal.target_on,
      earmarked: money(earmarked),
      backed: money(backed),
      shortfall: money(earmarked - backed),
    };
  });
  const projectionComplete = accountBalances.size === accountsInScope.length &&
    !issues.some((row) =>
      row.code.startsWith("projection_") || row.code.startsWith("summary_") ||
      [
        "plan_components_unresolved",
        "archived_accounts_excluded",
        "import_review_pending",
        "account_type_unknown",
      ].includes(row.code)
    );
  const projection = projectionComplete
    ? [...accountBalances].reduce(
      (sum, [id, value]) => sum + value + (projectionDeltas.get(id) ?? 0n),
      0n,
    )
    : null;
  const result: FinanceReportResult = {
    workspace_id: input.workspace_id,
    book_id: input.book_id,
    report: input.report,
    currency,
    starts_on: input.starts_on,
    ends_on: input.ends_on,
    as_of: input.as_of,
    valuation_max_age_days: maxAge,
    basis: "effective_ledger_and_reviewed_coverage",
    complete: issues.every((row) =>
      ["overlapping_budget_limits", "goal_underfunded"].includes(row.code)
    ),
    issues,
    income: money(income),
    expense: money(expense),
    income_less_expense: money(income - expense),
    transferred: money(transferred),
    net_worth: input.report === "net_worth" ? money(netWorth) : null,
    projected_balance: ["plan_vs_actual", "upcoming"].includes(input.report) && projection !== null
      ? money(projection)
      : null,
    accounts: needsAccounts ? accounts : [],
    monthly: ["cash_flow", "plan_vs_actual"].includes(input.report) ? monthly : [],
    plans: ["plan_vs_actual", "upcoming"].includes(input.report) ? plans : [],
    budgets: input.report === "plan_vs_actual" ? budgets : [],
    goals: input.report === "goals" ? goals : [],
    assets: input.report === "net_worth" ? assets : [],
  };
  return reportOutputSchema.parse(result);
}

export async function getFinanceReport(
  database: Database,
  identity: VerifiedIdentity,
  raw: unknown,
): Promise<FinanceReportResult> {
  const input = validateReportInput(raw);
  const needsAccounts = input.report !== "cash_flow";
  const needsPlans = ["plan_vs_actual", "upcoming"].includes(input.report);
  const needsCoverage = ["cash_flow", "plan_vs_actual", "upcoming"].includes(input.report);
  const needsBudget = input.report === "plan_vs_actual";
  const needsGoals = input.report === "goals";
  const needsAssets = input.report === "net_worth";
  return await withFinanceRead(
    database,
    identity,
    input.workspace_id,
    input.book_id,
    async (context) => {
      const { sql, book, workspaceId } = context;
      // One statement gives every report component the same snapshot without caching authorization state.
      const [row] = await sql<{ snapshot: ReportSnapshot }[]>`
      WITH t AS (
        SELECT tr.*, c.category_id, c.version AS classification_version FROM finance.transactions tr
        LEFT JOIN finance.transaction_classifications c ON c.workspace_id=tr.workspace_id AND c.book_id=tr.book_id AND c.transaction_id=tr.id
        WHERE tr.workspace_id=${workspaceId} AND tr.book_id=${book.id} AND tr.voided_at IS NULL
      ), ac AS (
        SELECT a.id,a.name,a.account_kind,a.person_id,a.opening_balance_on::text,
          (a.opening_balance + COALESCE((SELECT sum(CASE WHEN t.destination_account_id=a.id THEN t.amount ELSE -t.amount END)
           FROM t WHERE (t.source_account_id=a.id OR t.destination_account_id=a.id) AND t.occurred_on<=${input.as_of}::date
             AND (a.opening_balance_on IS NULL OR t.occurred_on>=a.opening_balance_on)),0))::text AS balance,
          (SELECT jsonb_build_object('id',v.id,'valued_on',v.valued_on::text,'amount',v.amount::text,'source',v.source)
           FROM finance.asset_valuations v WHERE v.workspace_id=a.workspace_id AND v.book_id=a.book_id AND v.account_id=a.id
           AND v.retired_at IS NULL AND v.valued_on<=${input.as_of}::date ORDER BY v.valued_on DESC,v.id DESC LIMIT 1) AS valuation
        FROM finance.accounts a WHERE a.workspace_id=${workspaceId} AND a.book_id=${book.id} AND a.archived_at IS NULL AND ${needsAccounts}
          AND (NOT ${needsGoals} OR EXISTS (SELECT 1 FROM finance.goal_allocations ga JOIN finance.savings_goals g ON g.id=ga.goal_id
            WHERE ga.workspace_id=a.workspace_id AND ga.book_id=a.book_id AND ga.account_id=a.id AND ga.revoked_at IS NULL AND g.canceled_at IS NULL))
        ORDER BY a.id LIMIT 101
      ), f AS (
        SELECT date_trunc('month',occurred_on)::date::text AS period_start,kind,category_id,sum(amount)::text AS amount,count(*)::int AS detail_count,
          encode(sha256(convert_to(string_agg(id::text||':'||version::text||':'||COALESCE(classification_version,0)::text,',' ORDER BY id),'UTF8')),'hex') AS detail_digest
        FROM t WHERE ${needsCoverage} AND occurred_on BETWEEN ${input.starts_on}::date AND ${input.ends_on}::date GROUP BY 1,2,3 ORDER BY 1,2,3 LIMIT 101
      ), su AS (
        SELECT period_start::text,kind,category_id,sum(amount)::text AS amount,0::int AS detail_count FROM finance.monthly_summaries
        WHERE workspace_id=${workspaceId} AND book_id=${book.id} AND retired_at IS NULL AND ${needsCoverage} AND period_start BETWEEN date_trunc('month',${input.starts_on}::date)::date AND ${input.ends_on}::date
        GROUP BY 1,2,3 ORDER BY 1,2,3 LIMIT 101
      ), co AS (
        SELECT period_start::text,kind,category_id,authority,reviewed_detail_count::int,encode(reviewed_detail_digest,'hex') AS reviewed_detail_digest FROM finance.report_coverage
        WHERE workspace_id=${workspaceId} AND book_id=${book.id} AND ${needsCoverage} AND period_start BETWEEN date_trunc('month',${input.starts_on}::date)::date AND ${input.ends_on}::date ORDER BY period_start,id LIMIT 101
      ), pl AS (
        SELECT p.id,p.name,p.period_start::text,p.due_on::text,p.components_resolved,p.quoted_total::text,p.canceled_at IS NOT NULL AS canceled,
          COALESCE((SELECT jsonb_agg(jsonb_build_object('id',l.id,'kind',l.kind,'amount',l.amount::text,'source_account_id',l.source_account_id,'destination_account_id',l.destination_account_id,
          'paid',COALESCE((SELECT sum(a.amount) FROM finance.planned_item_allocations a JOIN t ON t.id=a.transaction_id
             WHERE a.workspace_id=p.workspace_id AND a.book_id=p.book_id AND a.planned_item_line_id=l.id AND a.revoked_at IS NULL AND t.occurred_on<=${input.as_of}::date),0)::text) ORDER BY l.line_number)
          FROM finance.planned_item_lines l WHERE l.workspace_id=p.workspace_id AND l.book_id=p.book_id AND l.planned_item_id=p.id AND l.retired_at IS NULL),'[]'::jsonb) AS lines
        FROM finance.planned_items p WHERE p.workspace_id=${workspaceId} AND p.book_id=${book.id} AND ${needsPlans} AND p.period_start BETWEEN date_trunc('month',${input.starts_on}::date)::date AND ${input.ends_on}::date ORDER BY p.period_start,p.id LIMIT 101
      ), bu AS (
        SELECT b.id,b.name,b.person_id,b.category_id,b.amount::text,b.starts_on::text,b.ends_on::text,
          COALESCE((SELECT jsonb_agg(to_jsonb(bf)) FROM (
            SELECT date_trunc('month',occurred_on)::date::text AS period_start,kind,category_id,sum(amount)::text AS amount,count(*)::int AS detail_count,
              encode(sha256(convert_to(string_agg(id::text||':'||version::text||':'||COALESCE(classification_version,0)::text,',' ORDER BY id),'UTF8')),'hex') AS detail_digest
            FROM t WHERE kind='expense' AND occurred_on BETWEEN b.starts_on AND b.ends_on
              AND (b.category_id IS NULL OR category_id=b.category_id) AND (b.person_id IS NULL OR beneficiary_person_id=b.person_id)
            GROUP BY 1,2,3 ORDER BY 1,2,3 LIMIT 101
          ) bf),'[]'::jsonb) AS flows,
          COALESCE((SELECT jsonb_agg(to_jsonb(bs)) FROM (
            SELECT period_start::text,kind,category_id,sum(amount)::text AS amount,0::int AS detail_count
            FROM finance.monthly_summaries WHERE workspace_id=b.workspace_id AND book_id=b.book_id AND retired_at IS NULL AND kind='expense'
              AND period_start BETWEEN date_trunc('month',b.starts_on)::date AND b.ends_on AND (b.category_id IS NULL OR category_id=b.category_id)
            GROUP BY 1,2,3 ORDER BY 1,2,3 LIMIT 101
          ) bs),'[]'::jsonb) AS summaries,
          COALESCE((SELECT jsonb_agg(to_jsonb(bc)) FROM (
            SELECT period_start::text,kind,category_id,authority,reviewed_detail_count::int,encode(reviewed_detail_digest,'hex') AS reviewed_detail_digest
            FROM finance.report_coverage WHERE workspace_id=b.workspace_id AND book_id=b.book_id AND kind='expense'
              AND period_start BETWEEN date_trunc('month',b.starts_on)::date AND b.ends_on AND (b.category_id IS NULL OR category_id=b.category_id)
            ORDER BY period_start,id LIMIT 101
          ) bc),'[]'::jsonb) AS coverage
        FROM finance.budgets b WHERE b.workspace_id=${workspaceId} AND b.book_id=${book.id} AND b.archived_at IS NULL AND ${needsBudget}
          AND b.starts_on<=${input.ends_on}::date AND b.ends_on>=${input.starts_on}::date ORDER BY b.starts_on,b.id LIMIT 101
      ), go AS (
        SELECT g.id,g.name,g.person_id,g.target_amount::text,g.target_on::text,
        COALESCE((SELECT jsonb_agg(to_jsonb(ga)) FROM (
          SELECT account_id,amount::text,funding_basis FROM finance.goal_allocations a
          WHERE a.workspace_id=g.workspace_id AND a.book_id=g.book_id AND a.goal_id=g.id AND a.revoked_at IS NULL ORDER BY a.id LIMIT 101
        ) ga),'[]'::jsonb) AS allocations
        FROM finance.savings_goals g WHERE g.workspace_id=${workspaceId} AND g.book_id=${book.id} AND g.canceled_at IS NULL AND ${needsGoals} ORDER BY g.id LIMIT 101
      ), ast AS (
        SELECT a.id,a.name,a.person_id,(SELECT jsonb_build_object('id',v.id,'valued_on',v.valued_on::text,'amount',v.amount::text,'source',v.source)
         FROM finance.asset_valuations v WHERE v.workspace_id=a.workspace_id AND v.book_id=a.book_id AND v.asset_id=a.id AND v.retired_at IS NULL AND v.valued_on<=${input.as_of}::date ORDER BY v.valued_on DESC,v.id DESC LIMIT 1) AS valuation
        FROM finance.assets a WHERE a.workspace_id=${workspaceId} AND a.book_id=${book.id} AND a.archived_at IS NULL AND ${needsAssets} ORDER BY a.id LIMIT 101
      ) SELECT jsonb_build_object(
       'accounts',COALESCE((SELECT jsonb_agg(to_jsonb(ac)) FROM ac),'[]'::jsonb),'flows',COALESCE((SELECT jsonb_agg(to_jsonb(f)) FROM f),'[]'::jsonb),
       'summaries',COALESCE((SELECT jsonb_agg(to_jsonb(su)) FROM su),'[]'::jsonb),'coverage',COALESCE((SELECT jsonb_agg(to_jsonb(co)) FROM co),'[]'::jsonb),
       'plans',COALESCE((SELECT jsonb_agg(to_jsonb(pl)) FROM pl),'[]'::jsonb),'budgets',COALESCE((SELECT jsonb_agg(to_jsonb(bu)) FROM bu),'[]'::jsonb),
       'goals',COALESCE((SELECT jsonb_agg(to_jsonb(go)) FROM go),'[]'::jsonb),'assets',COALESCE((SELECT jsonb_agg(to_jsonb(ast)) FROM ast),'[]'::jsonb),
       'person_ids',COALESCE((SELECT jsonb_agg(id) FROM (
         SELECT person_id AS id FROM ac WHERE person_id IS NOT NULL
         UNION SELECT beneficiary_person_id FROM t WHERE beneficiary_person_id IS NOT NULL AND (
           (${needsCoverage} AND occurred_on BETWEEN ${input.starts_on}::date AND ${input.ends_on}::date)
           OR (${needsAccounts} AND occurred_on<=${input.as_of}::date)
           OR EXISTS (SELECT 1 FROM bu b WHERE t.occurred_on BETWEEN b.starts_on::date AND b.ends_on::date AND (b.category_id IS NULL OR t.category_id=b.category_id) AND (b.person_id IS NULL OR t.beneficiary_person_id=b.person_id)))
         UNION SELECT person_id FROM ast WHERE person_id IS NOT NULL
         UNION SELECT person_id FROM go WHERE person_id IS NOT NULL
         UNION SELECT person_id FROM bu WHERE person_id IS NOT NULL
         UNION SELECT l.beneficiary_person_id FROM finance.planned_item_lines l JOIN pl ON pl.id=l.planned_item_id
           WHERE l.workspace_id=${workspaceId} AND l.book_id=${book.id} AND l.retired_at IS NULL AND l.beneficiary_person_id IS NOT NULL
         LIMIT 101
       ) people),'[]'::jsonb),
       'archived_accounts',(SELECT count(*) FROM finance.accounts WHERE workspace_id=${workspaceId} AND book_id=${book.id} AND archived_at IS NOT NULL AND ${needsAccounts} AND NOT ${needsGoals}),
       'unresolved_imports',(SELECT count(*) FROM finance.import_batches WHERE workspace_id=${workspaceId} AND book_id=${book.id} AND status='draft')
      ) AS snapshot
    `.catch((error: unknown) => {
        if (
          error !== null && typeof error === "object" && "code" in error && error.code === "57014"
        ) financeError("report_too_large", "Narrow the report scope before trying again.", 400);
        throw error;
      });
      if (row.snapshot.person_ids.length > 100) {
        financeError(
          "report_too_large",
          "Narrow the report scope before trying again.",
          400,
        );
      }
      await checkFinancePeople(context, row.snapshot.person_ids, null);
      return buildFinanceReport(
        input,
        row.snapshot,
        book.currency,
        book.minor_unit,
        workspaceLocalDate(context.timezone),
      );
    },
  );
}
