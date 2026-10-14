import { createClient } from "@supabase/supabase-js";
import type { VerifiedIdentity } from "../_shared/auth.ts";
import { createDatabase, type Transaction } from "../_shared/database.ts";
import { createAccount, createBook } from "../_shared/finance.ts";
import { workspaceLocalDate } from "../_shared/finance_contracts.ts";
import { runLedgerTool } from "../_shared/ledger.ts";
import { onboard, validateOnboardingInput } from "../_shared/onboarding.ts";
import { runDomainTool } from "../_shared/planning.ts";
import { DOMAIN_TOOL_SCHEMAS, type DomainToolName } from "../_shared/planning_contracts.ts";
import { ApiError } from "../_shared/http.ts";

function assert(
  value: unknown,
  message = "The planning integration assertion failed.",
): asserts value {
  if (!value) throw new Error(message);
}
function required(name: string) {
  const value = Deno.env.get(name);
  assert(value, `Missing local ${name}.`);
  return value;
}
async function denied(operation: () => Promise<unknown>, code: string) {
  try {
    await operation();
  } catch (error) {
    assert(
      error instanceof ApiError && error.code === code,
      `Expected controlled ${code}; received ${
        error instanceof ApiError ? error.code : "uncontrolled error"
      }.`,
    );
    return;
  }
  throw new Error(`Expected ${code}.`);
}
type Result = Record<string, unknown>;

Deno.test("Local planning, debt and wealth preserve evidence and serialize available funds", async (test) => {
  const api = new URL(required("SUPABASE_URL")),
    adminUrl = new URL(required("SUPABASE_DB_URL")),
    serviceUrl = new URL(required("IMPULSO_TEST_DATABASE_URL"));
  assert(
    api.protocol === "http:" && ["127.0.0.1", "localhost"].includes(api.hostname) &&
      api.port === "54321" &&
      [adminUrl, serviceUrl].every((url) =>
        ["127.0.0.1", "localhost"].includes(url.hostname) && url.port === "54322"
      ) &&
      decodeURIComponent(serviceUrl.username) === "impulso_backend",
    "Planning fixtures require the local Impulso stack.",
  );
  const options = {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  };
  const admin = createClient(api.origin, required("SUPABASE_SERVICE_ROLE_KEY"), options);
  const client = createClient(api.origin, required("SUPABASE_ANON_KEY"), options);
  const database = createDatabase(adminUrl.href),
    service = createDatabase(serviceUrl.href),
    concurrent = createDatabase(serviceUrl.href);
  let userId: string | null = null, workspaceId: string | null = null;
  const email = `planning-${crypto.randomUUID()}@impulso.test.invalid`,
    password = `${crypto.randomUUID()}aA1!`;
  async function step(name: string, operation: () => Promise<void>) {
    assert(await test.step(name, operation), "Dependent planning checks stopped after a failure.");
  }
  try {
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    assert(!created.error && created.data.user);
    userId = created.data.user.id;
    const signedIn = await client.auth.signInWithPassword({ email, password });
    assert(!signedIn.error && signedIn.data.session);
    const payload = signedIn.data.session.access_token.split(".")[1].replaceAll("-", "+")
      .replaceAll("_", "/");
    const identity: VerifiedIdentity = {
      user_id: userId,
      session_id:
        JSON.parse(atob(payload.padEnd(Math.ceil(payload.length / 4) * 4, "="))).session_id,
      email,
    };
    const onboarding = await onboard(
      service,
      identity,
      validateOnboardingInput({
        request_id: crypto.randomUUID(),
        workspace_name: "Planning test",
        display_name: "Planning test",
        timezone: "America/Mexico_City",
      }),
    );
    workspaceId = onboarding.workspace_id;
    const book = await createBook(service, identity, {
      request_id: crypto.randomUUID(),
      workspace_id: workspaceId,
      name: "Planning book",
      currency: "MXN",
    });
    const scope = { workspace_id: workspaceId, book_id: book.book_id };
    const today = workspaceLocalDate("America/Mexico_City"), period = `${today.slice(0, 7)}-01`;
    const write = () => ({ ...scope, request_id: crypto.randomUUID(), currency: "MXN" });
    const account = async (name: string, opening: string, kind: string) => {
      const result = await createAccount(service, identity, {
        ...write(),
        name,
        opening_balance: opening,
        person_id: null,
      });
      await runLedgerTool(service, identity, "configure_account", {
        ...scope,
        request_id: crypto.randomUUID(),
        account_id: result.account_id,
        expected_version: 1,
        account_kind: kind,
        opening_balance_on: "2026-01-01",
      });
      return result.account_id;
    };
    const bank = await account("Bank", "1000.00", "bank"),
      investment = await account("Investment", "500.00", "investment"),
      card = await account("Card", "-100.00", "credit_card");
    const tool = async (
      name: DomainToolName,
      input: unknown,
      connection = service,
    ): Promise<Result> => {
      const result = await runDomainTool(connection, identity, name, input);
      const parsed = DOMAIN_TOOL_SCHEMAS[name].output.safeParse(result);
      assert(parsed.success, `The ${name} result must satisfy its closed output contract.`);
      return result as Result;
    };
    const expectedLine = (amount: string) => ({
      kind: "expense",
      amount,
      category_id: null,
      source_account_id: bank,
      destination_account_id: null,
      beneficiary_person_id: null,
    });
    const planInput = (amount: string, name = "Bill") => ({
      ...write(),
      action: "create",
      name,
      period_start: period,
      due_on: null,
      debt_account_id: null,
      quoted_total: amount,
      components_resolved: true,
      lines: [expectedLine(amount)],
    });
    const getPlan = async (id: string) => {
      const result = await tool("manage_plan", { ...scope, action: "get", resource_id: id });
      return (result.items as {
        id: string;
        version: number;
        details: {
          lines: { id: string }[];
          payment_state: string;
          outstanding_amount: string;
          excess_amount: string;
          overdue: boolean;
          allocations: { id: string; version: number; revoked: boolean }[];
        };
      }[])[0];
    };
    let billId = "", lineId = "", billVersion = 1, actualId = "";
    await step(
      "Unresolved expectations preserve quoted totals and require exact accepted resolution",
      async () => {
        const input = { ...planInput("1000.00"), components_resolved: false, lines: [] };
        const result = await tool("manage_plan", input);
        billId = String(result.resource_id);
        const [before] = await database<
          { count: number }[]
        >`SELECT count(*)::int AS count FROM finance.transactions WHERE workspace_id = ${workspaceId}`;
        assert(before.count === 0);
        await denied(
          () =>
            tool("manage_plan", {
              ...planInput("1000.00"),
              action: "revise",
              planned_item_id: billId,
              expected_version: 1,
              lines: [expectedLine("900.00")],
            }),
          "unresolved_components",
        );
        await tool("manage_plan", {
          ...planInput("1000.00"),
          action: "revise",
          planned_item_id: billId,
          expected_version: 1,
        });
        const bill = await getPlan(billId);
        lineId = bill.details.lines[0].id;
        billVersion = bill.version;
        assert(bill.details.payment_state === "unpaid" && !bill.details.overdue);
        await denied(
          () =>
            tool("manage_plan", {
              ...planInput("1000.00"),
              action: "revise",
              planned_item_id: billId,
              expected_version: 1,
            }),
          "version_conflict",
        );
        const competing = await Promise.allSettled(
          ["Revision A", "Revision B"].map((name, index) =>
            tool("manage_plan", {
              ...planInput("1000.00", name),
              action: "revise",
              planned_item_id: billId,
              expected_version: billVersion,
            }, index ? concurrent : service)
          ),
        );
        assert(competing.filter((result) => result.status === "fulfilled").length === 1);
        const current = await getPlan(billId);
        lineId = current.details.lines[0].id;
        billVersion = current.version;
      },
    );
    await step(
      "Multiple category budgets remain limits rather than additional actual outflows",
      async () => {
        const categories = [];
        for (const name of ["Food", "Home"]) {
          const result = await runLedgerTool(service, identity, "manage_category", {
            ...scope,
            request_id: crypto.randomUUID(),
            action: "create",
            kind: "expense",
            name,
          });
          categories.push((result.category as { category_id: string }).category_id);
        }
        for (const categoryId of [null, ...categories]) {
          await tool("manage_budget", {
            ...write(),
            action: "create",
            name: "Monthly limit",
            person_id: null,
            category_id: categoryId,
            starts_on: "2026-01-01",
            ends_on: "2026-02-01",
            amount: "3000.00",
          });
        }
        const [counts] = await database<
          { budgets: number; actual: number }[]
        >`SELECT (SELECT count(*) FROM finance.budgets WHERE workspace_id = ${workspaceId})::int AS budgets,
        (SELECT count(*) FROM finance.transactions WHERE workspace_id = ${workspaceId})::int AS actual`;
        assert(counts.budgets === 3 && counts.actual === 0);
      },
    );
    await step(
      "Recurring day-31 commitments materialize leap February exactly once across fresh keys",
      async () => {
        const rule = await tool("manage_plan", {
          ...write(),
          action: "create_rule",
          name: "Subscription",
          interval: "monthly",
          start_period: "2028-01-01",
          end_period: "2028-03-01",
          due_day: 31,
          short_month_policy: "last_day",
          lines: [expectedLine("100.00")],
        });
        const input = {
          ...write(),
          action: "materialize",
          rule_id: rule.resource_id,
          expected_version: 1,
          from_period: "2028-01-01",
          through_period: "2028-12-01",
        };
        const first = await tool("manage_plan", input),
          retry = await tool("manage_plan", input),
          fresh = await tool("manage_plan", { ...input, request_id: crypto.randomUUID() });
        assert(
          (first.occurrence_ids as string[]).length === 3 && retry.status === "already_processed" &&
            JSON.stringify(first.occurrence_ids) === JSON.stringify(fresh.occurrence_ids),
        );
        const [february] = await database<
          { due_on: string }[]
        >`SELECT due_on::text FROM finance.planned_items WHERE workspace_id = ${workspaceId} AND rule_id = ${
          String(rule.resource_id)
        } AND period_start = '2028-02-01'`;
        assert(february.due_on === "2028-02-29");
        const firstPlanId = (first.occurrence_ids as string[])[0],
          firstPlan = await getPlan(firstPlanId);
        const actual = await runLedgerTool(service, identity, "record_transaction", {
          ...scope,
          request_id: crypto.randomUUID(),
          action: "single",
          entry: {
            kind: "expense",
            amount: "100.00",
            currency: "MXN",
            source_account_id: bank,
            beneficiary_person_id: null,
            category_id: null,
            occurred_on: today,
            description: "Accepted prepayment",
            settlement_links: [{
              planned_item_line_id: firstPlan.details.lines[0].id,
              amount: "100.00",
            }],
          },
        });
        await tool("manage_plan", {
          ...write(),
          action: "revise_rule",
          rule_id: rule.resource_id,
          expected_version: 1,
          effective_from: "2028-01-01",
          name: "Revised subscription",
          interval: "monthly",
          start_period: "2028-01-01",
          end_period: "2028-03-01",
          due_day: 31,
          short_month_policy: "last_day",
          lines: [expectedLine("200.00")],
        });
        const [paid] = await database<
          { rule_version: number; amount: string }[]
        >`SELECT p.rule_version, l.amount::text FROM finance.planned_items p JOIN finance.planned_item_lines l ON l.planned_item_id = p.id AND l.retired_at IS NULL WHERE p.id = ${firstPlanId}`;
        assert(paid.rule_version === 1 && paid.amount === "100.0000");
        const [unpaid] = await database<
          { rule_version: number; amount: string }[]
        >`SELECT p.rule_version, l.amount::text FROM finance.planned_items p JOIN finance.planned_item_lines l ON l.planned_item_id = p.id AND l.retired_at IS NULL WHERE p.id = ${
          (first.occurrence_ids as string[])[1]
        }`;
        assert(unpaid.rule_version === 2 && unpaid.amount === "200.0000");
        const paidPlan = await getPlan(firstPlanId);
        await tool("manage_plan", {
          ...write(),
          action: "cancel",
          planned_item_id: firstPlanId,
          expected_version: paidPlan.version,
        });
        const [preserved] = await database<
          { voided_at: Date | null }[]
        >`SELECT voided_at FROM finance.transactions WHERE id = ${
          (actual.entry as { transaction_id: string }).transaction_id
        }`;
        assert(preserved.voided_at === null);
      },
    );
    await step(
      "Excess and partial settlements consume real movements once without inventing more money",
      async () => {
        const actual = await runLedgerTool(service, identity, "record_transaction", {
          ...scope,
          request_id: crypto.randomUUID(),
          action: "single",
          entry: {
            kind: "expense",
            amount: "1100.00",
            source_account_id: bank,
            category_id: null,
            beneficiary_person_id: null,
            currency: "MXN",
            occurred_on: today,
            description: "Accepted actual bill",
          },
        });
        actualId = (actual.entry as { transaction_id: string }).transaction_id;
        const input = {
          ...write(),
          action: "link",
          planned_item_id: billId,
          expected_version: billVersion,
          planned_item_line_id: lineId,
          transaction_id: actualId,
          amount: "1100.00",
        };
        const linked = await tool("manage_plan", input);
        await tool("manage_plan", input);
        const bill = await getPlan(billId);
        assert(
          bill.details.payment_state === "overpaid" && bill.details.outstanding_amount === "0.00" &&
            bill.details.excess_amount === "100.00",
        );
        assert(
          bill.details.allocations.some((allocation) =>
            allocation.id === linked.resource_id && allocation.version === 1 && !allocation.revoked
          ),
        );
        const second = await tool("manage_plan", planInput("1000.00", "Other bill"));
        const secondPlan = await getPlan(String(second.resource_id));
        await denied(
          () =>
            tool("manage_plan", {
              ...write(),
              action: "link",
              planned_item_id: second.resource_id,
              expected_version: 1,
              planned_item_line_id: secondPlan.details.lines[0].id,
              transaction_id: actualId,
              amount: "1.00",
            }),
          "actual_amount_overallocated",
        );
        await tool("manage_plan", {
          ...write(),
          action: "revoke",
          allocation_id: linked.resource_id,
          expected_version: 1,
        });
        assert((await getPlan(billId)).details.payment_state === "unpaid");
      },
    );
    await step(
      "Concurrent matching cannot spend the same available actual amount twice",
      async () => {
        const first = await tool("manage_plan", planInput("600.00", "Concurrent A")),
          second = await tool("manage_plan", planInput("600.00", "Concurrent B"));
        const firstPlan = await getPlan(String(first.resource_id)),
          secondPlan = await getPlan(String(second.resource_id));
        const settled = await Promise.allSettled([
          tool("manage_plan", {
            ...write(),
            action: "link",
            planned_item_id: first.resource_id,
            expected_version: 1,
            planned_item_line_id: firstPlan.details.lines[0].id,
            transaction_id: actualId,
            amount: "600.00",
          }),
          tool("manage_plan", {
            ...write(),
            action: "link",
            planned_item_id: second.resource_id,
            expected_version: 1,
            planned_item_line_id: secondPlan.details.lines[0].id,
            transaction_id: actualId,
            amount: "600.00",
          }, concurrent),
        ]);
        assert(settled.filter((result) => result.status === "fulfilled").length === 1);
        const failure = settled.find((result) =>
          result.status === "rejected"
        ) as PromiseRejectedResult;
        assert(
          failure.reason instanceof ApiError &&
            failure.reason.code === "actual_amount_overallocated",
        );
      },
    );
    await step(
      "An excess allocation cannot falsely settle another accepted component",
      async () => {
        const result = await tool("manage_plan", {
          ...planInput("200.00", "Split expectation"),
          lines: [
            { ...expectedLine("100.00"), source_account_id: card },
            { ...expectedLine("100.00"), source_account_id: card },
          ],
        });
        const plan = await getPlan(String(result.resource_id));
        await runLedgerTool(service, identity, "record_transaction", {
          ...scope,
          request_id: crypto.randomUUID(),
          action: "single",
          entry: {
            kind: "expense",
            amount: "250.00",
            currency: "MXN",
            source_account_id: card,
            category_id: null,
            beneficiary_person_id: null,
            occurred_on: today,
            description: "Accepted component excess",
            settlement_links: [{
              planned_item_line_id: plan.details.lines[0].id,
              amount: "250.00",
            }],
          },
        });
        const read = await getPlan(String(result.resource_id));
        assert(
          read.details.payment_state === "partially_paid" &&
            read.details.outstanding_amount === "100.00" && read.details.excess_amount === "150.00",
        );
      },
    );
    await step("Linked actual corrections require complete explicit reconciliation", async () => {
      const input = {
        ...scope,
        request_id: crypto.randomUUID(),
        action: "void",
        transaction_id: actualId,
        expected_version: 1,
        reason: "Reviewed correction",
        reconcile_allocations: [],
      };
      await denied(
        () => runLedgerTool(service, identity, "correct_transaction", input),
        "settlement_requires_review",
      );
      const allocation = await database<
        { id: string; version: number }[]
      >`SELECT id, version FROM finance.planned_item_allocations WHERE workspace_id = ${workspaceId} AND transaction_id = ${actualId} AND revoked_at IS NULL`;
      await runLedgerTool(service, identity, "correct_transaction", {
        ...input,
        request_id: crypto.randomUUID(),
        reconcile_allocations: allocation.map((row) => ({
          allocation_id: row.id,
          expected_version: row.version,
          action: "revoke",
        })),
      });
      const [active] = await database<
        { count: number }[]
      >`SELECT count(*)::int AS count FROM finance.planned_item_allocations WHERE workspace_id = ${workspaceId} AND transaction_id = ${actualId} AND revoked_at IS NULL`;
      assert(active.count === 0);
    });
    await step(
      "Debt metadata preserves unknown terms and cannot attach to a cash account",
      async () => {
        const fields = {
          creditor: "Known lender",
          credit_limit: null,
          annual_rate: null,
          minimum_payment: null,
          statement_day: null,
          due_day: null,
          payment_terms: null,
        };
        await denied(
          () => tool("manage_debt", { ...write(), action: "create", account_id: bank, ...fields }),
          "invalid_debt_account",
        );
        const debt = await tool("manage_debt", {
          ...write(),
          action: "create",
          account_id: card,
          ...fields,
        });
        const read = await tool("manage_debt", {
          ...scope,
          action: "get",
          resource_id: debt.resource_id,
        });
        assert(
          (read.items as { details: { annual_rate: unknown } }[])[0].details.annual_rate === null,
        );
        const unresolved = {
          ...planInput("250.00", "Unresolved installment"),
          debt_account_id: card,
          components_resolved: false,
          lines: [],
        };
        await tool("manage_plan", unresolved);
        await tool("manage_debt", {
          ...write(),
          action: "archive",
          debt_id: debt.resource_id,
          expected_version: 1,
        });
        await denied(
          () => tool("manage_plan", { ...unresolved, request_id: crypto.randomUUID() }),
          "action_retired",
        );
        await denied(() => tool("manage_plan", unresolved), "action_retired");
      },
    );
    let fundedGoal = "", fundedAllocation = "";
    await step(
      "Concurrent goals share one account capacity and accepted same-key retries remain single",
      async () => {
        const goals = [];
        for (const name of ["Trip", "Car"]) {
          goals.push(
            await tool("manage_goal", {
              ...write(),
              action: "create",
              name,
              target_amount: "1000.00",
              target_on: null,
              person_id: null,
            }),
          );
        }
        const inputs = goals.map((goal) => ({
          ...write(),
          action: "set",
          goal_id: goal.resource_id,
          expected_version: 1,
          account_id: bank,
          allocation_id: null,
          allocation_expected_version: null,
          amount: "600.00",
          funding_basis: "ledger",
          valuation_id: null,
          as_of: today,
        }));
        const results = await Promise.allSettled([
          tool("manage_goal", inputs[0]),
          tool("manage_goal", inputs[1], concurrent),
        ]);
        assert(results.filter((result) => result.status === "fulfilled").length === 1);
        const winner = results.findIndex((result) => result.status === "fulfilled"),
          result = results[winner] as PromiseFulfilledResult<Result>;
        fundedGoal = String(goals[winner].resource_id);
        fundedAllocation = String(result.value.resource_id);
        assert((await tool("manage_goal", inputs[winner])).status === "already_processed");
      },
    );
    await step(
      "Later spending discloses earmark shortfalls and goal cancellation preserves actual history",
      async () => {
        await runLedgerTool(service, identity, "record_transaction", {
          ...scope,
          request_id: crypto.randomUUID(),
          action: "single",
          entry: {
            kind: "expense",
            amount: "500.00",
            source_account_id: bank,
            category_id: null,
            beneficiary_person_id: null,
            currency: "MXN",
            occurred_on: today,
            description: "Later spending",
          },
        });
        const read = await tool("manage_goal", {
          ...scope,
          action: "get",
          resource_id: fundedGoal,
        });
        const goal =
          (read.items as { version: number; details: { funding_shortfall: boolean } }[])[0];
        assert(goal.details.funding_shortfall);
        await tool("manage_goal", {
          ...write(),
          action: "cancel",
          goal_id: fundedGoal,
          expected_version: goal.version,
        });
        const [history] = await database<
          { count: number }[]
        >`SELECT count(*)::int AS count FROM finance.goal_allocations WHERE id = ${fundedAllocation}`;
        assert(history.count === 1);
      },
    );
    await step(
      "Investment funding requires a fresh accepted basis and preserves shared-basis rules",
      async () => {
        const stale = await tool("manage_asset", {
          ...write(),
          action: "append_valuation",
          asset_id: null,
          account_id: investment,
          valued_on: "2026-01-01",
          amount: "1000.00",
          source: "Reviewed old statement",
        });
        const goal = await tool("manage_goal", {
          ...write(),
          action: "create",
          name: "Investment goal",
          target_amount: "1500.00",
          target_on: null,
          person_id: null,
        });
        const input = {
          ...write(),
          action: "set",
          goal_id: goal.resource_id,
          expected_version: 1,
          account_id: investment,
          allocation_id: null,
          allocation_expected_version: null,
          amount: "600.00",
          funding_basis: "valuation",
          valuation_id: stale.resource_id,
          as_of: today,
          valuation_max_age_days: 1,
        };
        await denied(() => tool("manage_goal", input), "valuation_unavailable");
        const fresh = await tool("manage_asset", {
          ...write(),
          action: "append_valuation",
          asset_id: null,
          account_id: investment,
          valued_on: today,
          amount: "1000.00",
          source: "Accepted current statement",
        });
        await tool("manage_goal", {
          ...input,
          request_id: crypto.randomUUID(),
          valuation_id: fresh.resource_id,
        });
        const another = await tool("manage_goal", {
          ...write(),
          action: "create",
          name: "Other investment goal",
          target_amount: "100.00",
          target_on: null,
          person_id: null,
        });
        await denied(
          () =>
            tool("manage_goal", {
              ...input,
              request_id: crypto.randomUUID(),
              goal_id: another.resource_id,
              funding_basis: "ledger",
              valuation_id: null,
              amount: "100.00",
            }),
          "funding_basis_conflict",
        );
      },
    );
    await step(
      "Manual valuations preserve zero and correction history while excluding future values",
      async () => {
        const asset = await tool("manage_asset", {
          ...write(),
          action: "create",
          name: "Mi coche",
          identity_text: "Distinct vehicle",
          ownership_text: "Owned",
          person_id: null,
          distinct_from_account_holdings: true,
        });
        const zero = await tool("manage_asset", {
          ...write(),
          action: "append_valuation",
          asset_id: asset.resource_id,
          account_id: null,
          valued_on: today,
          amount: "0.00",
          source: "Accepted zero value",
        });
        await tool("manage_asset", {
          ...write(),
          action: "revise_valuation",
          valuation_id: zero.resource_id,
          expected_version: 1,
          asset_id: asset.resource_id,
          account_id: null,
          valued_on: today,
          amount: "200.00",
          source: "Accepted correction",
        });
        await tool("manage_asset", {
          ...write(),
          action: "append_valuation",
          asset_id: asset.resource_id,
          account_id: null,
          valued_on: "2099-01-01",
          amount: "999.00",
          source: "Future observation",
        });
        const read = await tool("manage_asset", {
          ...scope,
          action: "get",
          resource_id: asset.resource_id,
        });
        const item = (read.items as {
          details: { latest_valuation: { amount: string }; valuation_history_count: number };
        }[])[0];
        assert(
          item.details.latest_valuation.amount === "200.00" &&
            item.details.valuation_history_count === 3,
        );
        await denied(
          () =>
            tool("manage_asset", {
              ...write(),
              action: "append_valuation",
              asset_id: asset.resource_id,
              account_id: investment,
              valued_on: today,
              amount: "1.00",
              source: "Invalid double target",
            }),
          "invalid_valuation_target",
        );
      },
    );
    await step(
      "Read continuations bind scope and viewers cannot mutate or recover writer actions",
      async () => {
        const first = await tool("manage_budget", { ...scope, action: "list", limit: 1 });
        assert(typeof first.next_cursor === "string");
        const second = await tool("manage_budget", {
          ...scope,
          action: "list",
          limit: 1,
          cursor: first.next_cursor,
        });
        assert(
          (first.items as { id: string }[])[0].id !== (second.items as { id: string }[])[0].id,
        );
        const malformed = JSON.parse(atob(String(first.next_cursor)));
        malformed.i = "-".repeat(36);
        await denied(
          () =>
            tool("manage_budget", {
              ...scope,
              action: "list",
              cursor: btoa(JSON.stringify(malformed)),
            }),
          "invalid_cursor",
        );
        await denied(() =>
          tool("manage_budget", {
            ...scope,
            action: "list",
            limit: 1,
            cursor: first.next_cursor,
            include_inactive: true,
          }), "invalid_cursor");
        await database`UPDATE finance.book_access SET role = 'viewer' WHERE workspace_id = ${workspaceId} AND book_id = ${book.book_id} AND user_id = ${userId}`;
        await tool("manage_budget", { ...scope, action: "list" });
        await denied(() => tool("manage_plan", planInput("1.00")), "book_access_denied");
        await database`UPDATE finance.book_access SET role = 'owner' WHERE workspace_id = ${workspaceId} AND book_id = ${book.book_id} AND user_id = ${userId}`;
      },
    );
    await step("Late failures roll back plans, lines, audit and receipts together", async () => {
      const input = planInput("2.00", "Rollback fixture"),
        failure = new Error("Intentional postwrite failure");
      const failing = new Proxy(service, {
        get(target, property, receiver) {
          if (property !== "begin") return Reflect.get(target, property, receiver);
          return (operation: (sql: Transaction) => Promise<unknown>) =>
            target.begin(async (sql) => {
              await operation(sql);
              throw failure;
            });
        },
      });
      try {
        await runDomainTool(failing, identity, "manage_plan", input);
        throw new Error("Rollback unexpectedly committed.");
      } catch (error) {
        assert(error === failure);
      }
      const [row] = await database<
        { receipts: number; plans: number }[]
      >`SELECT (SELECT count(*) FROM private.operation_receipts WHERE request_id = ${input.request_id})::int AS receipts,
        (SELECT count(*) FROM finance.planned_items WHERE workspace_id = ${workspaceId} AND name = 'Rollback fixture')::int AS plans`;
      assert(row.receipts === 0 && row.plans === 0);
    });
  } finally {
    const failures: string[] = [];
    if (workspaceId) {
      try {
        await database.begin(async (sql) => {
          for (
            const table of [
              "private.operation_receipts",
              "audit.events",
              "finance.goal_allocations",
              "finance.asset_valuations",
              "finance.assets",
              "finance.savings_goals",
              "finance.planned_item_allocations",
              "finance.planned_item_lines",
              "finance.planned_items",
              "finance.recurring_rule_lines",
              "finance.recurring_rules",
              "finance.debt_details",
              "finance.transaction_classifications",
              "finance.transactions",
              "finance.transaction_groups",
              "finance.budgets",
              "finance.categories",
              "finance.accounts",
              "finance.book_access",
              "finance.books",
              "core.person_aliases",
              "core.person_access",
              "core.person_user_links",
              "core.people",
              "core.workspace_members",
            ]
          ) {
            await sql`DELETE FROM ${sql(table)} WHERE workspace_id = ${workspaceId}`;
          }
          await sql`DELETE FROM core.workspaces WHERE id = ${workspaceId}`;
        });
      } catch {
        failures.push("Planning database fixtures");
      }
    }
    if (userId) {
      try {
        const deleted = await admin.auth.admin.deleteUser(userId);
        if (deleted.error) failures.push("Planning Auth fixture");
      } catch {
        failures.push("Planning Auth fixture");
      }
    }
    await client.auth.stopAutoRefresh();
    await admin.auth.stopAutoRefresh();
    const ended = await Promise.allSettled([
      database.end({ timeout: 5 }),
      service.end({ timeout: 5 }),
      concurrent.end({ timeout: 5 }),
    ]);
    if (ended.some((result) => result.status === "rejected")) failures.push("Planning connections");
    assert(failures.length === 0, `Planning cleanup failed: ${failures.join(", ")}.`);
  }
});
