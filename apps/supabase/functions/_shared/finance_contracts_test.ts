import assert from "node:assert/strict";
import {
  FINANCE_TOOLS,
  manageAccountInput,
  recordTransactionInput,
  updateTransactionInput,
} from "./finance_contracts.ts";

const requestId = "44444444-4444-4444-8444-444444444444";

Deno.test("transactions accept exact two-decimal strings and reject numbers and extra fields", () => {
  for (const amount of ["1", "250.5", "250.50", "999999999999.99"]) {
    assert.ok(
      recordTransactionInput.safeParse({ request_id: requestId, kind: "expense", amount }).success,
    );
  }
  for (
    const value of [
      { request_id: requestId, kind: "expense", amount: 250 },
      { request_id: requestId, kind: "expense", amount: "-1" },
      { request_id: requestId, kind: "expense", amount: "1.001" },
      { request_id: requestId, kind: "expense", amount: "1e3" },
      { request_id: requestId, kind: "refund", amount: "1" },
      { request_id: requestId, kind: "expense", amount: "1", user_id: "other" },
      { request_id: requestId, kind: "expense", amount: "1", date: "1/11/2026" },
      { request_id: "not-a-uuid", kind: "expense", amount: "1" },
    ]
  ) {
    assert.equal(recordTransactionInput.safeParse(value).success, false, JSON.stringify(value));
  }
});

Deno.test("names are trimmed and control characters are rejected", () => {
  const parsed = manageAccountInput.parse({ action: "create", name: "  BBVA  " });
  assert.equal(parsed.name, "BBVA");
  assert.equal(manageAccountInput.safeParse({ action: "create", name: "  " }).success, false);
  assert.equal(manageAccountInput.safeParse({ action: "create", name: "a\u0007b" }).success, false);
  assert.equal(
    manageAccountInput.safeParse({ action: "create", name: "x".repeat(101) }).success,
    false,
  );
});

Deno.test("transaction edits can clear optional links with null", () => {
  const parsed = updateTransactionInput.parse({
    action: "edit",
    transaction_id: requestId,
    payee: null,
    category_id: null,
    project_id: null,
  });
  assert.equal(parsed.payee, null);
  assert.equal(
    updateTransactionInput.safeParse({ action: "purge", transaction_id: requestId }).success,
    false,
  );
});

Deno.test("archived records can be restored by name and summaries group by top-level category", () => {
  for (const tool of ["manage_workspace", "manage_account", "manage_category", "manage_payee"]) {
    const { input } = FINANCE_TOOLS[tool as keyof typeof FINANCE_TOOLS];
    assert.ok(input.safeParse({ action: "restore", name: "Efectivo" }).success, tool);
  }
  assert.equal(
    FINANCE_TOOLS.manage_project.input.safeParse({ action: "restore", name: "x" }).success,
    false,
  );
  assert.ok(FINANCE_TOOLS.get_summary.input.safeParse({ group_by: "top_category" }).success);
  assert.ok(
    FINANCE_TOOLS.get_summary.input.safeParse({
      from: "2026-10-01",
      to: "2026-11-30",
      statement: true,
      account_id: crypto.randomUUID(),
    }).success,
  );
  assert.equal(FINANCE_TOOLS.get_summary.input.safeParse({ statement: "yes" }).success, false);
});

Deno.test("every tool has a short description and a closed input", () => {
  for (const [name, tool] of Object.entries(FINANCE_TOOLS)) {
    assert.ok(tool.description.length <= 300, `${name} description must stay short`);
    assert.equal(tool.input.safeParse({ unexpected: true }).success, false, name);
  }
});
