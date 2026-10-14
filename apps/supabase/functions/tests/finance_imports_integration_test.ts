import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import type { VerifiedIdentity } from "../_shared/auth.ts";
import { createDatabase, type Transaction } from "../_shared/database.ts";
import { createAccount, createBook } from "../_shared/finance.ts";
import { configureAccount } from "../_shared/ledger.ts";
import { importCoverageState, runImportTool } from "../_shared/finance_imports.ts";
import { withFinanceRead } from "../_shared/finance_common.ts";
import {
  IMPORT_TOOL_SCHEMAS,
  type ImportManifest,
  type ImportSourceRow,
  type ImportToolName,
} from "../_shared/import_contracts.ts";
import { ApiError } from "../_shared/http.ts";
import { onboard } from "../_shared/onboarding.ts";
import { syntheticWorkbookManifest } from "./fixtures/personal_planning_workbook.ts";

function setting(name: string): string {
  const value = Deno.env.get(name);
  assert(value, `Missing local import setting ${name}.`);
  return value;
}
async function denied(operation: () => Promise<unknown>, code: string) {
  await assert.rejects(
    operation,
    (error: unknown) => error instanceof ApiError && error.code === code,
  );
}

Deno.test("Local import previews and commits preserve source precision, scope and replacement history", async (test) => {
  const api = new URL(setting("SUPABASE_URL")),
    adminUrl = new URL(setting("SUPABASE_DB_URL")),
    backendUrl = new URL(setting("IMPULSO_TEST_DATABASE_URL"));
  assert(
    api.protocol === "http:" && ["127.0.0.1", "localhost"].includes(api.hostname) &&
      api.port === "54321",
  );
  for (const url of [adminUrl, backendUrl]) {
    assert(["127.0.0.1", "localhost"].includes(url.hostname) && url.port === "54322");
  }
  assert(decodeURIComponent(backendUrl.username) === "impulso_backend");
  const options = {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  };
  const admin = createClient(api.origin, setting("SUPABASE_SERVICE_ROLE_KEY"), options),
    client = createClient(api.origin, setting("SUPABASE_ANON_KEY"), options);
  const database = createDatabase(adminUrl.toString()),
    service = createDatabase(backendUrl.toString()),
    concurrent = createDatabase(backendUrl.toString());
  const fresh = () => crypto.randomUUID(), users: string[] = [], workspaces: string[] = [];
  let identity: VerifiedIdentity,
    scope: { workspace_id: string; book_id: string },
    bank: string,
    investment: string;
  let activeSourceRow: string, activeSummaryId: string, activePlanId: string;
  let sourceVersion = 1;
  const workbook = `synthetic-import-${fresh()}`;
  async function step(name: string, operation: () => Promise<void>) {
    assert(await test.step(name, operation), "An import step failed; dependent checks stopped.");
  }
  async function call(name: ImportToolName, input: Record<string, unknown>, connection = service) {
    const result = await runImportTool(connection, identity, name, { ...scope, ...input });
    const checked = IMPORT_TOOL_SCHEMAS[name].output.safeParse(result);
    assert(
      checked.success,
      `${name} result must match its closed contract: ${
        checked.success ? "" : checked.error.message
      }`,
    );
    return checked.data;
  }
  async function coverage() {
    return await withFinanceRead(
      service,
      identity,
      scope.workspace_id,
      scope.book_id,
      async (ctx) => await importCoverageState(ctx, "2026-01-01", "expense", null),
    );
  }
  const summaryRow = (): ImportSourceRow => ({
    sheet_id: 2026,
    source_cell: "C17",
    period_start: "2026-01-01",
    date_precision: "month",
    observed_on: null,
    original_text: "Comida synthetic month total",
    displayed_value: "100.00",
    raw_value: "100.00",
    formula: null,
    selected: true,
    parser: "plain",
    currency: "MXN",
    mapping: { role: "unknown", accepted: false },
    expected_targets: [],
    replacement: null,
  });
  function manifest(rows: ImportSourceRow[]): ImportManifest {
    const base = syntheticWorkbookManifest();
    return {
      ...base,
      workbook_id: workbook,
      source_version: `synthetic-v${sourceVersion}`,
      sheets: base.sheets.map((sheet) =>
        sheet.sheet_id === 2026 ? { ...sheet, selection: "authoritative" } : sheet
      ),
      rows,
      reconciliation: {
        annual_net: null,
        monthly_net: null,
        missing_annual_cells: [],
        resolution: "unresolved",
        excluded_cells: [],
        accepted: false,
      },
    };
  }
  async function preview(rows: ImportSourceRow[]) {
    return await call("preview_finance_import", { request_id: fresh(), manifest: manifest(rows) });
  }
  async function commit(
    batch: { batch_id: string; version: number; review_digest: string },
    connection = service,
  ) {
    return await call("commit_finance_import", {
      request_id: fresh(),
      batch_id: batch.batch_id,
      expected_version: batch.version,
      review_digest: batch.review_digest,
      accepted: true,
    }, connection);
  }
  try {
    await step("Disposable local account baselines are explicit before importing", async () => {
      const email = `import-${fresh()}@impulso.test.invalid`, password = `${fresh()}aA1!`;
      const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      assert(!created.error && created.data.user);
      users.push(created.data.user.id);
      const login = await client.auth.signInWithPassword({ email, password });
      assert(!login.error && login.data.session);
      const payload = login.data.session.access_token.split(".")[1].replaceAll("-", "+").replaceAll(
        "_",
        "/",
      );
      identity = {
        user_id: created.data.user.id,
        session_id:
          JSON.parse(atob(payload.padEnd(Math.ceil(payload.length / 4) * 4, "="))).session_id,
        email,
      };
      const setup = await onboard(service, identity, {
        request_id: fresh(),
        workspace_name: "Import fixture",
        display_name: "Import fixture",
        timezone: "America/Mexico_City",
      });
      workspaces.push(setup.workspace_id);
      const book = await createBook(service, identity, {
        request_id: fresh(),
        workspace_id: setup.workspace_id,
        name: "Import fixture",
        currency: "MXN",
      });
      scope = { workspace_id: setup.workspace_id, book_id: book.book_id };
      for (
        const [name, opening, kind] of [["Bank", "0", "bank"], ["Investment", "1000", "investment"]]
      ) {
        const account = await createAccount(service, identity, {
          ...scope,
          request_id: fresh(),
          name,
          currency: "MXN",
          opening_balance: opening,
          person_id: null,
        });
        await configureAccount(service, identity, {
          ...scope,
          request_id: fresh(),
          account_id: account.account_id,
          expected_version: 1,
          account_kind: kind,
          opening_balance_on: "2026-01-01",
        });
        if (kind === "bank") bank = account.account_id;
        else investment = account.account_id;
      }
    });
    await step("A conflicting workbook remains a protected draft with no live import", async () => {
      const result = await call("preview_finance_import", {
        request_id: fresh(),
        manifest: syntheticWorkbookManifest(),
      });
      assert.equal(result.status, "draft");
      assert.equal(result.reconciliation.difference, "106827.04");
      assert.equal(result.reconciliation.verified_savings, false);
      assert.equal(result.reconciliation.missing_annual_cells.length, 7);
      await denied(() => commit(result), "import_blocked");
      const [count] =
        await database`SELECT count(*)::int AS value FROM finance.transactions WHERE workspace_id = ${scope.workspace_id}`;
      assert.equal(count.value, 0);
    });
    await step(
      "Unknown currency, monthly detail, hidden backups and partial coverage block posting",
      async () => {
        const value = summaryRow();
        const unknown = await preview([{ ...value, currency: null }]);
        assert(unknown.rows[0].blockers.includes("currency_unknown"));
        const detail = await preview([{
          ...value,
          mapping: {
            role: "actual_detail",
            accepted: true,
            entry: {
              kind: "expense",
              source_account_id: bank,
              amount: "100",
              currency: "MXN",
              occurred_on: "2026-01-01",
              description: value.original_text,
              beneficiary_person_id: null,
              category_id: null,
            },
            coverage: null,
          },
          expected_targets: [{ type: "account", id: bank, expected_version: 2 }],
        }]);
        assert(detail.rows[0].blockers.includes("actual_detail_requires_observed_date"));
        const backup = manifest([{ ...value, sheet_id: 999 }]);
        backup.sheets = backup.sheets.map((sheet) =>
          sheet.sheet_id === 999 ? { ...sheet, selection: "authoritative" } : sheet
        );
        const blockedBackup = await call("preview_finance_import", {
          request_id: fresh(),
          manifest: backup,
        });
        assert(blockedBackup.rows[0].blockers.includes("backup_selection_requires_review"));
        const state = await coverage();
        const partial = await preview([{
          ...value,
          mapping: {
            role: "actual_summary",
            accepted: true,
            kind: "expense",
            category_id: null,
            coverage_scope: "partial",
            coverage: {
              authority: "summary",
              expected_version: state.version,
              reviewed_detail_count: state.detail_count,
              reviewed_detail_digest: state.detail_digest,
              accepted: true,
            },
          },
        }]);
        assert(partial.rows[0].blockers.includes("summary_coverage_incomplete"));
      },
    );
    await step(
      "A reviewed month-only summary commits without a fictional transaction",
      async () => {
        const state = await coverage();
        const row: ImportSourceRow = {
          ...summaryRow(),
          mapping: {
            role: "actual_summary",
            accepted: true,
            kind: "expense",
            category_id: null,
            coverage_scope: "complete",
            coverage: {
              authority: "summary",
              expected_version: state.version,
              reviewed_detail_count: state.detail_count,
              reviewed_detail_digest: state.detail_digest,
              accepted: true,
            },
          },
        };
        const batch = await preview([row]);
        assert.equal(batch.status, "ready");
        const result = await commit(batch);
        activeSourceRow = result.rows[0].row_id;
        activeSummaryId = result.rows[0].result.summary_id!;
        assert.equal(result.coverage.committed_rows, 1);
        assert.equal(result.coverage.whole_workbook_complete, false);
        const [counts] =
          await database`SELECT (SELECT count(*) FROM finance.transactions WHERE workspace_id = ${scope.workspace_id})::int AS actual,
        (SELECT count(*) FROM finance.monthly_summaries WHERE workspace_id = ${scope.workspace_id} AND retired_at IS NULL)::int AS summaries`;
        assert.equal(counts.actual, 0);
        assert.equal(counts.summaries, 1);
        const duplicate = await preview([row]);
        assert.equal(duplicate.status, "ready");
        const recovered = await commit(duplicate);
        assert.equal(recovered.rows[0].result.summary_id, activeSummaryId);
        const [sourceCount] =
          await database`SELECT count(*)::int AS value FROM finance.import_rows WHERE workspace_id = ${scope.workspace_id} AND consumed_at IS NOT NULL AND retired_at IS NULL`;
        assert.equal(sourceCount.value, 1);
      },
    );
    await step(
      "Source changes require an explicit versioned replacement and keep prior summaries",
      async () => {
        sourceVersion++;
        const state = await coverage();
        const row: ImportSourceRow = {
          ...summaryRow(),
          raw_value: "120.00",
          displayed_value: "120.00",
          mapping: {
            role: "actual_summary",
            accepted: true,
            kind: "expense",
            category_id: null,
            coverage_scope: "complete",
            coverage: {
              authority: "summary",
              expected_version: state.version,
              reviewed_detail_count: state.detail_count,
              reviewed_detail_digest: state.detail_digest,
              accepted: true,
            },
          },
        };
        const blocked = await preview([row]);
        assert(blocked.rows[0].blockers.includes("source_replacement_required"));
        row.replacement = {
          row_id: activeSourceRow,
          expected_version: 2,
          expected_result_version: 1,
          reason: "Accepted source correction",
          reconcile_allocations: [],
          prior_coverage: null,
        };
        const batch = await preview([row]);
        assert.equal(batch.status, "ready");
        const result = await commit(batch);
        const [old] =
          await database`SELECT retired_at, amount::text FROM finance.monthly_summaries WHERE id = ${activeSummaryId}`;
        assert(old.retired_at);
        assert.equal(old.amount, "100.0000");
        activeSourceRow = result.rows[0].row_id;
        activeSummaryId = result.rows[0].result.summary_id!;
      },
    );
    await step(
      "Role replacement atomically retires summaries and preserves unresolved payment plans",
      async () => {
        sourceVersion++;
        const state = await coverage();
        const row: ImportSourceRow = {
          ...summaryRow(),
          raw_value: "120",
          displayed_value: "120",
          mapping: {
            role: "planned",
            accepted: true,
            name: "Accepted unknown installment",
            period_start: "2026-01-01",
            due_on: null,
            debt_account_id: null,
            quoted_total: "120",
            components_resolved: false,
            lines: [],
          },
          replacement: {
            row_id: activeSourceRow,
            expected_version: 2,
            expected_result_version: 1,
            reason: "This was planned rather than actual",
            reconcile_allocations: [],
            prior_coverage: {
              authority: "detail",
              expected_version: state.version,
              reviewed_detail_count: state.detail_count,
              reviewed_detail_digest: state.detail_digest,
              accepted: true,
            },
          },
        };
        const batch = await preview([row]);
        assert.equal(batch.status, "ready");
        const result = await commit(batch);
        activeSourceRow = result.rows[0].row_id;
        activePlanId = result.rows[0].result.planned_item_id!;
        const [plan] =
          await database`SELECT components_resolved, quoted_total::text, due_on FROM finance.planned_items WHERE id = ${activePlanId}`;
        assert.equal(plan.components_resolved, false);
        assert.equal(plan.quoted_total, "120.0000");
        assert.equal(plan.due_on, null);
        const [count] =
          await database`SELECT count(*)::int AS value FROM finance.transactions WHERE workspace_id = ${scope.workspace_id}`;
        assert.equal(count.value, 0);
      },
    );
    await step(
      "Reviewed day-precision replacement posts once and cancels the prior expectation",
      async () => {
        sourceVersion++;
        const state = await coverage();
        const row: ImportSourceRow = {
          ...summaryRow(),
          raw_value: "120",
          displayed_value: "120",
          date_precision: "day",
          observed_on: "2026-01-15",
          mapping: {
            role: "actual_detail",
            accepted: true,
            entry: {
              kind: "expense",
              source_account_id: bank,
              amount: "120",
              currency: "MXN",
              occurred_on: "2026-01-15",
              description: "Comida source detail",
              beneficiary_person_id: null,
              category_id: null,
            },
            coverage: {
              authority: "detail",
              expected_version: state.version,
              reviewed_detail_count: state.detail_count,
              reviewed_detail_digest: state.detail_digest,
              accepted: true,
            },
          },
          expected_targets: [{ type: "account", id: bank, expected_version: 2 }],
          replacement: {
            row_id: activeSourceRow,
            expected_version: 2,
            expected_result_version: 1,
            reason: "Reviewed posted evidence",
            reconcile_allocations: [],
            prior_coverage: null,
          },
        };
        const batch = await preview([row]);
        assert.equal(batch.status, "ready");
        const result = await commit(batch);
        activeSourceRow = result.rows[0].row_id;
        assert(result.rows[0].result.transaction_id);
        const [plan] =
          await database`SELECT canceled_at FROM finance.planned_items WHERE id = ${activePlanId}`;
        assert(plan.canceled_at);
        const [count] =
          await database`SELECT count(*)::int AS value FROM finance.transactions WHERE workspace_id = ${scope.workspace_id}`;
        assert.equal(count.value, 1);
      },
    );
    await step(
      "Replacing posted source detail preserves the old movement and retires stale draft claims",
      async () => {
        sourceVersion++;
        const state = await coverage();
        const [old] =
          await database`SELECT result_transaction_id FROM finance.import_rows WHERE id = ${activeSourceRow}`;
        const row: ImportSourceRow = {
          ...summaryRow(),
          raw_value: "110",
          displayed_value: "110",
          date_precision: "day",
          observed_on: "2026-01-15",
          mapping: {
            role: "actual_detail",
            accepted: true,
            entry: {
              kind: "expense",
              source_account_id: bank,
              amount: "110",
              currency: "MXN",
              occurred_on: "2026-01-15",
              description: "Accepted corrected source detail",
              beneficiary_person_id: null,
              category_id: null,
            },
            coverage: {
              authority: "detail",
              expected_version: state.version,
              reviewed_detail_count: state.detail_count,
              reviewed_detail_digest: state.detail_digest,
              accepted: true,
            },
          },
          expected_targets: [{ type: "account", id: bank, expected_version: 2 }],
          replacement: {
            row_id: activeSourceRow,
            expected_version: 2,
            expected_result_version: 1,
            reason: "Reviewed changed source amount",
            reconcile_allocations: [],
            prior_coverage: null,
          },
        };
        const first = await preview([row]), staleDraft = await preview([row]);
        assert.equal(first.status, "ready");
        assert.equal(staleDraft.status, "ready");
        const result = await commit(first);
        activeSourceRow = result.rows[0].row_id;
        await denied(() => commit(staleDraft), "stale_import_review");
        const [original] =
          await database`SELECT amount::text, voided_at FROM finance.transactions WHERE id = ${old.result_transaction_id}`;
        assert.equal(original.amount, "120.0000");
        assert(original.voided_at);
        const [replacement] =
          await database`SELECT amount::text, replaces_transaction_id FROM finance.transactions WHERE id = ${
            result.rows[0].result.transaction_id
          }`;
        assert.equal(replacement.amount, "110.0000");
        assert.equal(replacement.replaces_transaction_id, old.result_transaction_id);
      },
    );
    await step(
      "Coverage review detects revised classification even when its detail count is unchanged",
      async () => {
        const state = await coverage();
        const row: ImportSourceRow = {
          ...summaryRow(),
          source_cell: "L17",
          mapping: {
            role: "actual_summary",
            accepted: true,
            kind: "expense",
            category_id: null,
            coverage_scope: "complete",
            coverage: {
              authority: "summary",
              expected_version: state.version,
              reviewed_detail_count: state.detail_count,
              reviewed_detail_digest: state.detail_digest,
              accepted: true,
            },
          },
        };
        const batch = await preview([row]);
        assert.equal(batch.status, "ready");
        const [actual] =
          await database`SELECT result_transaction_id FROM finance.import_rows WHERE id = ${activeSourceRow}`;
        await database`UPDATE finance.transaction_classifications SET version = version + 1 WHERE transaction_id = ${actual.result_transaction_id}`;
        const changed = await coverage();
        assert.equal(changed.detail_count, state.detail_count);
        assert.notEqual(changed.detail_digest, state.detail_digest);
        await denied(() => commit(batch), "stale_import_review");
      },
    );
    await step("Dated valuations and existing openings never become earned income", async () => {
      const base = summaryRow();
      const rows: ImportSourceRow[] = [
        {
          ...base,
          source_cell: "D17",
          raw_value: "1100",
          displayed_value: "1100",
          date_precision: "day",
          observed_on: "2026-01-15",
          mapping: {
            role: "valuation",
            accepted: true,
            asset_id: null,
            account_id: investment,
            valued_on: "2026-01-15",
            source: "Accepted synthetic statement",
          },
          expected_targets: [{ type: "account", id: investment, expected_version: 2 }],
        },
        {
          ...base,
          source_cell: "E17",
          raw_value: "0",
          displayed_value: "0",
          mapping: {
            role: "opening_balance",
            accepted: true,
            account_id: bank,
            opening_balance_on: "2026-01-01",
          },
          expected_targets: [{ type: "account", id: bank, expected_version: 2 }],
        },
      ];
      const batch = await preview(rows);
      assert.equal(batch.status, "ready");
      const result = await commit(batch);
      assert(result.rows[0].result.valuation_id);
      assert.equal(result.rows[1].result.account_id, bank);
      const [income] =
        await database`SELECT count(*)::int AS value FROM finance.transactions WHERE workspace_id = ${scope.workspace_id} AND kind = 'income'`;
      assert.equal(income.value, 0);
    });
    await step(
      "Stale destination versions reject commits while earlier batches remain committed",
      async () => {
        const row: ImportSourceRow = {
          ...summaryRow(),
          source_cell: "F17",
          raw_value: "0",
          displayed_value: "0",
          mapping: {
            role: "opening_balance",
            accepted: true,
            account_id: bank,
            opening_balance_on: "2026-01-01",
          },
          expected_targets: [{ type: "account", id: bank, expected_version: 2 }],
        };
        const batch = await preview([row]);
        assert.equal(batch.status, "ready");
        await configureAccount(service, identity, {
          ...scope,
          request_id: fresh(),
          account_id: bank,
          expected_version: 2,
          account_kind: "bank",
          opening_balance_on: "2026-01-01",
        });
        await denied(() => commit(batch), "stale_import_review");
        const [counts] =
          await database`SELECT (SELECT count(*) FROM finance.import_rows WHERE batch_id = ${batch.batch_id} AND consumed_at IS NOT NULL)::int AS failed,
        (SELECT count(*) FROM finance.import_batches WHERE workspace_id = ${scope.workspace_id} AND status = 'committed')::int AS previous`;
        assert.equal(counts.failed, 0);
        assert(counts.previous >= 4);
      },
    );
    await step("A failure after every write rolls back the entire bounded batch", async () => {
      const row: ImportSourceRow = {
        ...summaryRow(),
        source_cell: "G17",
        mapping: {
          role: "planned",
          accepted: true,
          name: "Must roll back",
          period_start: "2026-01-01",
          due_on: null,
          debt_account_id: null,
          quoted_total: "100",
          components_resolved: false,
          lines: [],
        },
      };
      const batch = await preview([row]);
      assert.equal(batch.status, "ready");
      const failure = new Error("Synthetic import failure after writes");
      let reached = false;
      const failing = new Proxy(service, {
        get(target, property, receiver) {
          if (property !== "begin") return Reflect.get(target, property, receiver);
          return (operation: (sql: Transaction) => Promise<unknown>) =>
            target.begin(async (sql) => {
              await operation(sql);
              reached = true;
              throw failure;
            });
        },
      });
      await assert.rejects(() => commit(batch, failing), (error: unknown) => error === failure);
      assert(reached);
      const [state] =
        await database`SELECT status FROM finance.import_batches WHERE id = ${batch.batch_id}`;
      assert.equal(state.status, "ready");
      const [rows] =
        await database`SELECT count(*)::int AS value FROM finance.planned_items WHERE workspace_id = ${scope.workspace_id} AND name = 'Must roll back'`;
      assert.equal(rows.value, 0);
    });
    await step("Competing fresh batches cannot consume one source twice", async () => {
      const row: ImportSourceRow = {
        ...summaryRow(),
        source_cell: "H17",
        mapping: {
          role: "planned",
          accepted: true,
          name: "Concurrent expectation",
          period_start: "2026-01-01",
          due_on: null,
          debt_account_id: null,
          quoted_total: "100",
          components_resolved: false,
          lines: [],
        },
      };
      const first = await preview([row]), second = await preview([row]);
      assert.equal(first.status, "ready");
      assert.equal(second.status, "ready");
      const outcomes = await Promise.all([commit(first), commit(second, concurrent)]);
      assert.equal(
        outcomes[0].rows[0].result.planned_item_id,
        outcomes[1].rows[0].result.planned_item_id,
      );
      const [count] =
        await database`SELECT count(*)::int AS value FROM finance.import_rows WHERE workspace_id = ${scope.workspace_id} AND source_cell = 'H17' AND consumed_at IS NOT NULL AND retired_at IS NULL`;
      assert.equal(count.value, 1);
    });
    await step(
      "Read continuation is frozen and sensitive manifests remain actor-bound",
      async () => {
        const rows = ["I17", "J17", "K17"].map((source_cell) => ({
          ...summaryRow(),
          source_cell,
          selected: false,
        }));
        const batch = await preview(rows),
          first = await call("get_finance_import", { batch_id: batch.batch_id, limit: 1 });
        assert(first.next_cursor);
        const second = await call("get_finance_import", {
          batch_id: batch.batch_id,
          limit: 1,
          cursor: first.next_cursor,
        });
        assert.notEqual(first.rows[0].row_id, second.rows[0].row_id);
        await denied(() =>
          call("get_finance_import", {
            batch_id: batch.batch_id,
            limit: 2,
            cursor: first.next_cursor,
          }), "invalid_cursor");
        await database`UPDATE finance.import_batches SET actor_user_id = ${fresh()} WHERE id = ${batch.batch_id}`;
        await denied(
          () => call("get_finance_import", { batch_id: batch.batch_id }),
          "import_access_denied",
        );
      },
    );
  } finally {
    for (const workspace of workspaces) {
      await database`UPDATE finance.import_rows SET consumed_at = NULL, result_summary_id = NULL WHERE workspace_id = ${workspace}`;
      for (
        const table of [
          "monthly_summaries",
          "report_coverage",
          "import_rows",
          "import_batches",
          "planned_item_allocations",
          "planned_item_lines",
          "planned_items",
          "asset_valuations",
          "assets",
          "transaction_classifications",
          "transaction_groups",
          "transactions",
          "categories",
          "accounts",
          "book_access",
          "books",
        ]
      ) {
        await database`DELETE FROM ${
          database(`finance.${table}`)
        } WHERE workspace_id = ${workspace}`;
      }
      await database`DELETE FROM audit.events WHERE workspace_id = ${workspace}`;
      await database`DELETE FROM private.operation_receipts WHERE workspace_id = ${workspace}`;
      for (
        const table of [
          "person_aliases",
          "person_access",
          "person_user_links",
          "people",
          "workspace_members",
        ]
      ) await database`DELETE FROM ${database(`core.${table}`)} WHERE workspace_id = ${workspace}`;
      await database`DELETE FROM core.workspaces WHERE id = ${workspace}`;
    }
    for (const user of users) {
      const deleted = await admin.auth.admin.deleteUser(user);
      assert(!deleted.error);
    }
    await client.auth.stopAutoRefresh();
    await admin.auth.stopAutoRefresh();
    await Promise.all([
      database.end({ timeout: 2 }),
      service.end({ timeout: 2 }),
      concurrent.end({ timeout: 2 }),
    ]);
  }
});
