import { createClient } from "@supabase/supabase-js";
import type { VerifiedIdentity } from "../_shared/auth.ts";
import { createDatabase, sessionIsActive } from "../_shared/database.ts";
import { runFinanceTool } from "../_shared/finance.ts";
import type { FinanceToolName } from "../_shared/finance_contracts.ts";
import { ApiError } from "../_shared/http.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function requiredEnvironment(name: string): string {
  const value = Deno.env.get(name);
  assert(value, `The local integration environment is missing ${name}.`);
  return value;
}

function localEnvironment() {
  const api = new URL(requiredEnvironment("SUPABASE_URL"));
  const databaseUrl = requiredEnvironment("SUPABASE_DB_URL");
  const database = new URL(databaseUrl);
  const backendUrl = requiredEnvironment("IMPULSO_TEST_DATABASE_URL");
  const backend = new URL(backendUrl);
  const loopback = ["127.0.0.1", "localhost"];
  assert(
    api.protocol === "http:" && loopback.includes(api.hostname) && api.port === "54321" &&
      api.username === "" && api.password === "" && api.pathname === "/" &&
      api.search === "" && api.hash === "" &&
      ["postgres:", "postgresql:"].includes(database.protocol) &&
      loopback.includes(database.hostname) && database.port === "54322" &&
      backend.username === "impulso_backend" && loopback.includes(backend.hostname) &&
      backend.port === "54322",
    "Integration fixtures may only be created in the local Impulso stack.",
  );
  assert(
    requiredEnvironment("IMPULSO_AUTH_ISSUER") === `${api.origin}/auth/v1`,
    "The integration issuer must belong to the local Auth server.",
  );
  return {
    apiUrl: api.origin,
    databaseUrl,
    backendUrl,
    anonymousKey: requiredEnvironment("SUPABASE_ANON_KEY"),
    serviceKey: requiredEnvironment("SUPABASE_SERVICE_ROLE_KEY"),
  };
}

async function expectStatus(
  apiUrl: string,
  path: string,
  status: number,
  init: RequestInit = {},
): Promise<unknown> {
  const response = await fetch(`${apiUrl}/functions/v1/impulso-api${path}`, {
    ...init,
    signal: AbortSignal.timeout(10_000),
  });
  const body = await response.text();
  assert(response.status === status, `${path} returned ${response.status}; expected ${status}.`);
  assert(response.headers.get("cache-control") === "no-store", "API responses must not be cached.");
  return JSON.parse(body);
}

function sessionIdentifier(token: string): string {
  const payload = token.split(".")[1].replaceAll("-", "+").replaceAll("_", "/");
  const padded = payload.padEnd(Math.ceil(payload.length / 4) * 4, "=");
  const bytes = Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
  const claims = JSON.parse(new TextDecoder().decode(bytes));
  assert(typeof claims.session_id === "string", "Auth must issue a session identifier.");
  return claims.session_id;
}

Deno.test("Local Edge API verifies identity and runs the Finance service", async (test) => {
  // Validate both destinations before constructing privileged clients or creating fixtures.
  const environment = localEnvironment();
  const options = {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  };
  const admin = createClient(environment.apiUrl, environment.serviceKey, options);
  const client = createClient(environment.apiUrl, environment.anonymousKey, options);
  const database = createDatabase(environment.databaseUrl);
  const backend = createDatabase(environment.backendUrl);
  const email = `edge-${crypto.randomUUID()}@impulso.test.invalid`;
  const password = `${crypto.randomUUID()}aA1!`;
  let userId: string | undefined;

  try {
    await test.step("Public health and untrusted credentials cannot establish a user", async () => {
      await expectStatus(environment.apiUrl, "/health", 200);
      await expectStatus(environment.apiUrl, "/session", 401);
      await expectStatus(environment.apiUrl, "/session", 401, {
        headers: { Authorization: "Bearer invalid-token" },
      });
      await expectStatus(environment.apiUrl, "/session", 401, {
        headers: { apikey: environment.anonymousKey },
      });
      await expectStatus(environment.apiUrl, "/session", 401, {
        headers: { Authorization: `Bearer ${environment.anonymousKey}` },
      });
      await expectStatus(environment.apiUrl, "/session", 401, {
        headers: { Authorization: `Bearer ${environment.serviceKey}` },
      });
    });

    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (created.error) {
      const message = created.error.message.replaceAll(password, "[redacted]")
        .replaceAll(environment.anonymousKey, "[redacted]")
        .replaceAll(environment.serviceKey, "[redacted]").slice(0, 500);
      throw new Error(`Creating the disposable local Auth account failed: ${
        JSON.stringify({
          name: created.error.name,
          status: created.error.status,
          code: created.error.code,
          message,
        })
      }`);
    }
    assert(created.data.user, "Creating the disposable local Auth account returned no user.");
    const fixtureUserId = created.data.user.id;
    userId = fixtureUserId;
    const signedIn = await client.auth.signInWithPassword({ email, password });
    assert(
      !signedIn.error && signedIn.data.session,
      "Signing in the disposable local Auth account failed.",
    );
    const token = signedIn.data.session.access_token;
    const identity: VerifiedIdentity = {
      user_id: fixtureUserId,
      session_id: sessionIdentifier(token),
      email,
    };
    const headers = { Authorization: `Bearer ${token}` };

    await test.step("A real user session supplies identity and rejects client actor fields", async () => {
      const result = await expectStatus(environment.apiUrl, "/session", 200, { headers }) as {
        user?: { id?: unknown; email?: unknown };
      };
      assert(
        result.user?.id === fixtureUserId,
        "The API must return the Auth-verified user identifier.",
      );
      assert(result.user?.email === email, "The API must return the verified account email.");
      const parts = token.split(".");
      parts[2] = (parts[2][0] === "A" ? "B" : "A") + parts[2].slice(1);
      await expectStatus(environment.apiUrl, "/session", 401, {
        headers: { Authorization: `Bearer ${parts.join(".")}` },
      });
      await expectStatus(environment.apiUrl, `/?user_id=${crypto.randomUUID()}`, 404, { headers });
      await expectStatus(environment.apiUrl, `/session?user_id=${crypto.randomUUID()}`, 400, {
        headers,
      });
      await expectStatus(environment.apiUrl, "/session", 405, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: crypto.randomUUID(), session_id: identity.session_id }),
      });
      assert(
        await sessionIsActive(database, identity),
        "The signed-in session must exist in Auth.",
      );
      assert(
        !await sessionIsActive(database, { ...identity, user_id: crypto.randomUUID() }),
        "A session identifier must never authenticate a different user.",
      );
    });

    // deno-lint-ignore no-explicit-any
    type Result = Record<string, any>;
    const call = async (name: FinanceToolName, input: Record<string, unknown>): Promise<Result> =>
      await runFinanceTool(backend, identity, name, input);
    const expectError = async (
      name: FinanceToolName,
      input: Record<string, unknown>,
      code: string,
    ) => {
      try {
        await call(name, input);
      } catch (error) {
        assert(error instanceof ApiError && error.code === code, `${name} must fail with ${code}.`);
        return;
      }
      throw new Error(`${name} unexpectedly succeeded; expected ${code}.`);
    };

    await test.step("The backend role edits finance tables but can never delete rows", async () => {
      const [privileges] = await database<{ can_delete: boolean; can_update: boolean }[]>`
        SELECT has_table_privilege('impulso_backend', 'finance.transactions', 'DELETE') AS can_delete,
          has_table_privilege('impulso_backend', 'finance.transactions', 'UPDATE') AS can_update`;
      assert(
        privileges.can_update && !privileges.can_delete,
        "Transactions must be editable and never hard-deleted.",
      );
    });

    await test.step("A new user sets up workspaces, accounts, categories and payees", async () => {
      assert((await call("get_context", {})).setup_required === true, "Setup must be required.");
      await expectError("record_transaction", {
        request_id: crypto.randomUUID(),
        kind: "expense",
        amount: "1",
      }, "setup_required");
      await expectError("manage_workspace", {
        action: "create",
        name: "Yo",
        currency: "MXN",
        timezone: "Mars/Olympus",
      }, "invalid_timezone");
      const yo = await call("manage_workspace", {
        action: "create",
        name: "Yo",
        currency: "MXN",
        timezone: "America/Mexico_City",
      });
      assert(yo.workspace.is_default === true, "The first workspace must become the default.");
      const seeded: Result[] = (await call("get_context", {})).categories;
      assert(
        seeded.some((category) => category.name === "Vivienda" && !category.parent) &&
          seeded.some((category) => category.name === "Renta" && category.parent === "Vivienda") &&
          seeded.some((category) =>
            category.name === "Salario, facturas" && category.kind === "income"
          ),
        "A new workspace must start with the default categories.",
      );
      const mama = await call("manage_workspace", {
        action: "create",
        name: "Mamá",
        currency: "MXN",
        timezone: "America/Mexico_City",
      });
      assert(mama.workspace.is_default === false, "Later workspaces are not default.");
      await expectError("manage_workspace", {
        action: "create",
        name: "yo",
        currency: "MXN",
        timezone: "UTC",
      }, "name_taken");
      const bbva = await call("manage_account", { action: "create", name: "BBVA" });
      assert(
        bbva.account.is_default === true && bbva.account.currency === "MXN",
        "The first account must become the default in the workspace currency.",
      );
      await call("manage_account", { action: "create", name: "Efectivo", kind: "cash" });
      await call("manage_account", {
        action: "update",
        account_id: bbva.account.id,
        name: "BBVA Débito",
      });
      const home = await call("manage_category", {
        action: "create",
        name: "Hogar",
        kind: "expense",
      });
      const food = await call("manage_category", {
        action: "create",
        name: "Comida",
        parent_id: home.category.id,
      });
      assert(
        food.category.parent === "Hogar" && food.category.kind === "expense",
        "A subcategory must name its parent and take its kind.",
      );
      await expectError("manage_category", {
        action: "create",
        name: "Despensa",
        parent_id: food.category.id,
      }, "parent_is_subcategory");
      await expectError("manage_category", {
        action: "update",
        category_id: home.category.id,
        parent_id: food.category.id,
      }, "parent_is_subcategory");
      await expectError("manage_category", {
        action: "archive",
        category_id: home.category.id,
      }, "has_subcategories");
      await call("manage_payee", {
        action: "create",
        name: "Oxxo",
        default_category_id: food.category.id,
      });
      const context = await call("get_context", {});
      assert(
        context.workspace.name === "Yo" && context.accounts.length === 2 &&
          context.accounts[0].name === "BBVA Débito" && context.payees.length === 1,
        "Context must list the renamed default account first and the payee.",
      );
    });

    await test.step("Transactions use defaults, retry safely and keep balances", async () => {
      const context = await call("get_context", {});
      const [bbva, cash] = context.accounts;
      const expense = {
        request_id: crypto.randomUUID(),
        kind: "expense",
        amount: "200.50",
        payee: "oxxo",
        date: "2026-11-01",
      };
      const first = await call("record_transaction", expense);
      const retry = await call("record_transaction", expense);
      assert(
        first.status === "created" && retry.status === "already_processed" &&
          first.transaction.id === retry.transaction.id,
        "A retry with the same request_id must not duplicate the expense.",
      );
      assert(
        first.transaction.category === "Comida" && first.transaction.payee === "Oxxo" &&
          first.transaction.account === "BBVA Débito" && first.account_balance === "-200.50",
        "The payee default category and default account must apply.",
      );
      const transfer = await call("record_transaction", {
        request_id: crypto.randomUUID(),
        kind: "transfer",
        amount: "1000",
        to_account_id: cash.id,
        date: "2026-11-02",
      });
      assert(transfer.account_balance === "-1200.50", "A transfer must leave the source account.");
      await expectError("record_transaction", {
        request_id: crypto.randomUUID(),
        kind: "transfer",
        amount: "5",
        to_account_id: bbva.id,
        account_id: bbva.id,
      }, "same_account");
      const edited = await call("update_transaction", {
        action: "edit",
        transaction_id: first.transaction.id,
        amount: "180",
        notes: "Snacks",
      });
      assert(edited.transaction.amount === "180.00", "Editing must change the amount.");
      await call("update_transaction", { action: "delete", transaction_id: first.transaction.id });
      const afterDelete = await call("get_context", {});
      assert(afterDelete.accounts[0].balance === "-1000.00", "Deleted rows leave balances.");
      await call("update_transaction", { action: "restore", transaction_id: first.transaction.id });
      const listed = await call("list_transactions", { search: "snack" });
      assert(listed.transactions.length === 1, "Search must match notes.");
      const summary = await call("get_summary", {
        from: "2026-11-01",
        to: "2026-11-30",
        group_by: "category",
      });
      assert(
        summary.totals[0].expense === "180.00" && summary.groups[0].key === "Comida" &&
          summary.groups[0].parent === "Hogar",
        "The summary must exclude transfers and group by category.",
      );
    });

    await test.step("Projects track spending against their budget", async () => {
      const project = await call("manage_project", {
        action: "create",
        name: "Viaje Japón",
        budget: "1000",
      });
      await call("record_transaction", {
        request_id: crypto.randomUUID(),
        kind: "expense",
        amount: "300",
        payee: "Aeroméxico",
        project_id: project.project.id,
      });
      const context = await call("get_context", {});
      const progress = context.projects.find((row: { id: string }) =>
        row.id === project.project.id
      );
      assert(
        progress.spent === "300.00" && progress.remaining === "700.00",
        "Project spent and remaining must come from its transactions.",
      );
      await call("manage_project", { action: "close", project_id: project.project.id });
      await expectError("record_transaction", {
        request_id: crypto.randomUUID(),
        kind: "expense",
        amount: "1",
        project_id: project.project.id,
      }, "project_closed");
    });

    await test.step("Guards keep debts negative, currencies stable and archives idempotent", async () => {
      await expectError("manage_account", {
        action: "create",
        name: "Tarjeta Nu",
        kind: "credit_card",
        opening_balance: "5000",
      }, "debt_must_be_negative");
      const card = await call("manage_account", {
        action: "create",
        name: "Tarjeta Nu",
        kind: "credit_card",
        opening_balance: "-5000",
      });
      assert(card.account.balance === "-5000.00", "A card debt starts as a negative balance.");
      const context = await call("get_context", {});
      await expectError("manage_workspace", {
        action: "update",
        workspace_id: context.workspace.id,
        currency: "USD",
      }, "workspace_in_use");
      const first = await call("manage_account", {
        action: "archive",
        account_id: card.account.id,
      });
      const again = await call("manage_account", {
        action: "archive",
        account_id: card.account.id,
      });
      assert(
        first.status === "archived" && again.status === "already_archived",
        "Archiving twice must report the account as already archived.",
      );
      const recorded = await call("record_transaction", {
        request_id: crypto.randomUUID(),
        kind: "expense",
        amount: "12",
        payee: "Uber",
      });
      assert(!("deleted" in recorded.transaction), "Active transactions omit the deleted flag.");
    });

    await test.step("Transactions and accounts move between independent workspaces", async () => {
      const context = await call("get_context", {});
      const mama = context.workspaces.find((row: { name: string }) => row.name === "Mamá");
      const mamaAccount = await call("manage_account", {
        action: "create",
        workspace_id: mama.id,
        name: "Banorte de mamá",
      });
      const { transactions } = await call("list_transactions", { search: "snack" });
      const moved = await call("update_transaction", {
        action: "move",
        transaction_id: transactions[0].id,
        to_workspace_id: mama.id,
      });
      assert(
        moved.transaction.workspace === "Mamá" && moved.transaction.category === "Comida" &&
          moved.transaction.account === "Banorte de mamá" && moved.transaction.payee === "Oxxo",
        "A moved transaction must reuse or create matching category and payee names.",
      );
      const savings = await call("manage_account", { action: "create", name: "Ahorro" });
      await call("record_transaction", {
        request_id: crypto.randomUUID(),
        kind: "income",
        amount: "50",
        account_id: savings.account.id,
      });
      const movedAccount = await call("manage_account", {
        action: "move",
        account_id: savings.account.id,
        to_workspace_id: mama.id,
      });
      assert(movedAccount.transactions_moved === 1, "An account moves with its transactions.");
      await expectError("manage_account", {
        action: "move",
        account_id: context.accounts[1].id,
        to_workspace_id: mama.id,
      }, "account_has_transfers");
      const mamaContext = await call("get_context", { workspace_id: mama.id });
      assert(
        mamaContext.accounts.length === 2 &&
          mamaContext.accounts[0].id === mamaAccount.account.id,
        "The target keeps its default account and gains the moved one.",
      );
      await expectError("get_context", { workspace_id: crypto.randomUUID() }, "not_found");
    });

    await test.step("Signing out invalidates reuse of the same access token", async () => {
      const signedOut = await client.auth.signOut({ scope: "local" });
      assert(!signedOut.error, "Signing out the disposable account failed.");
      await expectStatus(environment.apiUrl, "/session", 401, { headers });
      assert(!await sessionIsActive(database, identity), "The signed-out session must be absent.");
    });
  } finally {
    const cleanupFailures: string[] = [];
    try {
      const ownerId = userId;
      if (ownerId) {
        await database.begin(async (sql) => {
          const owned = sql`SELECT id FROM finance.workspaces WHERE owner_user_id = ${ownerId}`;
          await sql`DELETE FROM finance.transactions WHERE workspace_id IN (${owned})`;
          await sql`DELETE FROM finance.payees WHERE workspace_id IN (${owned})`;
          await sql`DELETE FROM finance.projects WHERE workspace_id IN (${owned})`;
          await sql`DELETE FROM finance.categories WHERE workspace_id IN (${owned})`;
          await sql`DELETE FROM finance.accounts WHERE workspace_id IN (${owned})`;
          await sql`DELETE FROM finance.workspaces WHERE owner_user_id = ${ownerId}`;
        });
      }
    } catch {
      cleanupFailures.push("local workspace fixtures");
    }
    if (userId) {
      try {
        const deleted = await admin.auth.admin.deleteUser(userId);
        if (deleted.error) cleanupFailures.push("local Auth fixture");
      } catch {
        cleanupFailures.push("local Auth fixture");
      }
    }
    await client.auth.stopAutoRefresh();
    await admin.auth.stopAutoRefresh();
    const connections = await Promise.allSettled([
      database.end({ timeout: 5 }),
      backend.end({ timeout: 5 }),
    ]);
    if (connections.some((connection) => connection.status === "rejected")) {
      cleanupFailures.push("local database connections");
    }
    assert(
      cleanupFailures.length === 0,
      `Integration cleanup failed: ${cleanupFailures.join(", ")}.`,
    );
  }
});
