import assert from "node:assert/strict";
import { financeFingerprint, fromMinorUnits, minorUnits } from "./finance_common.ts";
import { normalizeLedgerEntry } from "./ledger.ts";
import { LEDGER_TOOL_SCHEMAS, parseLedgerInput } from "./ledger_contracts.ts";
import { normalizeMoney } from "./finance_contracts.ts";
import { ApiError } from "./http.ts";

const ids = Array.from(
  { length: 15 },
  (_, index) => `10000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
);
const scope = { request_id: ids[0], workspace_id: ids[1], book_id: ids[2] };
const book = { id: ids[2], name: "Local test", currency: "MXN", minor_unit: 2, archived_at: null };
const expense = {
  kind: "expense" as const,
  source_account_id: ids[3],
  amount: "100.00",
  currency: "MXN",
  occurred_on: "2026-02-28",
  description: "Hamburguesa",
  beneficiary_person_id: null,
  category_id: null,
};

Deno.test("ledger inputs are closed across every action and nested component", () => {
  assert.throws(
    () =>
      parseLedgerInput(LEDGER_TOOL_SCHEMAS.configure_account.input, {
        ...scope,
        account_id: ids[3],
        expected_version: 1,
        account_kind: "bank",
        opening_balance_on: null,
        opening_balance: "9",
      }),
    ApiError,
  );
  assert.throws(
    () =>
      parseLedgerInput(LEDGER_TOOL_SCHEMAS.record_transaction.input, {
        ...scope,
        action: "single",
        entry: { ...expense, sql: "select 1" },
      }),
    ApiError,
  );
  assert.throws(
    () =>
      parseLedgerInput(LEDGER_TOOL_SCHEMAS.manage_category.input, {
        ...scope,
        action: "delete",
        category_id: ids[4],
      }),
    ApiError,
  );
  assert.throws(
    () =>
      parseLedgerInput(LEDGER_TOOL_SCHEMAS.record_transaction.input, {
        ...scope,
        action: "single",
        entry: { ...expense, actor_user_id: ids[5] },
      }),
    ApiError,
  );
});

Deno.test("kind-specific ledger contracts reject invalid account effects", () => {
  const schema = LEDGER_TOOL_SCHEMAS.record_transaction.input;
  assert.throws(
    () =>
      parseLedgerInput(schema, {
        ...scope,
        action: "single",
        entry: { ...expense, kind: "income" },
      }),
    ApiError,
  );
  assert.throws(
    () =>
      parseLedgerInput(schema, {
        ...scope,
        action: "single",
        entry: { ...expense, destination_account_id: ids[4] },
      }),
    ApiError,
  );
  assert.throws(
    () =>
      parseLedgerInput(schema, {
        ...scope,
        action: "single",
        entry: { ...expense, kind: "transfer", destination_account_id: ids[3] },
      }),
    ApiError,
  );
  assert.throws(
    () =>
      parseLedgerInput(schema, {
        ...scope,
        action: "single",
        entry: {
          ...expense,
          kind: "transfer",
          destination_account_id: ids[4],
          category_id: ids[5],
        },
      }),
    ApiError,
  );
});

Deno.test("ledger amounts and dates reject lossy representations", () => {
  for (const amount of [100, "1e2", "NaN", "Infinity", "0", "-1", "1,000.00", "1.00001"]) {
    assert.throws(
      () =>
        parseLedgerInput(LEDGER_TOOL_SCHEMAS.record_transaction.input, {
          ...scope,
          action: "single",
          entry: { ...expense, amount },
        }),
      ApiError,
    );
  }
  for (const occurred_on of ["2026-02-29", "0000-01-01", "2026-13-01", "2026-2-1"]) {
    assert.throws(() =>
      parseLedgerInput(LEDGER_TOOL_SCHEMAS.record_transaction.input, {
        ...scope,
        action: "single",
        entry: { ...expense, occurred_on },
      }), ApiError);
  }
  assert.throws(() => normalizeLedgerEntry({ ...expense, amount: "100.000" }, book), ApiError);
});

Deno.test("group contracts require between two and ten explicitly typed entries", () => {
  const schema = LEDGER_TOOL_SCHEMAS.record_transaction.input;
  for (const count of [0, 1, 11]) {
    assert.throws(() =>
      parseLedgerInput(schema, {
        ...scope,
        action: "group",
        description: "Payment",
        currency: "MXN",
        total_amount: "1000.00",
        entries: Array(count).fill(expense),
      }), ApiError);
  }
  assert.equal(
    parseLedgerInput(schema, {
      ...scope,
      action: "group",
      description: "Payment",
      currency: "MXN",
      total_amount: "1000.00",
      entries: Array(10).fill(expense),
    }).action,
    "group",
  );
});

Deno.test("classification version zero represents only the absent first classification", () => {
  const value = parseLedgerInput(LEDGER_TOOL_SCHEMAS.manage_category.input, {
    ...scope,
    action: "classify",
    transaction_id: ids[4],
    category_id: null,
    expected_version: 0,
  });
  assert.equal(value.action, "classify");
  assert.throws(
    () =>
      parseLedgerInput(LEDGER_TOOL_SCHEMAS.manage_category.input, {
        ...scope,
        action: "rename",
        category_id: ids[4],
        name: "Food",
        expected_version: 0,
      }),
    ApiError,
  );
});

Deno.test("exact sums preserve large minor units without floating point", () => {
  const total = minorUnits("9999999999999999.9900", 2) + minorUnits("0.01", 2);
  assert.equal(fromMinorUnits(total, 2), "10000000000000000.00");
  assert.equal(fromMinorUnits(minorUnits("-125.0000", 2), 2), "-125.00");
  assert.equal(fromMinorUnits(0n, 0), "0");
  assert.throws(() => normalizeMoney("1.000", 2, true), ApiError);
});

Deno.test("v2 fingerprints canonicalize keys but retain contract, order and accepted values", async () => {
  const first = await financeFingerprint("record_transaction", {
    ...scope,
    action: "single",
    entry: normalizeLedgerEntry(expense, book),
  });
  const retry = await financeFingerprint("record_transaction", {
    entry: normalizeLedgerEntry({ ...expense, amount: "0100.0" }, book),
    book_id: scope.book_id,
    workspace_id: scope.workspace_id,
    request_id: ids[7],
    action: "single",
  });
  assert.equal(first, retry);
  assert.notEqual(
    first,
    await financeFingerprint("create_transaction", { ...scope, action: "single", entry: expense }),
  );
  assert.notEqual(
    await financeFingerprint("record_transaction_group", {
      entries: [expense, { ...expense, amount: "1.00" }],
    }),
    await financeFingerprint("record_transaction_group", {
      entries: [{ ...expense, amount: "1.00" }, expense],
    }),
  );
  assert.notEqual(
    await financeFingerprint("import", { source: { request_id: "one" } }),
    await financeFingerprint("import", { source: { request_id: "two" } }),
  );
});

Deno.test("settlement links are bounded, unique and cannot overallocate their movement", () => {
  assert.throws(
    () =>
      normalizeLedgerEntry({
        ...expense,
        settlement_links: [{ planned_item_line_id: ids[5], amount: "100.01" }],
      }, book),
    ApiError,
  );
  assert.throws(
    () =>
      normalizeLedgerEntry({
        ...expense,
        settlement_links: [{ planned_item_line_id: ids[5], amount: "1" }, {
          planned_item_line_id: ids[5],
          amount: "1",
        }],
      }, book),
    ApiError,
  );
  assert.equal(
    normalizeLedgerEntry({
      ...expense,
      settlement_links: [{ planned_item_line_id: ids[5], amount: "100" }],
    }, book).settlement_links?.[0].amount,
    "100.00",
  );
});

Deno.test("ledger filters, pages and correction dependency actions are closed", () => {
  const base = { workspace_id: ids[1], book_id: ids[2], from: "2026-01-01", to: "2026-12-31" };
  assert.throws(
    () =>
      parseLedgerInput(LEDGER_TOOL_SCHEMAS.list_transactions.input, { ...base, page_size: 101 }),
    ApiError,
  );
  assert.throws(
    () =>
      parseLedgerInput(LEDGER_TOOL_SCHEMAS.list_transactions.input, {
        ...base,
        from: "2027-01-01",
      }),
    ApiError,
  );
  assert.throws(
    () =>
      parseLedgerInput(LEDGER_TOOL_SCHEMAS.correct_transaction.input, {
        ...scope,
        action: "void",
        transaction_id: ids[4],
        expected_version: 1,
        reason: "User review",
        reconcile_allocations: [{ allocation_id: ids[5], expected_version: 1, action: "replace" }],
      }),
    ApiError,
  );
  assert.equal(
    parseLedgerInput(LEDGER_TOOL_SCHEMAS.list_transactions.input, {
      ...base,
      category_id: null,
      state: "all",
      page_size: 100,
    }).category_id,
    null,
  );
});
