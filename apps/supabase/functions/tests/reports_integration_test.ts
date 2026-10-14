import { createClient } from "@supabase/supabase-js";
import type { VerifiedIdentity } from "../_shared/auth.ts";
import { createDatabase } from "../_shared/database.ts";
import { createAccount, createBook } from "../_shared/finance.ts";
import { workspaceLocalDate } from "../_shared/finance_contracts.ts";
import { ApiError } from "../_shared/http.ts";
import { runLedgerTool } from "../_shared/ledger.ts";
import { onboard, validateOnboardingInput } from "../_shared/onboarding.ts";
import { runDomainTool } from "../_shared/planning.ts";
import { type FinanceReportInput } from "../_shared/report_contracts.ts";
import { EMPTY_DETAIL_DIGEST, getFinanceReport, monthEnd } from "../_shared/reports.ts";

function assert(
  value: unknown,
  message = "The report integration assertion failed.",
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
      `Expected ${code}, received ${
        error instanceof ApiError ? error.code : "uncontrolled error"
      }.`,
    );
    return;
  }
  throw new Error(`Expected ${code}.`);
}

Deno.test("Local Finance reports read one exact authorized evidence snapshot", async (test) => {
  const api = new URL(required("SUPABASE_URL")),
    adminUrl = new URL(required("SUPABASE_DB_URL")),
    serviceUrl = new URL(required("IMPULSO_TEST_DATABASE_URL"));
  assert(
    api.protocol === "http:" && ["localhost", "127.0.0.1"].includes(api.hostname) &&
      api.port === "54321" &&
      [adminUrl, serviceUrl].every((url) =>
        ["localhost", "127.0.0.1"].includes(url.hostname) && url.port === "54322"
      ) &&
      decodeURIComponent(serviceUrl.username) === "impulso_backend",
    "Report fixtures require local Impulso.",
  );
  const options = {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  };
  const admin = createClient(api.origin, required("SUPABASE_SERVICE_ROLE_KEY"), options),
    client = createClient(api.origin, required("SUPABASE_ANON_KEY"), options);
  const database = createDatabase(adminUrl.href),
    service = createDatabase(serviceUrl.href),
    blocker = createDatabase(adminUrl.href);
  let userId: string | null = null, workspaceId: string | null = null;
  async function step(name: string, operation: () => Promise<void>) {
    assert(await test.step(name, operation), "Dependent report checks stopped after a failure.");
  }
  try {
    const email = `reports-${crypto.randomUUID()}@impulso.test.invalid`,
      password = `${crypto.randomUUID()}aA1!`;
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    assert(!created.error && created.data.user);
    userId = created.data.user.id;
    const login = await client.auth.signInWithPassword({ email, password });
    assert(!login.error && login.data.session);
    const encoded = login.data.session.access_token.split(".")[1].replaceAll("-", "+").replaceAll(
      "_",
      "/",
    );
    const identity: VerifiedIdentity = {
      user_id: userId,
      session_id:
        JSON.parse(atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, "="))).session_id,
      email,
    };
    const onboarding = await onboard(
      service,
      identity,
      validateOnboardingInput({
        request_id: crypto.randomUUID(),
        workspace_name: "Reports fixture",
        display_name: "Reports fixture",
        timezone: "America/Mexico_City",
      }),
    );
    workspaceId = onboarding.workspace_id;
    const book = await createBook(service, identity, {
      request_id: crypto.randomUUID(),
      workspace_id: workspaceId,
      currency: "MXN",
      name: "Reports book",
    });
    const scope = { workspace_id: workspaceId, book_id: book.book_id },
      today = workspaceLocalDate("America/Mexico_City"),
      period = `${today.slice(0, 7)}-01`;
    const nextIndex = Number(today.slice(0, 4)) * 12 + Number(today.slice(5, 7));
    const nextPeriod = `${Math.floor(nextIndex / 12)}-${
      String(nextIndex % 12 + 1).padStart(2, "0")
    }-01`;
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
      investment = await account("CETES", "0.00", "investment"),
      loan = await account("Loan", "0.00", "loan"),
      card = await account("Card", "0.00", "credit_card");
    const report = (kind: FinanceReportInput["report"], extra: Partial<FinanceReportInput> = {}) =>
      getFinanceReport(service, identity, {
        ...scope,
        report: kind,
        starts_on: period,
        ends_on: monthEnd(period),
        as_of: today,
        ...extra,
      });
    const transaction = (entry: Record<string, unknown>) =>
      runLedgerTool(service, identity, "record_transaction", {
        ...scope,
        request_id: crypto.randomUUID(),
        action: "single",
        entry: {
          amount: "0.01",
          currency: "MXN",
          occurred_on: today,
          description: "Synthetic report evidence",
          beneficiary_person_id: null,
          category_id: null,
          ...entry,
        },
      });
    const expense = (amount: string, categoryId: string | null = null) =>
      transaction({ kind: "expense", amount, source_account_id: bank, category_id: categoryId });
    await step(
      "Income, loan proceeds, investment transfers and card payment have distinct exact effects",
      async () => {
        await transaction({ kind: "income", amount: "500.00", destination_account_id: bank });
        await transaction({
          kind: "transfer",
          amount: "100.00",
          source_account_id: loan,
          destination_account_id: bank,
        });
        await transaction({
          kind: "transfer",
          amount: "200.00",
          source_account_id: bank,
          destination_account_id: investment,
        });
        await transaction({ kind: "expense", amount: "50.00", source_account_id: card });
        await transaction({
          kind: "transfer",
          amount: "50.00",
          source_account_id: bank,
          destination_account_id: card,
        });
        const flow = await report("cash_flow"), balances = await report("balances");
        assert(
          flow.income === "500.00" && flow.expense === "50.00" && flow.transferred === "350.00" &&
            flow.income_less_expense === "450.00",
        );
        assert(
          balances.accounts.find((row) => row.account_id === bank)?.ledger_balance === "1350.00",
        );
        assert(
          balances.accounts.find((row) => row.account_id === loan)?.ledger_balance === "-100.00",
        );
      },
    );
    await step(
      "Net worth replaces investment cost once, keeps liability credit and excludes goals",
      async () => {
        await runDomainTool(service, identity, "manage_asset", {
          ...write(),
          action: "append_valuation",
          asset_id: null,
          account_id: investment,
          valued_on: today,
          amount: "250.00",
          source: "Accepted synthetic statement",
        });
        const asset = await runDomainTool(service, identity, "manage_asset", {
          ...write(),
          action: "create",
          name: "Owned item",
          identity_text: "Distinct owned manual item",
          ownership_text: "Owned",
          person_id: null,
          distinct_from_account_holdings: true,
        }) as { resource_id: string };
        await runDomainTool(service, identity, "manage_asset", {
          ...write(),
          action: "append_valuation",
          asset_id: asset.resource_id,
          account_id: null,
          valued_on: today,
          amount: "200.00",
          source: "Accepted manual value",
        });
        await runDomainTool(service, identity, "manage_asset", {
          ...write(),
          action: "append_valuation",
          asset_id: asset.resource_id,
          account_id: null,
          valued_on: "2099-01-01",
          amount: "99999.00",
          source: "Future observation",
        });
        await transaction({
          kind: "transfer",
          amount: "25.00",
          source_account_id: bank,
          destination_account_id: card,
        });
        const worth = await report("net_worth");
        assert(worth.net_worth === "1700.00");
        assert(
          worth.accounts.find((row) => row.account_id === investment)?.ledger_balance ===
              "200.00" &&
            worth.accounts.find((row) => row.account_id === investment)?.reported_value ===
              "250.00",
        );
        assert(worth.accounts.find((row) => row.account_id === card)?.reported_value === "25.00");
      },
    );
    await step(
      "Partial settlements project only the exact unpaid remainder and unknown dates remain unknown",
      async () => {
        const createPlan = (name: string, due: string | null) =>
          runDomainTool(service, identity, "manage_plan", {
            ...write(),
            action: "create",
            name,
            period_start: nextPeriod,
            due_on: due,
            debt_account_id: null,
            quoted_total: null,
            components_resolved: true,
            lines: [{
              kind: "expense",
              amount: "100.00",
              category_id: null,
              source_account_id: bank,
              destination_account_id: null,
              beneficiary_person_id: null,
            }],
          });
        const plan = await createPlan("Future bill", `${nextPeriod.slice(0, 8)}15`) as {
          resource_id: string;
        };
        const [line] = await database<
          { id: string }[]
        >`SELECT id FROM finance.planned_item_lines WHERE planned_item_id = ${plan.resource_id} AND retired_at IS NULL`;
        await transaction({
          kind: "expense",
          amount: "40.00",
          source_account_id: bank,
          settlement_links: [{ planned_item_line_id: line.id, amount: "40.00" }],
        });
        let result = await report("plan_vs_actual", { ends_on: monthEnd(nextPeriod) });
        assert(
          result.plans.find((row) => row.planned_item_id === plan.resource_id)?.remaining ===
            "60.00",
        );
        assert(
          result.plans.find((row) => row.planned_item_id === plan.resource_id)?.payment_state ===
              "partially_paid" && result.projected_balance === "1350.00",
        );
        const unknown = await createPlan("Month-only expectation", null) as { resource_id: string };
        result = await report("upcoming", { ends_on: monthEnd(nextPeriod) });
        assert(
          result.projected_balance === null && result.plans.find((row) =>
                row.planned_item_id === unknown.resource_id
              )?.due_on === null &&
            !result.plans.find((row) => row.planned_item_id === unknown.resource_id)?.overdue,
        );
        await runDomainTool(service, identity, "manage_plan", {
          ...write(),
          action: "cancel",
          planned_item_id: unknown.resource_id,
          expected_version: 1,
        });
      },
    );
    let summaryCategory = "", summaryTransaction = "";
    await step(
      "Monthly summary coverage selects one reviewed authority and never creates account effects",
      async () => {
        const category = await runLedgerTool(service, identity, "manage_category", {
          ...scope,
          request_id: crypto.randomUUID(),
          action: "create",
          kind: "expense",
          name: "Reviewed historical category",
        });
        summaryCategory = (category.category as { category_id: string }).category_id;
        const batch = crypto.randomUUID(), row = crypto.randomUUID(), summary = crypto.randomUUID();
        await database`INSERT INTO finance.import_batches (id,workspace_id,book_id,currency,actor_user_id,workbook_id,source_version,captured_at,manifest,review_digest,status,committed_at)
        VALUES (${batch},${workspaceId},${book.book_id},'MXN',${userId},'synthetic-reports-workbook','fixture-v1',now(),'{}',decode(${EMPTY_DETAIL_DIGEST},'hex'),'committed',now())`;
        await database`INSERT INTO finance.import_rows (id,workspace_id,book_id,currency,batch_id,row_number,workbook_id,sheet_id,source_cell,period_start,source_key,source_digest,source_snapshot,role,amount,kind,category_id,accepted)
        VALUES (${row},${workspaceId},${book.book_id},'MXN',${batch},1,'synthetic-reports-workbook',1,'B2',${period}::date,'synthetic-row',decode(${EMPTY_DETAIL_DIGEST},'hex'),'{}','actual_summary',200,'expense',${summaryCategory},true)`;
        await database`INSERT INTO finance.monthly_summaries(id,workspace_id,book_id,currency,period_start,kind,amount,category_id,import_row_id)
        VALUES (${summary},${workspaceId},${book.book_id},'MXN',${period}::date,'expense',200,${summaryCategory},${row})`;
        await database`UPDATE finance.import_rows SET result_summary_id = ${summary}, consumed_at = now() WHERE id = ${row}`;
        await database`INSERT INTO finance.report_coverage(workspace_id,book_id,currency,period_start,kind,category_id,authority,reviewed_detail_count,reviewed_detail_digest)
        VALUES (${workspaceId},${book.book_id},'MXN',${period}::date,'expense',${summaryCategory},'summary',0,decode(${EMPTY_DETAIL_DIGEST},'hex'))`;
        const flow = await report("cash_flow"), balances = await report("balances");
        assert(
          flow.expense === "290.00" &&
            flow.monthly.some((month) =>
              month.category_id === summaryCategory && month.basis === "summary"
            ),
        );
        assert(
          balances.accounts.find((account) => account.account_id === bank)?.ledger_balance ===
            "1285.00",
        );
        const detail = await expense("10.00", summaryCategory);
        summaryTransaction = (detail.entry as { transaction_id: string }).transaction_id;
        const changed = await report("cash_flow");
        assert(
          !changed.complete && changed.issues.some((issue) =>
            issue.code === "summary_coverage_unresolved"
          ) && changed.expense === "90.00",
        );
      },
    );
    await step(
      "Same-count changed detail invalidates the reviewed digest and daily reports do not invent summary dates",
      async () => {
        const [digest] = await database<
          { value: string }[]
        >`SELECT encode(sha256(convert_to(string_agg(t.id::text||':'||t.version::text||':'||coalesce(c.version,0)::text,',' ORDER BY t.id),'UTF8')),'hex') AS value
        FROM finance.transactions t LEFT JOIN finance.transaction_classifications c ON c.workspace_id=t.workspace_id AND c.book_id=t.book_id AND c.transaction_id=t.id
        WHERE t.workspace_id=${workspaceId} AND t.book_id=${book.book_id} AND t.voided_at IS NULL AND c.category_id=${summaryCategory}`;
        await database`UPDATE finance.report_coverage SET reviewed_detail_count=1,reviewed_detail_digest=decode(${digest.value},'hex'),version=version+1 WHERE workspace_id=${workspaceId} AND category_id=${summaryCategory}`;
        assert((await report("cash_flow")).expense === "290.00");
        await database`UPDATE finance.transactions SET version=version+1 WHERE id=${summaryTransaction}`;
        assert(!(await report("cash_flow")).complete);
        const daily = await report("cash_flow", { starts_on: today, ends_on: today });
        assert(
          daily.monthly.find((month) => month.category_id === summaryCategory)?.basis ===
            "unresolved",
        );
        await database`UPDATE finance.report_coverage SET authority='detail',version=version+1 WHERE workspace_id=${workspaceId} AND category_id=${summaryCategory}`;
        assert((await report("cash_flow")).expense === "100.00");
      },
    );
    await step(
      "Later spending discloses goal shortfalls instead of rejecting real activity or adding assets",
      async () => {
        const goal = await runDomainTool(service, identity, "manage_goal", {
          ...write(),
          action: "create",
          name: "Reviewed savings goal",
          target_amount: "1000.00",
          target_on: null,
          person_id: null,
        }) as { resource_id: string };
        await runDomainTool(service, identity, "manage_goal", {
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
        });
        await expense("1000.00");
        const result = await report("goals");
        assert(
          result.goals[0].earmarked === "600.00" && result.goals[0].backed === "275.00" &&
            result.goals[0].shortfall === "325.00",
        );
        assert(result.issues.some((issue) => issue.code === "goal_underfunded"));
      },
    );
    await step(
      "Unknown and pre-baseline coverage and stale valuations remain explicit",
      async () => {
        const unknown = await createAccount(service, identity, {
          ...write(),
          name: "Unreviewed account",
          opening_balance: "100.00",
          person_id: null,
        });
        const historical = await report("balances", { as_of: "2025-12-31" });
        assert(
          !historical.complete &&
            historical.accounts.every((account) => account.ledger_balance === null),
        );
        const current = await report("net_worth", {
          as_of: "2027-01-01",
          valuation_max_age_days: 1,
        });
        assert(
          current.accounts.find((account) => account.account_id === unknown.account_id)
                ?.ledger_balance === null &&
            current.issues.some((issue) => issue.code === "valuation_stale"),
        );
      },
    );
    let edgeBookId = "", edgeBank = "", splitPlanId = "";
    const edgeScope = () => ({ workspace_id: workspaceId, book_id: edgeBookId });
    const edgeWrite = () => ({ ...edgeScope(), request_id: crypto.randomUUID(), currency: "MXN" });
    const edgeReport = (
      kind: FinanceReportInput["report"],
      extra: Partial<FinanceReportInput> = {},
    ) =>
      getFinanceReport(service, identity, {
        ...edgeScope(),
        report: kind,
        starts_on: "2026-01-01",
        ends_on: "2026-02-28",
        as_of: "2026-02-28",
        ...extra,
      });
    await step(
      "Budget use respects its own exact interval instead of whole-month approximations",
      async () => {
        const edge = await createBook(service, identity, {
          request_id: crypto.randomUUID(),
          workspace_id: workspaceId!,
          currency: "MXN",
          name: "Report boundary fixtures",
        });
        edgeBookId = edge.book_id;
        const bank = await createAccount(service, identity, {
          ...edgeWrite(),
          workspace_id: workspaceId!,
          name: "Boundary bank",
          opening_balance: "1000.00",
          person_id: null,
        });
        edgeBank = bank.account_id;
        await runLedgerTool(service, identity, "configure_account", {
          ...edgeScope(),
          request_id: crypto.randomUUID(),
          account_id: edgeBank,
          expected_version: 1,
          account_kind: "bank",
          opening_balance_on: "2026-01-01",
        });
        for (
          const [occurred_on, amount] of [["2026-01-05", "10.00"], ["2026-01-20", "20.00"], [
            "2026-02-10",
            "30.00",
          ], ["2026-02-20", "40.00"]]
        ) {
          await runLedgerTool(service, identity, "record_transaction", {
            ...edgeScope(),
            request_id: crypto.randomUUID(),
            action: "single",
            entry: {
              kind: "expense",
              amount,
              currency: "MXN",
              occurred_on,
              source_account_id: edgeBank,
              beneficiary_person_id: null,
              category_id: null,
              description: "Boundary expense",
            },
          });
        }
        const budget = await runDomainTool(service, identity, "manage_budget", {
          ...edgeWrite(),
          action: "create",
          name: "Mid-month interval",
          person_id: null,
          category_id: null,
          starts_on: "2026-01-15",
          ends_on: "2026-02-15",
          amount: "100.00",
        }) as { resource_id: string };
        const result = await edgeReport("plan_vs_actual"),
          limit = result.budgets.find((item) => item.budget_id === budget.resource_id);
        assert(
          limit?.used === "50.00" && limit.remaining === "50.00",
          "Only January 20 and February 10 belong to this accepted budget interval.",
        );
      },
    );
    await step(
      "Component overpayment remains partial until every distinct expected component is settled",
      async () => {
        const plan = await runDomainTool(service, identity, "manage_plan", {
          ...edgeWrite(),
          action: "create",
          name: "Split boundary bill",
          period_start: "2026-02-01",
          due_on: "2026-02-28",
          debt_account_id: null,
          quoted_total: "200.00",
          components_resolved: true,
          lines: [1, 2].map(() => ({
            kind: "expense",
            amount: "100.00",
            category_id: null,
            source_account_id: edgeBank,
            destination_account_id: null,
            beneficiary_person_id: null,
          })),
        }) as { resource_id: string };
        splitPlanId = plan.resource_id;
        const [line] = await database<
          { id: string }[]
        >`SELECT id FROM finance.planned_item_lines WHERE planned_item_id=${splitPlanId} AND retired_at IS NULL ORDER BY line_number LIMIT 1`;
        await runLedgerTool(service, identity, "record_transaction", {
          ...edgeScope(),
          request_id: crypto.randomUUID(),
          action: "single",
          entry: {
            kind: "expense",
            amount: "250.00",
            currency: "MXN",
            occurred_on: "2026-02-15",
            source_account_id: edgeBank,
            beneficiary_person_id: null,
            category_id: null,
            description: "One component excess",
            settlement_links: [{ planned_item_line_id: line.id, amount: "250.00" }],
          },
        });
        const result = await edgeReport("plan_vs_actual"),
          read = result.plans.find((item) => item.planned_item_id === splitPlanId);
        assert(
          read?.remaining === "100.00" && read.excess_amount === "150.00" &&
            read.payment_state === "partially_paid",
        );
      },
    );
    await step(
      "A due date outside the requested horizon contributes no extra projected outflow",
      async () => {
        await runDomainTool(service, identity, "manage_plan", {
          ...edgeWrite(),
          action: "cancel",
          planned_item_id: splitPlanId,
          expected_version: 2,
        });
        await runDomainTool(service, identity, "manage_plan", {
          ...edgeWrite(),
          action: "create",
          name: "Later accepted bill",
          period_start: "2026-02-01",
          due_on: "2026-04-01",
          debt_account_id: null,
          quoted_total: null,
          components_resolved: true,
          lines: [{
            kind: "expense",
            amount: "100.00",
            category_id: null,
            source_account_id: edgeBank,
            destination_account_id: null,
            beneficiary_person_id: null,
          }],
        });
        assert((await edgeReport("upcoming")).projected_balance === "650.00");
      },
    );
    await step(
      "A fresh investment valuation cannot hide missing or future opening coverage for a goal",
      async () => {
        const holding = await createAccount(service, identity, {
          ...edgeWrite(),
          workspace_id: workspaceId!,
          name: "Unsupported opening",
          opening_balance: "0.00",
          person_id: null,
        });
        await runLedgerTool(service, identity, "configure_account", {
          ...edgeScope(),
          request_id: crypto.randomUUID(),
          account_id: holding.account_id,
          expected_version: 1,
          account_kind: "investment",
          opening_balance_on: null,
        });
        const valuation = await runDomainTool(service, identity, "manage_asset", {
          ...edgeWrite(),
          action: "append_valuation",
          asset_id: null,
          account_id: holding.account_id,
          valued_on: "2026-01-01",
          amount: "500.00",
          source: "Synthetic historical valuation",
        }) as { resource_id: string };
        const goal = await runDomainTool(service, identity, "manage_goal", {
          ...edgeWrite(),
          action: "create",
          name: "Unsupported valuation backing",
          target_amount: "500.00",
          target_on: null,
          person_id: null,
        }) as { resource_id: string };
        // Administrative fixture emulates legacy inconsistent evidence; the public earmark service refuses it.
        await database`INSERT INTO finance.goal_allocations(workspace_id,book_id,currency,goal_id,account_id,amount,funding_basis,valuation_id)
        VALUES(${workspaceId},${edgeBookId},'MXN',${goal.resource_id},${holding.account_id},500,'valuation',${valuation.resource_id})`;
        let result = await edgeReport("goals", { as_of: "2026-01-02" });
        assert(
          result.goals.find((item) => item.goal_id === goal.resource_id)?.backed === "0.00" &&
            result.issues.some((issue) => issue.code === "goal_backing_unavailable"),
        );
        await database`UPDATE finance.accounts SET opening_balance_on='2027-01-01' WHERE id=${holding.account_id}`;
        result = await edgeReport("goals", { as_of: "2026-01-02" });
        assert(result.goals.find((item) => item.goal_id === goal.resource_id)?.backed === "0.00");
      },
    );
    await step(
      "Inactive attributed people block plan, goal and budget read disclosures",
      async () => {
        await runDomainTool(service, identity, "manage_plan", {
          ...edgeWrite(),
          action: "create",
          name: "Attributed plan",
          period_start: "2026-01-01",
          due_on: null,
          debt_account_id: null,
          quoted_total: null,
          components_resolved: true,
          lines: [{
            kind: "expense",
            amount: "10.00",
            category_id: null,
            source_account_id: edgeBank,
            destination_account_id: null,
            beneficiary_person_id: onboarding.person_id,
          }],
        });
        await runDomainTool(service, identity, "manage_goal", {
          ...edgeWrite(),
          action: "create",
          name: "Attributed goal",
          target_amount: "10.00",
          target_on: null,
          person_id: onboarding.person_id,
        });
        await runDomainTool(service, identity, "manage_budget", {
          ...edgeWrite(),
          action: "create",
          name: "Attributed budget",
          amount: "10.00",
          starts_on: "2026-01-01",
          ends_on: "2026-01-31",
          category_id: null,
          person_id: onboarding.person_id,
        });
        await database`UPDATE core.people SET archived_at=now(),archived_by_user_id=${userId} WHERE id=${onboarding.person_id}`;
        try {
          for (const kind of ["upcoming", "goals", "plan_vs_actual"] as const) {
            await denied(() => edgeReport(kind), "person_archived");
          }
        } finally {
          await database`UPDATE core.people SET archived_at=NULL,archived_by_user_id=NULL WHERE id=${onboarding.person_id}`;
        }
      },
    );
    await step(
      "A viewer can read but revocation while waiting prevents a protected report",
      async () => {
        await database`UPDATE finance.book_access SET role='viewer' WHERE workspace_id=${workspaceId} AND book_id=${book.book_id} AND user_id=${userId}`;
        await report("balances");
        let release!: () => void, locked!: () => void;
        const gate = new Promise<void>((resolve) => {
            release = resolve;
          }),
          ready = new Promise<void>((resolve) => {
            locked = resolve;
          });
        const blocking = blocker.begin(async (sql) => {
          await sql`SELECT id FROM core.workspaces WHERE id=${workspaceId} FOR UPDATE`;
          locked();
          await gate;
        });
        await ready;
        const pending = report("balances");
        await database`UPDATE finance.book_access SET revoked_at=now(),revoked_by_user_id=${userId} WHERE workspace_id=${workspaceId} AND book_id=${book.book_id} AND user_id=${userId}`;
        release();
        await blocking;
        await denied(() => pending, "book_access_denied");
      },
    );
  } finally {
    const failures = [];
    if (workspaceId) {
      try {
        await database.begin(async (sql) => {
          await sql`UPDATE finance.import_rows SET consumed_at=NULL,result_summary_id=NULL WHERE workspace_id=${workspaceId}`;
          for (
            const table of [
              "private.operation_receipts",
              "audit.events",
              "finance.report_coverage",
              "finance.monthly_summaries",
              "finance.import_rows",
              "finance.import_batches",
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
          ) await sql`DELETE FROM ${sql(table)} WHERE workspace_id=${workspaceId}`;
          await sql`DELETE FROM core.workspaces WHERE id=${workspaceId}`;
        });
      } catch {
        failures.push("Report database fixtures");
      }
    }
    if (userId) {
      try {
        const deleted = await admin.auth.admin.deleteUser(userId);
        if (deleted.error) failures.push("Report Auth fixture");
      } catch {
        failures.push("Report Auth fixture");
      }
    }
    await client.auth.stopAutoRefresh();
    await admin.auth.stopAutoRefresh();
    const ended = await Promise.allSettled([
      database.end({ timeout: 5 }),
      service.end({ timeout: 5 }),
      blocker.end({ timeout: 5 }),
    ]);
    if (ended.some((result) => result.status === "rejected")) failures.push("Report connections");
    assert(failures.length === 0, `Report cleanup failed: ${failures.join(", ")}.`);
  }
});
