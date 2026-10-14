import { DOMAIN_TOOL_SCHEMAS, parseDomainInput } from "./planning_contracts.ts";
import {
  availableEarmarkFunds,
  componentPaymentState,
  paymentState,
  recurrenceDueDate,
  recurrencePeriods,
  valuationFresh,
} from "./planning.ts";
import { ApiError } from "./http.ts";

function assert(value: unknown, message = "The planning assertion failed."): asserts value {
  if (!value) throw new Error(message);
}
function rejects(operation: () => unknown, code: string) {
  try {
    operation();
  } catch (error) {
    assert(error instanceof ApiError && error.code === code, `Expected controlled ${code}.`);
    return;
  }
  throw new Error(`Expected ${code}.`);
}
const id = "11111111-1111-4111-8111-111111111111";
const scope = { request_id: id, workspace_id: id, book_id: id, currency: "MXN" };
const expense = {
  kind: "expense",
  amount: "100.00",
  category_id: null,
  source_account_id: null,
  destination_account_id: null,
  beneficiary_person_id: null,
};

Deno.test("Planning contracts reject unknown nested fields and nondecimal amounts", () => {
  const input = {
    ...scope,
    action: "create",
    name: "Subscription",
    period_start: "2026-02-01",
    due_on: null,
    debt_account_id: null,
    quoted_total: null,
    components_resolved: true,
    lines: [expense],
  };
  assert(parseDomainInput("manage_plan", input).action === "create");
  for (
    const line of [{ ...expense, amount: 100 }, { ...expense, amount: "1e2" }, {
      ...expense,
      sql: "select 1",
    }]
  ) {
    rejects(() => parseDomainInput("manage_plan", { ...input, lines: [line] }), "invalid_input");
  }
  rejects(() => parseDomainInput("manage_plan", { ...input, actor_user_id: id }), "invalid_input");
  rejects(
    () => parseDomainInput("manage_plan", { ...input, due_on: "2026-02-29" }),
    "invalid_input",
  );
});

Deno.test("Related planning tools have bounded closed read and write branches", () => {
  for (const [name, schemas] of Object.entries(DOMAIN_TOOL_SCHEMAS)) {
    assert(
      schemas.input.safeParse({ workspace_id: id, book_id: id, action: "list" }).success,
      name,
    );
    assert(
      !schemas.input.safeParse({ workspace_id: id, book_id: id, action: "list", limit: 101 })
        .success,
    );
    assert(
      !schemas.input.safeParse({ workspace_id: id, book_id: id, action: "delete", resource_id: id })
        .success,
    );
    assert(
      !schemas.output.safeParse({
        workspace_id: id,
        book_id: id,
        action: "list",
        items: [],
        next_cursor: null,
        secret: true,
      }).success,
    );
  }
});

Deno.test("Monthly recurrence is inclusive, bounded and respects end periods", () => {
  assert(
    JSON.stringify(
      recurrencePeriods("monthly", "2026-01-01", "2026-03-01", "2026-02-01", "2026-12-01"),
    ) === '["2026-02-01","2026-03-01"]',
  );
  assert(
    recurrencePeriods("monthly", "2020-01-01", null, "2020-01-01", "2028-04-01").length === 100,
  );
  rejects(
    () => recurrencePeriods("monthly", "2020-01-01", null, "2020-01-01", "2028-05-01"),
    "occurrence_limit",
  );
  rejects(
    () => recurrencePeriods("monthly", "2026-03-01", "2026-02-01", "2026-01-01", "2026-12-01"),
    "invalid_period",
  );
});

Deno.test("Annual recurrence remains aligned to its accepted starting month", () => {
  assert(
    JSON.stringify(recurrencePeriods("annual", "2024-05-01", null, "2025-01-01", "2027-06-01")) ===
      '["2025-05-01","2026-05-01","2027-05-01"]',
  );
  assert(
    recurrencePeriods("annual", "0001-01-01", "0003-01-01", "0001-01-01", "0003-01-01")[0] ===
      "0001-01-01",
  );
});

Deno.test("Accepted short-month rules handle leap years and reject unknown policy", () => {
  assert(recurrenceDueDate("2028-02-01", 31, "last_day") === "2028-02-29");
  assert(recurrenceDueDate("2100-02-01", 31, "last_day") === "2100-02-28");
  assert(recurrenceDueDate("2000-02-01", 31, "last_day") === "2000-02-29");
  assert(recurrenceDueDate("0001-02-01", 31, "last_day") === "0001-02-28");
  assert(recurrenceDueDate("2026-03-01", null, null) === null);
  rejects(() => recurrenceDueDate("2026-02-01", 31, "reject"), "short_month_requires_review");
  rejects(() => recurrenceDueDate("2026-02-01", 10, null), "invalid_day_policy");
});

Deno.test("Payment status derives exact partial, paid and excess amounts independently of due date", () => {
  const partial = paymentState(100000n, 60000n, "2026-01-20", "2026-01-21");
  assert(partial.state === "partially_paid" && partial.remaining === 40000n && partial.overdue);
  const excess = paymentState(100000n, 110000n, "2026-01-20", "2026-01-21");
  assert(
    excess.state === "overpaid" && excess.remaining === 0n && excess.excess === 10000n &&
      !excess.overdue,
  );
  assert(!paymentState(100n, 0n, null, "2026-01-21").overdue);
  assert(!paymentState(100n, 0n, "2026-01-21", "2026-01-21").overdue);
});

Deno.test("Goal availability never invents negative available money or double funds", () => {
  assert(availableEarmarkFunds(100000n, 60000n) === 40000n);
  assert(availableEarmarkFunds(30000n, 60000n) === 0n);
  assert(availableEarmarkFunds(-100n, 0n) === 0n);
});

Deno.test("Overpayment of one expected component cannot settle another component", () => {
  const state = componentPaymentState(
    [{ expected: 10000n, paid: 25000n }, { expected: 10000n, paid: 0n }],
    "2026-01-01",
    "2026-01-02",
  );
  assert(
    state.state === "partially_paid" && state.paid === 25000n && state.remaining === 10000n &&
      state.excess === 15000n && state.overdue,
  );
});

Deno.test("Valuation freshness excludes future values and uses exact accepted day boundaries", () => {
  assert(valuationFresh("2026-01-01", "2026-04-01", 90));
  assert(!valuationFresh("2026-01-01", "2026-04-02", 90));
  assert(!valuationFresh("2026-04-02", "2026-04-01", 90));
  assert(valuationFresh("0001-01-01", "0001-01-02", 1));
});

Deno.test("Debt fields preserve unknown terms and never accept inferred arbitrary metadata", () => {
  const input = {
    ...scope,
    action: "create",
    account_id: id,
    creditor: null,
    credit_limit: null,
    annual_rate: null,
    minimum_payment: null,
    statement_day: null,
    due_day: null,
    payment_terms: null,
  };
  const accepted = parseDomainInput("manage_debt", input);
  assert("annual_rate" in accepted && accepted.annual_rate === null);
  rejects(
    () => parseDomainInput("manage_debt", { ...input, monthly_interest: "200" }),
    "invalid_input",
  );
});

Deno.test("Manual assets require an accepted identity distinct from ledger holdings", () => {
  const input = {
    ...scope,
    action: "create",
    name: "Mi casa",
    identity_text: "Property accepted by user",
    ownership_text: "Owned",
    person_id: null,
    distinct_from_account_holdings: true,
  };
  assert(parseDomainInput("manage_asset", input).action === "create");
  rejects(
    () => parseDomainInput("manage_asset", { ...input, distinct_from_account_holdings: false }),
    "invalid_input",
  );
  rejects(() => parseDomainInput("manage_asset", { ...input, name: "Bad\0name" }), "invalid_input");
});
