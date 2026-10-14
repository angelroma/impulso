import {
  buildFinanceReport,
  EMPTY_DETAIL_DIGEST,
  monthEnd,
  paymentState,
  type ReportSnapshot,
} from "./reports.ts";
import { type FinanceReportInput, reportInputSchema } from "./report_contracts.ts";

const ids = Array.from(
  { length: 10 },
  (_, i) => `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
);
function assert(value: unknown, message = "Report assertion failed"): asserts value {
  if (!value) throw new Error(message);
}
function empty(): ReportSnapshot {
  return {
    accounts: [],
    flows: [],
    summaries: [],
    coverage: [],
    plans: [],
    budgets: [],
    goals: [],
    assets: [],
    person_ids: [],
    archived_accounts: 0,
    unresolved_imports: 0,
  };
}
const request: FinanceReportInput = {
  workspace_id: ids[0],
  book_id: ids[1],
  report: "cash_flow",
  starts_on: "2026-01-01",
  ends_on: "2026-01-31",
  as_of: "2026-01-01",
};
const run = (snapshot: ReportSnapshot, changes: Partial<FinanceReportInput> = {}) =>
  buildFinanceReport({ ...request, ...changes }, snapshot, "MXN", 2, "2026-01-20");

Deno.test("reports reject open inputs, impossible dates and more than 36 calendar months", () => {
  assert(reportInputSchema.safeParse(request).success);
  for (
    const extra of [{ sql: "select 1" }, { as_of: "2026-02-30" }, { starts_on: "2028-01-01" }, {
      ends_on: "2030-01-31",
    }, { valuation_max_age_days: 0 }]
  ) assert(!reportInputSchema.safeParse({ ...request, ...extra }).success);
  assert(reportInputSchema.safeParse({ ...request, ends_on: "2028-12-31" }).success);
  assert(!reportInputSchema.safeParse({ ...request, ends_on: "2029-01-01" }).success);
});
Deno.test("reports preserve exact large sums and transfer-neutral earnings", () => {
  const snapshot = empty();
  snapshot.flows = [
    {
      period_start: "2026-01-01",
      kind: "income",
      category_id: null,
      amount: "90071992547409.9100",
      detail_count: 1,
    },
    {
      period_start: "2026-01-01",
      kind: "expense",
      category_id: null,
      amount: "0.0100",
      detail_count: 1,
    },
    {
      period_start: "2026-01-01",
      kind: "transfer",
      category_id: null,
      amount: "200.0000",
      detail_count: 1,
    },
  ];
  const result = run(snapshot);
  assert(result.income_less_expense === "90071992547409.90");
  assert(result.transferred === "200.00" && result.expense === "0.01");
});
Deno.test("reports preserve early leap years and derive independent payment status", () => {
  assert(monthEnd("0004-02-01") === "0004-02-29");
  assert(monthEnd("0001-02-01") === "0001-02-28");
  assert(monthEnd("0100-02-01") === "0100-02-28");
  assert(paymentState(1000n, 0n) === "unpaid" && paymentState(1000n, 400n) === "partially_paid");
  assert(paymentState(1000n, 1000n) === "paid" && paymentState(1000n, 1100n) === "overpaid");
});
Deno.test("net worth sums signed positions and replaces an investment valuation once", () => {
  const snapshot = empty();
  snapshot.accounts = [
    {
      id: ids[2],
      name: "Bank",
      account_kind: "bank",
      person_id: null,
      opening_balance_on: "2026-01-01",
      balance: "1000.0000",
      valuation: null,
    },
    {
      id: ids[3],
      name: "Loan",
      account_kind: "loan",
      person_id: null,
      opening_balance_on: "2026-01-01",
      balance: "-500.0000",
      valuation: null,
    },
    {
      id: ids[4],
      name: "Investment",
      account_kind: "investment",
      person_id: null,
      opening_balance_on: "2026-01-01",
      balance: "100.0000",
      valuation: {
        id: ids[5],
        valued_on: "2026-01-01",
        amount: "110.0000",
        source: "Reviewed statement",
      },
    },
    {
      id: ids[6],
      name: "Card credit",
      account_kind: "credit_card",
      person_id: null,
      opening_balance_on: "2026-01-01",
      balance: "25.0000",
      valuation: null,
    },
  ];
  const result = run(snapshot, { report: "net_worth" });
  assert(result.net_worth === "635.00" && result.complete);
  assert(
    result.accounts[2].ledger_balance === "100.00" &&
      result.accounts[2].reported_value === "110.00",
  );
});
Deno.test("unknown and pre-opening accounts cannot present verified historical balances", () => {
  const snapshot = empty();
  snapshot.accounts = [{
    id: ids[2],
    name: "Legacy",
    account_kind: "unknown",
    person_id: null,
    opening_balance_on: null,
    balance: "100.0000",
    valuation: null,
  }];
  let result = run(snapshot, { report: "balances" });
  assert(!result.complete && result.accounts[0].ledger_balance === null);
  snapshot.accounts[0].opening_balance_on = "2026-02-01";
  result = run(snapshot, { report: "balances" });
  assert(result.accounts[0].ledger_balance === null);
});
Deno.test("monthly summaries require accepted disjoint unchanged coverage and whole months", () => {
  const snapshot = empty();
  snapshot.summaries = [{
    period_start: "2026-01-01",
    kind: "expense",
    category_id: null,
    amount: "1000.0000",
    detail_count: 0,
  }];
  assert(run(snapshot).expense === "0.00" && !run(snapshot).complete);
  snapshot.coverage = [{
    period_start: "2026-01-01",
    kind: "expense",
    category_id: null,
    authority: "summary",
    reviewed_detail_count: 0,
    reviewed_detail_digest: EMPTY_DETAIL_DIGEST,
  }];
  assert(run(snapshot).expense === "1000.00");
  assert(run(snapshot, { starts_on: "2026-01-02" }).expense === "0.00");
  snapshot.flows = [{
    period_start: "2026-01-01",
    kind: "expense",
    category_id: null,
    amount: "20.0000",
    detail_count: 1,
    detail_digest: "changed",
  }];
  assert(run(snapshot).expense === "0.00" && !run(snapshot).complete);
  snapshot.coverage[0].authority = "detail";
  assert(run(snapshot).expense === "20.00");
});
Deno.test("projections use actual baseline plus only unpaid future remainder", () => {
  const snapshot = empty();
  snapshot.accounts = [{
    id: ids[2],
    name: "Bank",
    account_kind: "bank",
    person_id: null,
    opening_balance_on: "2026-01-01",
    balance: "1000.0000",
    valuation: null,
  }];
  snapshot.plans = [{
    id: ids[3],
    name: "Bill",
    period_start: "2026-01-01",
    due_on: "2026-01-15",
    components_resolved: true,
    quoted_total: null,
    canceled: false,
    lines: [{
      id: ids[4],
      kind: "expense",
      amount: "1000.0000",
      paid: "400.0000",
      source_account_id: ids[2],
      destination_account_id: null,
    }],
  }];
  const result = run(snapshot, { report: "plan_vs_actual" });
  assert(result.projected_balance === "400.00");
  assert(
    result.plans[0].remaining === "600.00" && result.plans[0].payment_state === "partially_paid",
  );
  snapshot.plans[0].due_on = null;
  assert(run(snapshot, { report: "plan_vs_actual" }).projected_balance === null);
});
Deno.test("goals share backing without adding assets or hiding later shortfalls", () => {
  const snapshot = empty();
  snapshot.accounts = [{
    id: ids[2],
    name: "Savings",
    account_kind: "bank",
    person_id: null,
    opening_balance_on: "2026-01-01",
    balance: "100.0000",
    valuation: null,
  }];
  snapshot.goals = [3, 4].map((index) => ({
    id: ids[index],
    name: "Goal",
    target_amount: "100.0000",
    target_on: null,
    allocations: [{ account_id: ids[2], amount: "100.0000", funding_basis: "ledger" as const }],
  }));
  const result = run(snapshot, { report: "goals" });
  assert(result.goals.every((goal) => goal.backed === "50.00" && goal.shortfall === "50.00"));
  assert(
    result.complete && result.issues.some((issue) => issue.code === "goal_underfunded") &&
      result.net_worth === null,
  );
});

Deno.test("cash flow and balances do not inherit unrelated valuation or planning incompleteness", () => {
  const snapshot = empty();
  snapshot.flows = [{
    period_start: "2026-01-01",
    kind: "income",
    category_id: null,
    amount: "500.0000",
    detail_count: 1,
  }];
  snapshot.accounts = [{
    id: ids[2],
    name: "Unknown unrelated account",
    account_kind: "unknown",
    person_id: null,
    opening_balance_on: null,
    balance: "0.0000",
    valuation: null,
  }];
  snapshot.assets = [{ id: ids[3], name: "Unvalued property", person_id: null, valuation: null }];
  snapshot.plans = [{
    id: ids[4],
    name: "Unresolved expectation",
    period_start: "2026-01-01",
    due_on: null,
    components_resolved: false,
    quoted_total: "100.0000",
    canceled: false,
    lines: [],
  }];
  const flow = run(snapshot);
  assert(
    flow.complete && flow.income === "500.00" && flow.accounts.length === 0 &&
      flow.issues.length === 0,
  );
  snapshot.accounts[0] = {
    ...snapshot.accounts[0],
    account_kind: "investment",
    opening_balance_on: "2026-01-01",
  };
  const balances = run(snapshot, { report: "balances" });
  assert(balances.complete && balances.accounts[0].ledger_balance === "0.00");
  assert(!run(snapshot, { report: "net_worth" }).complete);
});

Deno.test("projections exclude known due dates outside the explicit horizon and canceled unresolved plans", () => {
  const snapshot = empty();
  snapshot.accounts = [{
    id: ids[2],
    name: "Bank",
    account_kind: "bank",
    person_id: null,
    opening_balance_on: "2026-01-01",
    balance: "1000.0000",
    valuation: null,
  }];
  snapshot.plans = [{
    id: ids[3],
    name: "Later bill",
    period_start: "2026-01-01",
    due_on: "2026-02-15",
    components_resolved: true,
    quoted_total: null,
    canceled: false,
    lines: [{
      id: ids[4],
      kind: "expense",
      amount: "100.0000",
      paid: "0.0000",
      source_account_id: ids[2],
      destination_account_id: null,
    }],
  }];
  assert(run(snapshot, { report: "upcoming" }).projected_balance === "1000.00");
  snapshot.plans.push({
    id: ids[5],
    name: "Canceled unresolved plan",
    period_start: "2026-01-01",
    due_on: null,
    components_resolved: false,
    quoted_total: "900.0000",
    canceled: true,
    lines: [],
  });
  const result = run(snapshot, { report: "upcoming" });
  assert(result.complete && result.projected_balance === "1000.00");
});

Deno.test("component excess cannot settle another expected component or erase its forecast remainder", () => {
  const snapshot = empty();
  snapshot.accounts = [{
    id: ids[2],
    name: "Bank",
    account_kind: "bank",
    person_id: null,
    opening_balance_on: "2026-01-01",
    balance: "1000.0000",
    valuation: null,
  }];
  snapshot.plans = [{
    id: ids[3],
    name: "Principal and interest",
    period_start: "2026-01-01",
    due_on: "2026-01-15",
    components_resolved: true,
    quoted_total: null,
    canceled: false,
    lines: [
      {
        id: ids[4],
        kind: "expense",
        amount: "100.0000",
        paid: "250.0000",
        source_account_id: ids[2],
        destination_account_id: null,
      },
      {
        id: ids[5],
        kind: "expense",
        amount: "100.0000",
        paid: "0.0000",
        source_account_id: ids[2],
        destination_account_id: null,
      },
    ],
  }];
  const result = run(snapshot, { report: "plan_vs_actual" });
  assert(result.plans[0].paid === "250.00" && result.plans[0].remaining === "100.00");
  assert(
    result.plans[0].excess_amount === "150.00" &&
      result.plans[0].payment_state === "partially_paid",
  );
  assert(result.projected_balance === "900.00");
});

Deno.test("valuation earmarks cannot bypass an unknown or later account opening boundary", () => {
  const snapshot = empty();
  snapshot.accounts = [{
    id: ids[2],
    name: "Investment",
    account_kind: "investment",
    person_id: null,
    opening_balance_on: null,
    balance: "1000.0000",
    valuation: {
      id: ids[5],
      valued_on: "2026-01-01",
      amount: "1100.0000",
      source: "Accepted valuation",
    },
  }];
  snapshot.goals = [{
    id: ids[3],
    name: "Goal",
    target_amount: "100.0000",
    target_on: null,
    allocations: [{ account_id: ids[2], amount: "100.0000", funding_basis: "valuation" }],
  }];
  for (const opening of [null, "2026-02-01"]) {
    snapshot.accounts[0].opening_balance_on = opening;
    const result = run(snapshot, { report: "goals" });
    assert(
      !result.complete && result.goals[0].backed === "0.00" &&
        result.goals[0].shortfall === "100.00",
    );
    assert(result.issues.some((issue) => issue.code === "goal_backing_unavailable"));
  }
});

Deno.test("budget use consumes its own exact interval evidence rather than report month totals", () => {
  const snapshot = empty();
  snapshot.flows = [{
    period_start: "2026-01-01",
    kind: "expense",
    category_id: null,
    amount: "900.0000",
    detail_count: 4,
  }];
  snapshot.budgets = [{
    id: ids[2],
    name: "Mid-month limit",
    person_id: null,
    category_id: null,
    amount: "100.0000",
    starts_on: "2026-01-15",
    ends_on: "2026-02-15",
    flows: [
      {
        period_start: "2026-01-01",
        kind: "expense",
        category_id: null,
        amount: "30.0000",
        detail_count: 1,
      },
      {
        period_start: "2026-02-01",
        kind: "expense",
        category_id: null,
        amount: "40.0000",
        detail_count: 1,
      },
    ],
    summaries: [],
    coverage: [],
  }];
  const result = run(snapshot, { report: "plan_vs_actual" });
  assert(
    result.budgets[0].complete && result.budgets[0].used === "70.00" &&
      result.budgets[0].remaining === "30.00",
  );
  assert(
    result.budgets[0].starts_on === "2026-01-15" && result.budgets[0].ends_on === "2026-02-15",
  );
});

Deno.test("month-only or unassigned summaries cannot supply an exact partial-month or person budget", () => {
  const snapshot = empty();
  const aggregate = {
    period_start: "2026-01-01",
    kind: "expense" as const,
    category_id: null,
    amount: "100.0000",
    detail_count: 0,
  };
  snapshot.budgets = [{
    id: ids[2],
    name: "Scoped limit",
    person_id: null,
    category_id: null,
    amount: "500.0000",
    starts_on: "2026-01-15",
    ends_on: "2026-02-15",
    flows: [],
    summaries: [aggregate],
    coverage: [{
      ...aggregate,
      authority: "summary",
      reviewed_detail_count: 0,
      reviewed_detail_digest: EMPTY_DETAIL_DIGEST,
    }],
  }];
  let result = run(snapshot, { report: "plan_vs_actual" });
  assert(
    !result.budgets[0].complete && result.budgets[0].used === null &&
      result.budgets[0].remaining === null,
  );
  snapshot.budgets[0].starts_on = "2026-01-01";
  snapshot.budgets[0].ends_on = "2026-01-31";
  snapshot.budgets[0].person_id = ids[3];
  result = run(snapshot, { report: "plan_vs_actual" });
  assert(!result.budgets[0].complete && result.budgets[0].used === null);
  snapshot.budgets[0].coverage[0].authority = "detail";
  snapshot.budgets[0].flows = [{ ...aggregate, amount: "12.0000", detail_count: 1 }];
  result = run(snapshot, { report: "plan_vs_actual" });
  assert(result.budgets[0].complete && result.budgets[0].used === "12.00");
});
