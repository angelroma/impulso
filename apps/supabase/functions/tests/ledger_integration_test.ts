import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import type { VerifiedIdentity } from "../_shared/auth.ts";
import { createDatabase } from "../_shared/database.ts";
import { createAccount, createBook, getFinanceContext, recordExpense } from "../_shared/finance.ts";
import {
  validateCreateAccountInput,
  validateCreateBookInput,
  validateRecordExpenseInput,
} from "../_shared/finance_contracts.ts";
import { ApiError } from "../_shared/http.ts";
import { runLedgerTool } from "../_shared/ledger.ts";
import {
  LEDGER_TOOL_SCHEMAS,
  type LedgerEntry,
  type LedgerToolName,
} from "../_shared/ledger_contracts.ts";
import { onboard, validateOnboardingInput } from "../_shared/onboarding.ts";

function environment(name: string): string {
  const value = Deno.env.get(name);
  assert(value, `Missing local test setting ${name}.`);
  return value;
}
async function rejected(operation: () => Promise<unknown>, code: string) {
  await assert.rejects(
    operation,
    (error: unknown) => error instanceof ApiError && error.code === code,
  );
}

Deno.test("Local ledger preserves legacy evidence and exact versioned financial effects", async (test) => {
  const api = new URL(environment("SUPABASE_URL"));
  const adminUrl = new URL(environment("SUPABASE_DB_URL"));
  const backendUrl = new URL(environment("IMPULSO_TEST_DATABASE_URL"));
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
  const admin = createClient(api.origin, environment("SUPABASE_SERVICE_ROLE_KEY"), options);
  const client = createClient(api.origin, environment("SUPABASE_ANON_KEY"), options);
  const database = createDatabase(adminUrl.toString());
  const service = createDatabase(backendUrl.toString());
  const concurrent = createDatabase(backendUrl.toString());
  const users: string[] = [];
  const workspaces: string[] = [];
  const fresh = () => crypto.randomUUID();
  let identity: VerifiedIdentity;
  let scope: { workspace_id: string; book_id: string };
  const accounts: Record<string, string> = {};
  let legacy: ReturnType<typeof validateRecordExpenseInput>;
  let legacyId: string;
  let expenseCategory: string;
  let groupIds: string[] = [];
  let groupId: string;
  let groupRequest: Record<string, unknown>;
  async function step(name: string, operation: () => Promise<void>) {
    assert(await test.step(name, operation), "A ledger step failed; dependent checks stopped.");
  }
  async function call(name: LedgerToolName, input: Record<string, unknown>, connection = service) {
    const output = await runLedgerTool(connection, identity, name, { ...scope, ...input });
    assert(
      LEDGER_TOOL_SCHEMAS[name].output.safeParse(output).success,
      `${name} returned a result outside its closed schema.`,
    );
    return output;
  }
  const entry = (
    kind: "income" | "expense" | "transfer",
    amount: string,
    source: string | null,
    destination: string | null,
  ): LedgerEntry =>
    ({
      kind,
      amount,
      currency: "MXN",
      occurred_on: "2026-01-10",
      description: "Synthetic accepted ledger entry",
      beneficiary_person_id: null,
      category_id: null,
      ...(source ? { source_account_id: source } : {}),
      ...(destination ? { destination_account_id: destination } : {}),
    }) as LedgerEntry;
  try {
    await step(
      "Disposable local identities and legacy resources establish the preserved baseline",
      async () => {
        const email = `ledger-${fresh()}@impulso.test.invalid`;
        const password = `${fresh()}aA1!`;
        const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
        assert(!created.error && created.data.user);
        users.push(created.data.user.id);
        const login = await client.auth.signInWithPassword({ email, password });
        assert(!login.error && login.data.session);
        const payload = login.data.session.access_token.split(".")[1].replaceAll("-", "+")
          .replaceAll("_", "/");
        identity = {
          user_id: created.data.user.id,
          session_id:
            JSON.parse(atob(payload.padEnd(Math.ceil(payload.length / 4) * 4, "="))).session_id,
          email,
        };
        const setup = await onboard(
          service,
          identity,
          validateOnboardingInput({
            request_id: fresh(),
            workspace_name: "Ledger fixture",
            display_name: "Ledger fixture",
            timezone: "America/Mexico_City",
          }),
        );
        workspaces.push(setup.workspace_id);
        const book = await createBook(
          service,
          identity,
          validateCreateBookInput({
            request_id: fresh(),
            workspace_id: setup.workspace_id,
            name: "Ledger test",
            currency: "MXN",
          }),
        );
        scope = { workspace_id: setup.workspace_id, book_id: book.book_id };
        for (
          const [name, opening] of [["bank", "100"], ["savings", "0"], ["card", "0"], [
            "loan",
            "-1000",
          ]]
        ) {
          const result = await createAccount(
            service,
            identity,
            validateCreateAccountInput({
              ...scope,
              request_id: fresh(),
              name,
              currency: "MXN",
              opening_balance: opening,
              person_id: null,
            }),
          );
          accounts[name] = result.account_id;
        }
        legacy = validateRecordExpenseInput({
          ...scope,
          request_id: fresh(),
          source_account_id: accounts.bank,
          amount: "100",
          currency: "MXN",
          occurred_on: "2026-01-02",
          description: "Hamburguesa",
          beneficiary_person_id: null,
        });
        legacyId = (await recordExpense(service, identity, legacy)).transaction_id;
        const [metadata] =
          await database`SELECT account_kind, opening_balance_on FROM finance.accounts WHERE id = ${accounts.bank}`;
        assert.equal(metadata.account_kind, "unknown");
        assert.equal(metadata.opening_balance_on, null);
        assert.equal((await recordExpense(service, identity, legacy)).transaction_id, legacyId);
      },
    );
    await step(
      "Reviewed account metadata preserves amounts and rejects dates after history",
      async () => {
        await rejected(() =>
          call("configure_account", {
            request_id: fresh(),
            account_id: accounts.bank,
            expected_version: 1,
            account_kind: "bank",
            opening_balance_on: "2026-02-01",
          }), "opening_boundary_conflict");
        for (
          const [name, kind] of [["bank", "bank"], ["savings", "bank"], ["card", "credit_card"], [
            "loan",
            "loan",
          ]]
        ) {
          await call("configure_account", {
            request_id: fresh(),
            account_id: accounts[name],
            expected_version: 1,
            account_kind: kind,
            opening_balance_on: "2026-01-01",
          });
        }
        const input = {
          request_id: fresh(),
          account_id: accounts.bank,
          expected_version: 2,
          account_kind: "bank",
          opening_balance_on: "2026-01-01",
        };
        const results = await Promise.allSettled([
          call("configure_account", input),
          call(
            "configure_account",
            { ...input, request_id: fresh(), account_kind: "cash" },
            concurrent,
          ),
        ]);
        assert.equal(
          results.filter((result) => result.status === "fulfilled").length,
          1,
        );
        const [row] =
          await database`SELECT opening_balance::text AS amount FROM finance.accounts WHERE id = ${accounts.bank}`;
        assert.equal(row.amount, "100.0000");
      },
    );
    await step(
      "Version-zero classification preserves v1 receipt recovery and races safely",
      async () => {
        const created = await call("manage_category", {
          request_id: fresh(),
          action: "create",
          kind: "expense",
          name: "Comida",
        });
        expenseCategory = (created.category as { category_id: string }).category_id;
        const classify = {
          request_id: fresh(),
          action: "classify",
          transaction_id: legacyId,
          category_id: expenseCategory,
          expected_version: 0,
        };
        await call("manage_category", classify);
        assert.equal((await call("manage_category", classify)).status, "already_processed");
        assert.equal((await recordExpense(service, identity, legacy)).transaction_id, legacyId);
        const results = await Promise.allSettled([
          call("manage_category", {
            ...classify,
            request_id: fresh(),
            expected_version: 1,
            category_id: null,
          }),
          call(
            "manage_category",
            { ...classify, request_id: fresh(), expected_version: 1 },
            concurrent,
          ),
        ]);
        assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
        const income = await call("manage_category", {
          request_id: fresh(),
          action: "create",
          kind: "income",
          name: "Salary",
        });
        await rejected(() =>
          call("manage_category", {
            request_id: fresh(),
            action: "classify",
            transaction_id: legacyId,
            category_id: (income.category as { category_id: string }).category_id,
            expected_version: 2,
          }), "category_kind_mismatch");
      },
    );
    await step(
      "Income, own-account transfers and card purchases have distinct effects",
      async () => {
        for (
          const value of [
            entry("income", "500", null, accounts.bank),
            entry("transfer", "200", accounts.bank, accounts.savings),
            entry("expense", "100", accounts.card, null),
          ]
        ) await call("record_transaction", { request_id: fresh(), action: "single", entry: value });
        const [totals] =
          await database`SELECT (SELECT sum(amount) FROM finance.transactions WHERE workspace_id = ${scope.workspace_id} AND kind = 'income')::text AS income,
        (SELECT sum(amount) FROM finance.transactions WHERE workspace_id = ${scope.workspace_id} AND kind = 'expense')::text AS expense`;
        assert.equal(totals.income, "500.0000");
        assert.equal(totals.expense, "200.0000");
      },
    );
    await step(
      "Accepted principal and interest groups retain distinct immutable ordered child requests",
      async () => {
        groupRequest = {
          request_id: fresh(),
          action: "group",
          description: "Loan payment",
          currency: "MXN",
          total_amount: "100",
          entries: [
            entry("transfer", "80", accounts.bank, accounts.loan),
            entry("expense", "20", accounts.bank, null),
          ],
        };
        const result = await call("record_transaction", groupRequest);
        groupId = String(result.group_id);
        const entries = result.entries as { transaction_id: string; request_id: string }[];
        groupIds = entries.map((row) => row.transaction_id);
        assert.equal(new Set(entries.map((row) => row.request_id)).size, 2);
        assert(!entries.some((row) => row.request_id === groupRequest.request_id));
        const retry = await call("record_transaction", {
          ...groupRequest,
          total_amount: "0100.00",
        });
        assert.equal(retry.status, "already_processed");
        assert.deepEqual(retry.entries, result.entries);
        const ordered =
          await database`SELECT transaction_id FROM finance.transaction_classifications WHERE group_id = ${groupId} ORDER BY group_position`;
        assert.deepEqual(ordered.map((row) => row.transaction_id), groupIds);
        await assert.rejects(
          () =>
            service`UPDATE finance.transaction_classifications SET group_position = 10 WHERE group_id = ${groupId}`,
          (error: unknown) =>
            error !== null && typeof error === "object" && "code" in error &&
            error.code === "42501",
        );
      },
    );
    await step(
      "Invalid splits and cross-contract request reuse leave no partial money or evidence",
      async () => {
        const request = fresh();
        await rejected(
          () =>
            call("record_transaction", {
              ...groupRequest,
              request_id: request,
              total_amount: "99",
            }),
          "component_total_mismatch",
        );
        const [counts] =
          await database`SELECT (SELECT count(*) FROM finance.transaction_groups WHERE request_id = ${request})::int AS groups, (SELECT count(*) FROM private.operation_receipts WHERE request_id = ${request})::int AS receipts`;
        assert.equal(counts.groups, 0);
        assert.equal(counts.receipts, 0);
        await rejected(() =>
          call("record_transaction", {
            request_id: legacy.request_id,
            action: "single",
            entry: {
              ...entry("expense", "100", accounts.bank, null),
              occurred_on: legacy.occurred_on,
              description: legacy.description,
            },
          }), "request_conflict");
      },
    );
    await step(
      "Boundaries and archived categories deny new postings without guessing",
      async () => {
        await rejected(() =>
          call("record_transaction", {
            request_id: fresh(),
            action: "single",
            entry: { ...entry("expense", "1", accounts.bank, null), occurred_on: "2025-12-31" },
          }), "opening_boundary_conflict");
        await rejected(() =>
          recordExpense(service, identity, {
            ...legacy,
            request_id: fresh(),
            occurred_on: "2025-12-31",
          }), "opening_boundary_conflict");
        const created = await call("manage_category", {
          request_id: fresh(),
          action: "create",
          kind: "expense",
          name: "Archived category",
        });
        const id = (created.category as { category_id: string }).category_id;
        await call("manage_category", {
          request_id: fresh(),
          action: "archive",
          category_id: id,
          expected_version: 1,
        });
        await rejected(() =>
          call("record_transaction", {
            request_id: fresh(),
            action: "single",
            entry: { ...entry("expense", "1", accounts.bank, null), category_id: id },
          }), "category_archived");
      },
    );
    await step("Corrections preserve originals and retire legacy creation receipts", async () => {
      const correction = {
        request_id: fresh(),
        action: "replace",
        transaction_id: legacyId,
        expected_version: 1,
        reason: "Accepted amount correction",
        reconcile_allocations: [],
        replacement: {
          ...entry("expense", "80", accounts.bank, null),
          occurred_on: legacy.occurred_on,
          description: legacy.description,
        },
      };
      const result = await call("correct_transaction", correction);
      assert.equal(result.status, "replaced");
      assert.equal((await call("correct_transaction", correction)).status, "already_processed");
      await rejected(() => recordExpense(service, identity, legacy), "action_retired");
      const original =
        await database`SELECT amount::text, description, voided_at FROM finance.transactions WHERE id = ${legacyId}`;
      assert.equal(original[0].amount, "100.0000");
      assert(original[0].voided_at);
      assert.equal(original[0].description, "Hamburguesa");
      const target = (result.replacement as { transaction_id: string }).transaction_id;
      const base = {
        action: "void",
        transaction_id: target,
        expected_version: 1,
        reason: "Accepted void",
        reconcile_allocations: [],
      };
      const races = await Promise.allSettled([
        call("correct_transaction", { ...base, request_id: fresh() }),
        call("correct_transaction", { ...base, request_id: fresh() }, concurrent),
      ]);
      assert.equal(races.filter((item) => item.status === "fulfilled").length, 1);
    });
    await step(
      "Correcting one group component preserves the original group membership",
      async () => {
        await call("correct_transaction", {
          request_id: fresh(),
          action: "replace",
          transaction_id: groupIds[1],
          expected_version: 1,
          reason: "Interest correction",
          reconcile_allocations: [],
          replacement: entry("expense", "18", accounts.bank, null),
        });
        const ordered =
          await database`SELECT transaction_id FROM finance.transaction_classifications WHERE group_id = ${groupId} ORDER BY group_position`;
        assert.deepEqual(ordered.map((row) => row.transaction_id), groupIds);
        await rejected(() => call("record_transaction", groupRequest), "action_retired");
      },
    );
    await step(
      "Bounded keyset reads bind every filter and preserve amount-free context",
      async () => {
        const filter = { from: "2026-01-01", to: "2026-12-31", state: "all", page_size: 2 };
        const seen = new Set<string>();
        let cursor: string | null = null;
        do {
          const page = await call("list_transactions", {
            ...filter,
            ...(cursor ? { cursor } : {}),
          });
          for (const row of page.entries as { transaction_id: string }[]) {
            assert(!seen.has(row.transaction_id));
            seen.add(row.transaction_id);
          }
          cursor = page.next_cursor as string | null;
        } while (cursor);
        const [count] =
          await database`SELECT count(*)::int AS value FROM finance.transactions WHERE workspace_id = ${scope.workspace_id}`;
        assert.equal(seen.size, count.value);
        const first = await call("list_transactions", filter);
        assert(first.next_cursor);
        await rejected(
          () =>
            call("list_transactions", { ...filter, kind: "expense", cursor: first.next_cursor }),
          "invalid_cursor",
        );
        const context = await getFinanceContext(service, identity, scope);
        assert(!JSON.stringify(context).includes("opening_balance"));
        assert(!JSON.stringify(context).includes("Hamburguesa"));
      },
    );
    await step(
      "Viewer reads remain separate from writes and revoked grants deny continuation",
      async () => {
        const first = await call("list_transactions", {
          from: "2026-01-01",
          to: "2026-12-31",
          state: "all",
          page_size: 1,
        });
        await database`UPDATE finance.book_access SET role = 'viewer' WHERE workspace_id = ${scope.workspace_id} AND book_id = ${scope.book_id} AND user_id = ${identity.user_id}`;
        await call("list_transactions", {
          from: "2026-01-01",
          to: "2026-12-31",
          state: "all",
          page_size: 1,
        });
        await rejected(() =>
          call("record_transaction", {
            request_id: fresh(),
            action: "single",
            entry: entry("income", "1", null, accounts.bank),
          }), "book_access_denied");
        await database`UPDATE finance.book_access SET revoked_at = now() WHERE workspace_id = ${scope.workspace_id} AND book_id = ${scope.book_id} AND user_id = ${identity.user_id}`;
        await rejected(() =>
          call("list_transactions", {
            from: "2026-01-01",
            to: "2026-12-31",
            state: "all",
            page_size: 1,
            cursor: first.next_cursor,
          }), "book_access_denied");
      },
    );
  } finally {
    for (const workspace of workspaces) {
      await database`DELETE FROM finance.transaction_classifications WHERE workspace_id = ${workspace}`;
      await database`DELETE FROM finance.transaction_groups WHERE workspace_id = ${workspace}`;
      await database`DELETE FROM finance.transactions WHERE workspace_id = ${workspace}`;
      await database`DELETE FROM finance.categories WHERE workspace_id = ${workspace}`;
      await database`DELETE FROM finance.accounts WHERE workspace_id = ${workspace}`;
      await database`DELETE FROM finance.book_access WHERE workspace_id = ${workspace}`;
      await database`DELETE FROM finance.books WHERE workspace_id = ${workspace}`;
      await database`DELETE FROM audit.events WHERE workspace_id = ${workspace}`;
      await database`DELETE FROM private.operation_receipts WHERE workspace_id = ${workspace}`;
      await database`DELETE FROM core.person_aliases WHERE workspace_id = ${workspace}`;
      await database`DELETE FROM core.person_access WHERE workspace_id = ${workspace}`;
      await database`DELETE FROM core.person_user_links WHERE workspace_id = ${workspace}`;
      await database`DELETE FROM core.people WHERE workspace_id = ${workspace}`;
      await database`DELETE FROM core.workspace_members WHERE workspace_id = ${workspace}`;
      await database`DELETE FROM core.workspaces WHERE id = ${workspace}`;
    }
    for (const user of users) {
      const result = await admin.auth.admin.deleteUser(user);
      assert(!result.error);
    }
    await client.auth.stopAutoRefresh();
    await admin.auth.stopAutoRefresh();
    await Promise.all([
      service.end({ timeout: 2 }),
      concurrent.end({ timeout: 2 }),
      database.end({ timeout: 2 }),
    ]);
  }
});
