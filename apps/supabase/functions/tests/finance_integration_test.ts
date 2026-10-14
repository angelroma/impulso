import { createClient } from "@supabase/supabase-js";
import { discoverOAuthServerInfo } from "@modelcontextprotocol/sdk/client/auth.js";
import type { VerifiedIdentity } from "../_shared/auth.ts";
import { createDatabase, type Database, type Transaction } from "../_shared/database.ts";
import { createAccount, createBook, getFinanceContext, recordExpense } from "../_shared/finance.ts";
import {
  validateCreateAccountInput,
  validateCreateBookInput,
  validateFinanceContextInput,
  validateRecordExpenseInput,
} from "../_shared/finance_contracts.ts";
import { ApiError } from "../_shared/http.ts";
import { onboard, validateOnboardingInput } from "../_shared/onboarding.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function requiredEnvironment(name: string): string {
  const value = Deno.env.get(name);
  assert(value, `The local Finance environment is missing ${name}.`);
  return value;
}

function localEnvironment() {
  const api = new URL(requiredEnvironment("SUPABASE_URL"));
  const databaseUrl = requiredEnvironment("SUPABASE_DB_URL");
  const serviceDatabaseUrl = requiredEnvironment("IMPULSO_TEST_DATABASE_URL");
  const database = new URL(databaseUrl);
  const serviceDatabase = new URL(serviceDatabaseUrl);
  const loopback = ["127.0.0.1", "localhost"];
  assert(
    api.protocol === "http:" && loopback.includes(api.hostname) && api.port === "54321" &&
      api.username === "" && api.password === "" && api.pathname === "/" &&
      api.search === "" && api.hash === "" &&
      ["postgres:", "postgresql:"].includes(database.protocol) &&
      loopback.includes(database.hostname) && database.port === "54322" &&
      ["postgres:", "postgresql:"].includes(serviceDatabase.protocol) &&
      loopback.includes(serviceDatabase.hostname) && serviceDatabase.port === "54322" &&
      serviceDatabase.pathname === database.pathname &&
      decodeURIComponent(serviceDatabase.username) === "impulso_backend" &&
      requiredEnvironment("IMPULSO_AUTH_ISSUER") === `${api.origin}/auth/v1`,
    "Finance fixtures may only be created in the local Impulso stack.",
  );
  return {
    apiUrl: api.origin,
    databaseUrl,
    serviceDatabaseUrl,
    anonymousKey: requiredEnvironment("SUPABASE_ANON_KEY"),
    serviceKey: requiredEnvironment("SUPABASE_SERVICE_ROLE_KEY"),
  };
}

function sessionIdentifier(token: string): string {
  const payload = token.split(".")[1].replaceAll("-", "+").replaceAll("_", "/");
  const claims = JSON.parse(atob(payload.padEnd(Math.ceil(payload.length / 4) * 4, "=")));
  assert(typeof claims.session_id === "string", "Local Auth must issue a session identifier.");
  return claims.session_id;
}

function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_")
    .replaceAll("=", "");
}

async function expectApiError(operation: () => Promise<unknown>, status: number, code: string) {
  try {
    await operation();
  } catch (error) {
    assert(
      error instanceof ApiError && error.status === status && error.code === code,
      `The Finance operation must fail with ${status} ${code}; received ${
        error instanceof ApiError ? `${error.status} ${error.code}` : "an uncontrolled failure"
      }.`,
    );
    assert(
      !/SELECT |INSERT |UPDATE |DELETE |postgres(?:ql)?:\/\//i.test(error.message),
      "Controlled errors cannot contain SQL or connection details.",
    );
    return error;
  }
  throw new Error(`The Finance operation unexpectedly succeeded instead of ${status} ${code}.`);
}

async function expectPrivilegeDenied(operation: () => Promise<unknown>) {
  try {
    await operation();
  } catch (error) {
    assert(
      error !== null && typeof error === "object" && "code" in error && error.code === "42501",
      "The limited backend must receive PostgreSQL insufficient_privilege.",
    );
    return;
  }
  throw new Error("The limited backend unexpectedly accepted a forbidden SQL operation.");
}

async function financeCounts(database: Database, workspaceId: string) {
  const [counts] = await database<{
    books: number;
    grants: number;
    accounts: number;
    transactions: number;
    events: number;
    receipts: number;
  }[]>`
    SELECT
      (SELECT count(*)::int FROM finance.books WHERE workspace_id = ${workspaceId}) AS books,
      (SELECT count(*)::int FROM finance.book_access WHERE workspace_id = ${workspaceId}) AS grants,
      (SELECT count(*)::int FROM finance.accounts WHERE workspace_id = ${workspaceId}) AS accounts,
      (SELECT count(*)::int FROM finance.transactions WHERE workspace_id = ${workspaceId})
        AS transactions,
      (SELECT count(*)::int FROM audit.events WHERE workspace_id = ${workspaceId}
        AND module = 'finance') AS events,
      (SELECT count(*)::int FROM private.operation_receipts WHERE workspace_id = ${workspaceId}
        AND operation IN ('create_book', 'create_account', 'create_transaction')) AS receipts
  `;
  return counts;
}

async function assertAction(
  database: Database,
  requestId: string,
  actorId: string,
  workspaceId: string,
  bookId: string,
  resourceId: string,
  operation: string,
  resourceType: string,
) {
  const receipts = await database`
    SELECT actor_user_id, workspace_id, operation, status, resource_ids,
      octet_length(payload_hash) AS hash_length
    FROM private.operation_receipts WHERE request_id = ${requestId}
  `;
  assert(receipts.length === 1, "Each committed action must have one receipt.");
  const receipt = receipts[0];
  assert(
    receipt.actor_user_id === actorId && receipt.workspace_id === workspaceId &&
      receipt.operation === operation && receipt.status === "completed" &&
      receipt.hash_length === 32 && receipt.resource_ids.includes(resourceId),
    "The completed receipt must bind its actor, operation, scope and result.",
  );
  const events = await database`
    SELECT actor_user_id, workspace_id, module, book_id, resource_id, resource_type,
      action, outcome, changed_fields
    FROM audit.events WHERE request_id = ${requestId}
  `;
  assert(events.length === 1, "Each committed Finance action must have one successful audit.");
  const event = events[0];
  assert(
    event.actor_user_id === actorId && event.workspace_id === workspaceId &&
      event.module === "finance" && event.book_id === bookId && event.resource_id === resourceId &&
      event.resource_type === resourceType && event.action === "create" &&
      event.outcome === "success" && Array.isArray(event.changed_fields) &&
      event.changed_fields.every((field: unknown) =>
        typeof field === "string" && /^[a-z][a-z0-9_]*$/.test(field)
      ),
    "The audit must identify the action using field names, not personal descriptions or amounts.",
  );
}

function failBeforeCommit(database: Database) {
  const failure = new Error("Intentional Finance failure after all writes and before commit");
  let completedWrites = false;
  const failing = new Proxy(database, {
    get(target, property, receiver) {
      if (property !== "begin") return Reflect.get(target, property, receiver);
      return (operation: (sql: Transaction) => Promise<unknown>) =>
        target.begin(async (sql) => {
          await operation(sql);
          completedWrites = true;
          throw failure;
        });
    },
  });
  return {
    database: failing,
    async expect(operation: (database: Database) => Promise<unknown>) {
      try {
        await operation(failing);
        throw new Error("The deliberately failing Finance transaction unexpectedly committed.");
      } catch (error) {
        assert(error === failure, "The transaction must propagate its precommit callback failure.");
      }
      assert(completedWrites, "Fault injection must occur after all service writes.");
    },
  };
}

async function waitForLock(database: Database, pid: number) {
  const until = Date.now() + 2_000;
  while (Date.now() < until) {
    const [activity] = await database<{ waiting: boolean }[]>`
      SELECT wait_event_type = 'Lock' AS waiting FROM pg_catalog.pg_stat_activity WHERE pid = ${pid}
    `;
    if (activity?.waiting) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("The lock-order fixture did not reach its expected database lock wait.");
}

Deno.test("Local Finance is exact, independently authorized, atomic and replay-safe", async (test) => {
  // Disposable password sessions exercise SQL services. Real Google/OAuth verification remains
  // covered by the separate protocol suite; these fixtures never claim to prove a Google login.
  const environment = localEnvironment();
  const options = {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  };
  const admin = createClient(environment.apiUrl, environment.serviceKey, options);
  const database = createDatabase(environment.databaseUrl);
  const service = createDatabase(environment.serviceDatabaseUrl);
  const concurrent = createDatabase(environment.serviceDatabaseUrl);
  const contextConnection = createDatabase(environment.serviceDatabaseUrl);
  const blocker = createDatabase(environment.databaseUrl);
  const users: string[] = [];
  const oauthClients: string[] = [];
  const clients: { auth: { stopAutoRefresh(): Promise<void> } }[] = [];

  async function step(name: string, operation: () => Promise<void>) {
    assert(await test.step(name, operation), "The Finance step failed; dependent checks stopped.");
  }

  async function fixture() {
    const client = createClient(environment.apiUrl, environment.anonymousKey, options);
    clients.push(client);
    const email = `finance-${crypto.randomUUID()}@impulso.test.invalid`;
    const password = `${crypto.randomUUID()}aA1!`;
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    assert(!created.error && created.data.user, "The disposable Finance account was not created.");
    const userId = created.data.user.id;
    users.push(userId);
    const signedIn = await client.auth.signInWithPassword({ email, password });
    assert(
      !signedIn.error && signedIn.data.session,
      "The disposable Finance account did not sign in.",
    );
    const identity: VerifiedIdentity = {
      user_id: userId,
      session_id: sessionIdentifier(signedIn.data.session.access_token),
      email,
    };
    const onboardingInput = validateOnboardingInput({
      request_id: crypto.randomUUID(),
      workspace_name: "Finance integration workspace",
      display_name: "Finance integration user",
      timezone: "America/Mexico_City",
    });
    const scope = await onboard(service, identity, onboardingInput);
    return { client, identity, scope, onboardingInput };
  }

  try {
    await step("The backend can select and lock only the intended Finance surface", async () => {
      const [role] = await service<{ name: string; rolsuper: boolean; rolcreaterole: boolean }[]>`
        SELECT current_user AS name, rolsuper, rolcreaterole FROM pg_catalog.pg_roles
        WHERE rolname = current_user
      `;
      assert(
        role.name === "impulso_backend" && !role.rolsuper && !role.rolcreaterole,
        "Finance services must use the restricted backend role.",
      );
      await service`SELECT id FROM finance.books LIMIT 0`;
      await service`SELECT book_id FROM finance.book_access LIMIT 0`;
      await service`SELECT id FROM finance.accounts LIMIT 0`;
      await service`SELECT id FROM finance.transactions LIMIT 0`;
      await service`SELECT id FROM finance.budgets LIMIT 0`;
      await expectPrivilegeDenied(() => service`SELECT id FROM finance.files LIMIT 0`);
      await expectPrivilegeDenied(() => service`SELECT id FROM health.records LIMIT 0`);
      await expectPrivilegeDenied(() =>
        service`UPDATE finance.transactions SET amount = 1 WHERE false`
      );
      await expectPrivilegeDenied(() => service`DELETE FROM finance.accounts WHERE false`);
      await expectPrivilegeDenied(() =>
        service`UPDATE finance.book_access SET role = role WHERE false`
      );
      await expectPrivilegeDenied(() => service`SELECT id FROM audit.events LIMIT 0`);
    });

    const owner = await fixture();
    const outsider = await fixture();
    const workspaceId = owner.scope.workspace_id;
    const personId = owner.scope.person_id;
    const identity = owner.identity;
    const bookInput = validateCreateBookInput({
      request_id: crypto.randomUUID(),
      workspace_id: workspaceId,
      name: "  Gastos diarios  ",
      currency: "MXN",
    });

    await step(
      "Empty context is read-only, scoped and supplies workspace date and verified self",
      async () => {
        const before = await financeCounts(database, workspaceId);
        const context = await getFinanceContext(
          service,
          identity,
          validateFinanceContextInput({ workspace_id: workspaceId }),
        );
        assert(
          context.workspace_id === workspaceId && context.timezone === "America/Mexico_City" &&
            /^\d{4}-\d{2}-\d{2}$/.test(context.current_local_date) &&
            context.self?.person_id === personId && context.can_create_book &&
            context.books.length === 0 && context.accounts.length === 0 &&
            context.selected_book === null && context.next_cursor === null,
          "An empty Finance context must expose selection metadata without creating setup.",
        );
        assert(
          JSON.stringify(before) === JSON.stringify(await financeCounts(database, workspaceId)),
          "Reading context must create no financial rows, receipts or audits.",
        );
        assert(
          !/opening_balance|transactions|payload_hash|actor_user_id/.test(JSON.stringify(context)),
          "Context cannot leak balances, ledger rows or private receipt fields.",
        );
        await expectApiError(
          () => getFinanceContext(service, outsider.identity, { workspace_id: workspaceId }),
          403,
          "workspace_access_denied",
        );
        await expectApiError(
          () =>
            createBook(service, outsider.identity, {
              ...bookInput,
              request_id: crypto.randomUUID(),
            }),
          403,
          "workspace_access_denied",
        );
      },
    );

    const book = await createBook(service, identity, bookInput);
    await step(
      "Book creation atomically includes one owner ACL, canonical result, audit and receipt",
      async () => {
        assert(
          book.status === "created" && book.workspace_id === workspaceId &&
            book.name === "Gastos diarios" && book.currency === "MXN" && book.minor_unit === 2,
          "Books must preserve custom text and derive precision from the supported currency.",
        );
        const grants = await database`
        SELECT user_id, role, revoked_at, version FROM finance.book_access
        WHERE workspace_id = ${workspaceId} AND book_id = ${book.book_id}
      `;
        assert(
          grants.length === 1 && grants[0].user_id === identity.user_id &&
            grants[0].role === "owner" && grants[0].revoked_at === null && grants[0].version === 1,
          "The new book must have exactly its initial active owner grant.",
        );
        await assertAction(
          database,
          bookInput.request_id,
          identity.user_id,
          workspaceId,
          book.book_id,
          book.book_id,
          "create_book",
          "book",
        );
        const replay = await createBook(service, identity, bookInput);
        assert(
          replay.status === "already_processed" && replay.book_id === book.book_id,
          "A book retry must recover its original authorized result.",
        );
        await assertAction(
          database,
          bookInput.request_id,
          identity.user_id,
          workspaceId,
          book.book_id,
          book.book_id,
          "create_book",
          "book",
        );
      },
    );

    const accountInput = validateCreateAccountInput({
      request_id: crypto.randomUUID(),
      workspace_id: workspaceId,
      book_id: book.book_id,
      name: "Cuenta personal",
      currency: "MXN",
      opening_balance: "-12.5",
      person_id: personId,
    });
    const account = await createAccount(service, identity, accountInput);
    await step(
      "Accounts support accepted negative opening balances and self or null attribution",
      async () => {
        assert(
          account.status === "created" && account.account_id && account.book_id === book.book_id &&
            account.currency === "MXN" && account.opening_balance === "-12.50" &&
            account.person_id === personId,
          "The account result must contain its exact canonical accepted values.",
        );
        const replay = await createAccount(service, identity, {
          ...accountInput,
          opening_balance: "-12.50",
        });
        assert(
          replay.status === "already_processed" && replay.account_id === account.account_id,
          "Equivalent valid decimal spelling must preserve request identity.",
        );
        const shared = await createAccount(service, identity, {
          ...accountInput,
          request_id: crypto.randomUUID(),
          name: "Shared account",
          opening_balance: "0",
          person_id: null,
        });
        assert(
          shared.person_id === null && shared.opening_balance === "0.00",
          "A deliberately unassigned account must remain unassigned.",
        );
        await assertAction(
          database,
          accountInput.request_id,
          identity.user_id,
          workspaceId,
          book.book_id,
          account.account_id,
          "create_account",
          "account",
        );
      },
    );

    const expenseInput = validateRecordExpenseInput({
      request_id: crypto.randomUUID(),
      workspace_id: workspaceId,
      book_id: book.book_id,
      source_account_id: account.account_id,
      amount: "100",
      currency: "MXN",
      occurred_on: "2026-10-13",
      description: "  Hamburguesa  ",
      beneficiary_person_id: personId,
    });
    const expense = await recordExpense(service, identity, expenseInput);
    await step(
      "Expense insertion returns canonical values and immutable initial ledger metadata",
      async () => {
        assert(
          expense.status === "created" && expense.transaction_id && expense.amount === "100.00" &&
            expense.currency === "MXN" && expense.occurred_on === "2026-10-13" &&
            expense.description === "Hamburguesa" && expense.beneficiary_person_id === personId &&
            expense.source_account_id === account.account_id,
          "The expense response must describe the committed ledger outcome.",
        );
        const [stored] = await database`
        SELECT kind, amount::text, currency, to_char(occurred_on, 'YYYY-MM-DD') AS occurred_on,
          source_account_id, destination_account_id, replaces_transaction_id, voided_at,
          voided_by_user_id, void_reason, beneficiary_person_id, created_by_user_id,
          updated_by_user_id, version, created_at = updated_at AS same_timestamp
        FROM finance.transactions WHERE id = ${expense.transaction_id}
      `;
        assert(
          stored.kind === "expense" && stored.amount === "100.0000" && stored.currency === "MXN" &&
            stored.occurred_on === expenseInput.occurred_on &&
            stored.source_account_id === account.account_id &&
            stored.destination_account_id === null && stored.replaces_transaction_id === null &&
            stored.voided_at === null && stored.voided_by_user_id === null &&
            stored.void_reason === null &&
            stored.beneficiary_person_id === personId &&
            stored.created_by_user_id === identity.user_id &&
            stored.updated_by_user_id === identity.user_id && stored.version === 1 &&
            stored.same_timestamp,
          "The row must be an expense with source only, verified actors and version-one metadata.",
        );
        const replay = await recordExpense(service, identity, {
          ...expenseInput,
          amount: "100.00",
        });
        assert(
          replay.status === "already_processed" &&
            replay.transaction_id === expense.transaction_id &&
            replay.occurred_on === expenseInput.occurred_on,
          "An expense retry must retain the original resolved date and canonical amount.",
        );
        await assertAction(
          database,
          expenseInput.request_id,
          identity.user_id,
          workspaceId,
          book.book_id,
          expense.transaction_id,
          "create_transaction",
          "transaction",
        );
      },
    );

    await step(
      "Viewer context is readable while fresh mutations and mutation recovery are denied",
      async () => {
        await database`UPDATE finance.book_access SET role = 'viewer'
        WHERE workspace_id = ${workspaceId} AND book_id = ${book.book_id} AND user_id = ${identity.user_id}`;
        try {
          const context = await getFinanceContext(service, identity, {
            workspace_id: workspaceId,
            book_id: book.book_id,
          });
          assert(
            context.selected_book?.role === "viewer" && !context.selected_book.can_create_account &&
              !context.selected_book.can_record_expense && context.accounts.length === 2,
            "A viewer can discover selections without acquiring write authority.",
          );
          for (
            const operation of [
              () => createAccount(service, identity, accountInput),
              () =>
                createAccount(service, identity, {
                  ...accountInput,
                  request_id: crypto.randomUUID(),
                }),
              () => recordExpense(service, identity, expenseInput),
              () =>
                recordExpense(service, identity, {
                  ...expenseInput,
                  request_id: crypto.randomUUID(),
                }),
              () => createBook(service, identity, bookInput),
            ]
          ) await expectApiError(operation, 403, "book_access_denied");
        } finally {
          await database`UPDATE finance.book_access SET role = 'owner'
          WHERE workspace_id = ${workspaceId} AND book_id = ${book.book_id} AND user_id = ${identity.user_id}`;
        }
      },
    );

    await step(
      "Active membership and workspace ownership do not bypass an independent book ACL",
      async () => {
        await database`INSERT INTO core.workspace_members (workspace_id, user_id, role, status, accepted_at)
        VALUES (${workspaceId}, ${outsider.identity.user_id}, 'member', 'active', now())`;
        const noAccess = await getFinanceContext(service, outsider.identity, {
          workspace_id: workspaceId,
        });
        assert(
          noAccess.books.length === 0 && noAccess.can_create_book,
          "Membership permits creating a book, not reading another book.",
        );
        await expectApiError(
          () =>
            getFinanceContext(service, outsider.identity, {
              workspace_id: workspaceId,
              book_id: book.book_id,
            }),
          403,
          "book_access_denied",
        );
        await expectApiError(
          () =>
            recordExpense(service, outsider.identity, {
              ...expenseInput,
              request_id: crypto.randomUUID(),
              beneficiary_person_id: null,
            }),
          403,
          "book_access_denied",
        );
        const privateBook = await createBook(service, outsider.identity, {
          request_id: crypto.randomUUID(),
          workspace_id: workspaceId,
          name: "Private member book",
          currency: "MXN",
        });
        const ownerContext = await getFinanceContext(service, identity, {
          workspace_id: workspaceId,
        });
        assert(
          !ownerContext.books.some((item) => item.id === privateBook.book_id),
          "Workspace owners must not discover a member's independently protected book.",
        );
        await expectApiError(
          () =>
            createAccount(service, identity, {
              ...accountInput,
              request_id: crypto.randomUUID(),
              book_id: privateBook.book_id,
            }),
          403,
          "book_access_denied",
        );
      },
    );

    await step(
      "Editors can write but cross-scope resources and book currency remain enforced",
      async () => {
        await database`INSERT INTO finance.book_access (workspace_id, book_id, user_id, role)
        VALUES (${workspaceId}, ${book.book_id}, ${outsider.identity.user_id}, 'editor')`;
        const editor = await createAccount(service, outsider.identity, {
          ...accountInput,
          request_id: crypto.randomUUID(),
          name: "Editor account",
          person_id: null,
        });
        const written = await recordExpense(service, outsider.identity, {
          ...expenseInput,
          request_id: crypto.randomUUID(),
          source_account_id: editor.account_id,
          beneficiary_person_id: null,
        });
        assert(
          written.beneficiary_person_id === null,
          "An editor may record an explicitly unassigned expense in the granted book.",
        );
        await expectApiError(
          () =>
            createAccount(service, identity, {
              ...accountInput,
              request_id: crypto.randomUUID(),
              currency: "USD",
            }),
          400,
          "invalid_currency",
        );
        await expectApiError(
          () =>
            recordExpense(service, identity, {
              ...expenseInput,
              request_id: crypto.randomUUID(),
              currency: "USD",
            }),
          400,
          "invalid_currency",
        );
        const otherBook = await createBook(service, identity, {
          ...bookInput,
          request_id: crypto.randomUUID(),
          name: "Another book",
        });
        await expectApiError(
          () =>
            recordExpense(service, identity, {
              ...expenseInput,
              request_id: crypto.randomUUID(),
              book_id: otherBook.book_id,
            }),
          403,
          "account_access_denied",
        );
        await expectApiError(
          () =>
            recordExpense(service, outsider.identity, {
              ...expenseInput,
              request_id: crypto.randomUUID(),
              workspace_id: outsider.scope.workspace_id,
              beneficiary_person_id: null,
            }),
          403,
          "book_access_denied",
        );
      },
    );

    await step(
      "Attribution requires the current verified self link, active person and basic ACL",
      async () => {
        const anotherPerson = crypto.randomUUID();
        await database`INSERT INTO core.people (id, workspace_id, display_name)
        VALUES (${anotherPerson}, ${workspaceId}, 'Managed person fixture')`;
        for (const invalidPerson of [anotherPerson, outsider.scope.person_id]) {
          await expectApiError(
            () =>
              createAccount(service, identity, {
                ...accountInput,
                request_id: crypto.randomUUID(),
                person_id: invalidPerson,
              }),
            403,
            "person_access_denied",
          );
          await expectApiError(
            () =>
              recordExpense(service, identity, {
                ...expenseInput,
                request_id: crypto.randomUUID(),
                beneficiary_person_id: invalidPerson,
              }),
            403,
            "person_access_denied",
          );
        }
        await database`UPDATE core.person_access SET revoked_at = now()
        WHERE workspace_id = ${workspaceId} AND person_id = ${personId} AND user_id = ${identity.user_id}`;
        try {
          const context = await getFinanceContext(service, identity, { workspace_id: workspaceId });
          assert(context.self === null, "Revoked basic-person access must remove the self choice.");
          await expectApiError(
            () => recordExpense(service, identity, expenseInput),
            403,
            "person_access_denied",
          );
          const shared = await recordExpense(service, identity, {
            ...expenseInput,
            request_id: crypto.randomUUID(),
            beneficiary_person_id: null,
          });
          assert(
            shared.beneficiary_person_id === null,
            "Explicit null attribution must not require a person grant or silently attach self.",
          );
        } finally {
          await database`UPDATE core.person_access SET revoked_at = NULL
          WHERE workspace_id = ${workspaceId} AND person_id = ${personId} AND user_id = ${identity.user_id}`;
        }
        await database`DELETE FROM core.person_user_links
        WHERE workspace_id = ${workspaceId} AND person_id = ${personId}`;
        try {
          await expectApiError(
            () =>
              createAccount(service, identity, {
                ...accountInput,
                request_id: crypto.randomUUID(),
              }),
            403,
            "person_access_denied",
          );
        } finally {
          await database`INSERT INTO core.person_user_links (workspace_id, person_id, user_id, verification_method)
          VALUES (${workspaceId}, ${personId}, ${identity.user_id}, 'self_registration')`;
        }
      },
    );

    await step("Archived scopes block creation and successful receipt recovery", async () => {
      const cases = [
        {
          set: () =>
            database`UPDATE core.workspaces SET archived_at = now() WHERE id = ${workspaceId}`,
          clear: () =>
            database`UPDATE core.workspaces SET archived_at = NULL WHERE id = ${workspaceId}`,
          code: "workspace_archived",
          operation: () => createBook(service, identity, bookInput),
          fresh: () =>
            createBook(service, identity, { ...bookInput, request_id: crypto.randomUUID() }),
        },
        {
          set: () =>
            database`UPDATE finance.books SET archived_at = now() WHERE id = ${book.book_id}`,
          clear: () =>
            database`UPDATE finance.books SET archived_at = NULL WHERE id = ${book.book_id}`,
          code: "book_archived",
          operation: () => createAccount(service, identity, accountInput),
          fresh: () =>
            createAccount(service, identity, { ...accountInput, request_id: crypto.randomUUID() }),
        },
        {
          set: () =>
            database`UPDATE finance.accounts SET archived_at = now() WHERE id = ${account.account_id}`,
          clear: () =>
            database`UPDATE finance.accounts SET archived_at = NULL WHERE id = ${account.account_id}`,
          code: "account_archived",
          operation: () => recordExpense(service, identity, expenseInput),
          fresh: () =>
            recordExpense(service, identity, { ...expenseInput, request_id: crypto.randomUUID() }),
        },
        {
          set: () => database`UPDATE core.people SET archived_at = now() WHERE id = ${personId}`,
          clear: () => database`UPDATE core.people SET archived_at = NULL WHERE id = ${personId}`,
          code: "person_archived",
          operation: () => recordExpense(service, identity, expenseInput),
          fresh: () =>
            recordExpense(service, identity, { ...expenseInput, request_id: crypto.randomUUID() }),
        },
      ];
      for (const entry of cases) {
        await entry.set();
        try {
          await expectApiError(entry.operation, 409, entry.code);
          await expectApiError(entry.fresh, 409, entry.code);
        } finally {
          await entry.clear();
        }
      }
    });

    await step(
      "All confirmed purge stages, including a failed purge, block their applicable scope",
      async () => {
        const before = await financeCounts(database, workspaceId);
        for (const scope of ["workspace", "book", "person"] as const) {
          const purgeId = crypto.randomUUID();
          await database`INSERT INTO private.purge_requests
          (id, workspace_id, scope, person_id, book_id, requested_by_user_id,
            state, manifest, manifest_hash, confirmed_at)
          VALUES (${purgeId}, ${workspaceId}, ${scope}, ${scope === "person" ? personId : null},
            ${scope === "book" ? book.book_id : null}, ${identity.user_id}, 'approved',
            '{}'::jsonb, decode(repeat('00', 32), 'hex'), now())`;
          try {
            for (
              const state of ["approved", "deleting_files", "deleting_rows", "completed", "failed"]
            ) {
              await database`UPDATE private.purge_requests SET state = ${state} WHERE id = ${purgeId}`;
              const code = state === "completed" ? "action_retired" : "scope_purge_pending";
              await expectApiError(() => recordExpense(service, identity, expenseInput), 409, code);
              await expectApiError(
                () =>
                  recordExpense(service, identity, {
                    ...expenseInput,
                    request_id: crypto.randomUUID(),
                  }),
                409,
                code,
              );
              if (scope === "workspace") {
                await expectApiError(
                  () =>
                    createBook(service, identity, {
                      ...bookInput,
                      request_id: crypto.randomUUID(),
                    }),
                  409,
                  code,
                );
              }
            }
          } finally {
            await database`DELETE FROM private.purge_requests WHERE id = ${purgeId}`;
          }
        }
        assert(
          JSON.stringify(before) === JSON.stringify(await financeCounts(database, workspaceId)),
          "Blocked purge states must neither recreate resources nor add success receipts or audits.",
        );
      },
    );

    await step(
      "Each mutation rolls its resources, owner ACL, audit and receipt back after a late failure",
      async () => {
        const before = await financeCounts(database, workspaceId);
        const bookFailure = failBeforeCommit(service);
        await bookFailure.expect((connection) =>
          createBook(connection, identity, {
            ...bookInput,
            request_id: crypto.randomUUID(),
            name: "Must roll back",
          })
        );
        const accountFailure = failBeforeCommit(service);
        await accountFailure.expect((connection) =>
          createAccount(connection, identity, {
            ...accountInput,
            request_id: crypto.randomUUID(),
            name: "Must roll back",
          })
        );
        const expenseFailure = failBeforeCommit(service);
        await expenseFailure.expect((connection) =>
          recordExpense(connection, identity, {
            ...expenseInput,
            request_id: crypto.randomUUID(),
            description: "Must roll back",
          })
        );
        assert(
          JSON.stringify(before) === JSON.stringify(await financeCounts(database, workspaceId)),
          "A failed transaction must leave no resource, owner grant, audit or completed receipt.",
        );
      },
    );

    await step(
      "Simultaneous identical request keys converge for books, accounts and expenses",
      async () => {
        const concurrentBookInput = {
          ...bookInput,
          request_id: crypto.randomUUID(),
          name: "Concurrent book",
        };
        const books = await Promise.all([
          createBook(service, identity, concurrentBookInput),
          createBook(concurrent, identity, concurrentBookInput),
        ]);
        assert(
          books[0].book_id === books[1].book_id &&
            books.filter((item) => item.status === "created").length === 1,
          "Identical concurrent book calls must create exactly one book.",
        );
        await assertAction(
          database,
          concurrentBookInput.request_id,
          identity.user_id,
          workspaceId,
          books[0].book_id,
          books[0].book_id,
          "create_book",
          "book",
        );
        const concurrentAccountInput = { ...accountInput, request_id: crypto.randomUUID() };
        const accounts = await Promise.all([
          createAccount(service, identity, concurrentAccountInput),
          createAccount(concurrent, identity, concurrentAccountInput),
        ]);
        assert(
          accounts[0].account_id === accounts[1].account_id &&
            accounts.filter((item) => item.status === "created").length === 1,
          "Identical concurrent account calls must create exactly one account.",
        );
        await assertAction(
          database,
          concurrentAccountInput.request_id,
          identity.user_id,
          workspaceId,
          book.book_id,
          accounts[0].account_id,
          "create_account",
          "account",
        );
        const concurrentExpenseInput = { ...expenseInput, request_id: crypto.randomUUID() };
        const expenses = await Promise.all([
          recordExpense(service, identity, concurrentExpenseInput),
          recordExpense(concurrent, identity, concurrentExpenseInput),
        ]);
        assert(
          expenses[0].transaction_id === expenses[1].transaction_id &&
            expenses.filter((item) => item.status === "created").length === 1,
          "Identical concurrent expense calls must create exactly one expense.",
        );
        await assertAction(
          database,
          concurrentExpenseInput.request_id,
          identity.user_id,
          workspaceId,
          book.book_id,
          expenses[0].transaction_id,
          "create_transaction",
          "transaction",
        );
      },
    );

    await step(
      "Distinct accepted keys remain distinct even when every semantic value is equal",
      async () => {
        const books = await Promise.all([
          createBook(service, identity, { ...bookInput, request_id: crypto.randomUUID() }),
          createBook(concurrent, identity, { ...bookInput, request_id: crypto.randomUUID() }),
        ]);
        const accounts = await Promise.all([
          createAccount(service, identity, { ...accountInput, request_id: crypto.randomUUID() }),
          createAccount(concurrent, identity, { ...accountInput, request_id: crypto.randomUUID() }),
        ]);
        const expenses = await Promise.all([
          recordExpense(service, identity, { ...expenseInput, request_id: crypto.randomUUID() }),
          recordExpense(concurrent, identity, { ...expenseInput, request_id: crypto.randomUUID() }),
        ]);
        assert(
          books[0].book_id !== books[1].book_id &&
            accounts[0].account_id !== accounts[1].account_id &&
            expenses[0].transaction_id !== expenses[1].transaction_id &&
            [...books, ...accounts, ...expenses].every((item) => item.status === "created"),
          "Receipt identity must not impose semantic uniqueness on names, accounts or repeated purchases.",
        );
      },
    );

    await step(
      "Supported zero-, three- and four-place currencies retain exact money and early calendar dates",
      async () => {
        const cases = [
          { currency: "JPY", unit: 0, opening: "-2", amount: "1", date: "0001-01-01" },
          { currency: "BHD", unit: 3, opening: "-2.345", amount: "1.234", date: "0099-12-31" },
          { currency: "CLF", unit: 4, opening: "-2.3456", amount: "1.2345", date: "2028-02-29" },
        ];
        for (const entry of cases) {
          const preciseBook = await createBook(service, identity, {
            ...bookInput,
            request_id: crypto.randomUUID(),
            currency: entry.currency,
          });
          assert(
            preciseBook.minor_unit === entry.unit,
            "The server must derive each supported currency's exact precision.",
          );
          const preciseAccount = await createAccount(service, identity, {
            ...accountInput,
            request_id: crypto.randomUUID(),
            book_id: preciseBook.book_id,
            currency: entry.currency,
            opening_balance: entry.opening,
            person_id: null,
          });
          assert(
            preciseAccount.opening_balance === entry.opening,
            "Accepted precision and a negative starting balance must survive PostgreSQL exactly.",
          );
          const preciseInput = {
            ...expenseInput,
            request_id: crypto.randomUUID(),
            book_id: preciseBook.book_id,
            source_account_id: preciseAccount.account_id,
            currency: entry.currency,
            amount: entry.amount,
            occurred_on: entry.date,
            beneficiary_person_id: null,
          };
          const precise = await recordExpense(service, identity, preciseInput);
          const replay = await recordExpense(service, identity, preciseInput);
          assert(
            precise.amount === entry.amount && precise.occurred_on === entry.date &&
              replay.status === "already_processed" &&
              replay.transaction_id === precise.transaction_id &&
              replay.occurred_on === entry.date,
            "Exact currency amounts and full four-digit years must remain stable through creation and replay.",
          );
          await expectApiError(
            () =>
              recordExpense(service, identity, {
                ...preciseInput,
                request_id: crypto.randomUUID(),
                amount: `${entry.amount}${entry.unit === 0 ? ".0" : "0"}`,
              }),
            400,
            "invalid_amount",
          );
        }
      },
    );

    await step(
      "Global request conflicts reveal no earlier actor, operation, workspace or result",
      async () => {
        const before = await financeCounts(database, workspaceId);
        const conflicts = [
          () => createBook(service, outsider.identity, bookInput),
          () =>
            createAccount(service, identity, { ...accountInput, request_id: bookInput.request_id }),
          () =>
            createBook(service, identity, {
              ...bookInput,
              workspace_id: outsider.scope.workspace_id,
            }),
          () => createBook(service, identity, { ...bookInput, name: "Changed book" }),
          () => createAccount(service, identity, { ...accountInput, opening_balance: "-12.51" }),
          () => recordExpense(service, identity, { ...expenseInput, amount: "101" }),
          () => recordExpense(service, identity, { ...expenseInput, occurred_on: "2026-10-14" }),
          () => recordExpense(service, identity, { ...expenseInput, beneficiary_person_id: null }),
        ];
        const messages = [];
        for (const conflict of conflicts) {
          const error = await expectApiError(conflict, 409, "request_conflict");
          messages.push(error.message);
          for (
            const secret of [
              book.book_id,
              account.account_id,
              expense.transaction_id,
              identity.user_id,
            ]
          ) {
            assert(
              !error.message.includes(secret),
              "A request conflict cannot disclose original result IDs.",
            );
          }
        }
        assert(
          new Set(messages).size === 1,
          "All global request conflicts must have one generic message.",
        );
        assert(
          JSON.stringify(before) === JSON.stringify(await financeCounts(database, workspaceId)),
          "Conflicting requests must leave no new resources or success records.",
        );
      },
    );

    await step(
      "Revocation and membership loss deny recovery under current authorization",
      async () => {
        await database`UPDATE finance.book_access SET revoked_at = now()
        WHERE workspace_id = ${workspaceId} AND book_id = ${book.book_id} AND user_id = ${identity.user_id}`;
        try {
          const context = await getFinanceContext(service, identity, { workspace_id: workspaceId });
          assert(
            !context.books.some((item) => item.id === book.book_id),
            "Revoked book access must remove the book from discovery.",
          );
          await expectApiError(
            () => recordExpense(service, identity, expenseInput),
            403,
            "book_access_denied",
          );
        } finally {
          await database`UPDATE finance.book_access SET revoked_at = NULL
          WHERE workspace_id = ${workspaceId} AND book_id = ${book.book_id} AND user_id = ${identity.user_id}`;
        }
        await database`UPDATE core.workspace_members SET status = 'revoked', revoked_at = now()
        WHERE workspace_id = ${workspaceId} AND user_id = ${identity.user_id}`;
        try {
          await expectApiError(
            () => createAccount(service, identity, accountInput),
            403,
            "workspace_access_denied",
          );
        } finally {
          await database`UPDATE core.workspace_members SET status = 'active', revoked_at = NULL
          WHERE workspace_id = ${workspaceId} AND user_id = ${identity.user_id}`;
        }
      },
    );

    await step(
      "Retired receipts are rejected before resolving resources and cannot be reused across actors",
      async () => {
        const requestId = crypto.randomUUID();
        await database`INSERT INTO private.operation_receipts (request_id, actor_user_id, workspace_id, operation, status)
        VALUES (${requestId}, ${identity.user_id}, ${workspaceId}, 'create_transaction', 'purged')`;
        const missing = {
          ...expenseInput,
          request_id: requestId,
          book_id: crypto.randomUUID(),
          source_account_id: crypto.randomUUID(),
        };
        await expectApiError(
          () => recordExpense(service, identity, missing),
          409,
          "action_retired",
        );
        await expectApiError(
          () => recordExpense(service, outsider.identity, missing),
          409,
          "request_conflict",
        );
        await expectApiError(
          () => createBook(service, identity, { ...bookInput, request_id: requestId }),
          409,
          "request_conflict",
        );
        const bookRequest = crypto.randomUUID();
        const accountRequest = crypto.randomUUID();
        await database`INSERT INTO private.operation_receipts (request_id, actor_user_id, workspace_id, operation, status)
          VALUES (${bookRequest}, ${identity.user_id}, ${workspaceId}, 'create_book', 'purged'),
            (${accountRequest}, ${identity.user_id}, ${workspaceId}, 'create_account', 'purged')`;
        await expectApiError(
          () =>
            createBook(service, identity, {
              ...bookInput,
              request_id: bookRequest,
              workspace_id: crypto.randomUUID(),
            }),
          409,
          "action_retired",
        );
        await expectApiError(
          () =>
            createAccount(service, identity, {
              ...accountInput,
              request_id: accountRequest,
              book_id: crypto.randomUUID(),
            }),
          409,
          "action_retired",
        );
      },
    );

    await step(
      "Fixed keyset pages expose all authorized choices without ledger or opening balances",
      async () => {
        const paged = await fixture();
        const pagedWorkspace = paged.scope.workspace_id;
        await database`INSERT INTO finance.books (workspace_id, name, currency, minor_unit)
        SELECT ${pagedWorkspace}, 'Repeated choice', 'MXN', 2 FROM generate_series(1, 51)`;
        await database`INSERT INTO finance.book_access (workspace_id, book_id, user_id, role)
        SELECT workspace_id, id, ${paged.identity.user_id}, 'owner' FROM finance.books
        WHERE workspace_id = ${pagedWorkspace}`;
        const first = await getFinanceContext(service, paged.identity, {
          workspace_id: pagedWorkspace,
        });
        assert(
          first.books.length === 50 && first.next_cursor !== null,
          "A full page must include a continuation rather than imply a complete or unique result.",
        );
        const second = await getFinanceContext(service, paged.identity, {
          workspace_id: pagedWorkspace,
          cursor: first.next_cursor!,
        });
        assert(
          second.books.length === 1 && second.next_cursor === null &&
            new Set([...first.books, ...second.books].map((item) => item.id)).size === 51,
          `Stable book continuation requires 50/1 distinct rows; received ${first.books.length}/${second.books.length}, ${
            new Set([...first.books, ...second.books].map((item) => item.id)).size
          } distinct rows.`,
        );
        await expectApiError(
          () =>
            getFinanceContext(service, identity, {
              workspace_id: workspaceId,
              cursor: first.next_cursor!,
            }),
          400,
          "invalid_cursor",
        );
        const pagedBook = first.books[0].id;
        await database`INSERT INTO finance.accounts (workspace_id, book_id, currency, name, opening_balance)
        SELECT ${pagedWorkspace}, ${pagedBook}, 'MXN', 'Repeated account', 0 FROM generate_series(1, 51)`;
        const accounts = await getFinanceContext(service, paged.identity, {
          workspace_id: pagedWorkspace,
          book_id: pagedBook,
        });
        assert(
          accounts.books.length === 0 && accounts.accounts.length === 50 &&
            accounts.next_cursor !== null &&
            accounts.selected_book?.id === pagedBook && accounts.selected_book.can_record_expense,
          "Selected-book context must contain bounded account choices and current write rights.",
        );
        const last = await getFinanceContext(service, paged.identity, {
          workspace_id: pagedWorkspace,
          book_id: pagedBook,
          cursor: accounts.next_cursor!,
        });
        assert(
          last.accounts.length === 1 && last.next_cursor === null &&
            new Set([...accounts.accounts, ...last.accounts].map((item) => item.id)).size === 51,
          "Account continuation must be stable and complete.",
        );
        await expectApiError(
          () =>
            getFinanceContext(service, paged.identity, {
              workspace_id: pagedWorkspace,
              book_id: pagedBook,
              cursor: first.next_cursor!,
            }),
          400,
          "invalid_cursor",
        );
        await expectApiError(
          () =>
            getFinanceContext(service, paged.identity, {
              workspace_id: pagedWorkspace,
              book_id: first.books[1].id,
              cursor: accounts.next_cursor!,
            }),
          400,
          "invalid_cursor",
        );
        assert(
          !/opening_balance|transactions|payload_hash|actor_user_id/.test(JSON.stringify(accounts)),
          "Selection summaries cannot include balance, ledger or private receipt data.",
        );
        const counts = await financeCounts(database, pagedWorkspace);
        assert(
          counts.events === 0 && counts.receipts === 0 && counts.transactions === 0,
          "Paged reads must not create actions or ledger history.",
        );
      },
    );

    await step(
      "Finance, onboarding and context share request-before-workspace lock order",
      async () => {
        const requestId = crypto.randomUUID();
        const [{ pid: servicePid }] = await service<
          { pid: number }[]
        >`SELECT pg_backend_pid() AS pid`;
        const [{ pid: concurrentPid }] = await concurrent<
          { pid: number }[]
        >`SELECT pg_backend_pid() AS pid`;
        let release!: () => void;
        let acquired!: () => void;
        const locked = new Promise<void>((resolve) => {
          acquired = resolve;
        });
        const unlocked = new Promise<void>((resolve) => {
          release = resolve;
        });
        const holding = blocker.begin(async (sql) => {
          await sql`SELECT id FROM core.workspaces WHERE id = ${workspaceId} FOR UPDATE`;
          acquired();
          await unlocked;
        });
        await locked;
        const creation = createBook(service, identity, { ...bookInput, request_id: requestId });
        const heldOutcomes = Promise.allSettled([holding, creation]);
        let retry: Promise<unknown> | undefined;
        let context: Promise<unknown> | undefined;
        let coordinationFailure: unknown;
        try {
          await waitForLock(database, servicePid);
          retry = expectApiError(
            () =>
              onboard(concurrent, identity, { ...owner.onboardingInput, request_id: requestId }),
            409,
            "request_conflict",
          );
          await waitForLock(database, concurrentPid);
          context = getFinanceContext(contextConnection, identity, { workspace_id: workspaceId });
        } catch (error) {
          coordinationFailure = error;
        } finally {
          release();
        }
        const results = [...await heldOutcomes, ...await Promise.allSettled([retry, context])];
        if (coordinationFailure) throw coordinationFailure;
        assert(
          results.every((result) => result.status === "fulfilled"),
          "Competing Finance, onboarding and context must finish without deadlock or raw lock errors.",
        );
        const result = await creation;
        assert(
          result.status === "created",
          "Finance must commit before the conflicting onboarding retry.",
        );
      },
    );

    await step(
      "Delegated consent revoked during a workspace lock wait denies reads and writes",
      async () => {
        const resource = `${environment.apiUrl}/functions/v1/impulso-api/mcp`;
        const discovery = await discoverOAuthServerInfo(resource, {
          resourceMetadataUrl: new URL(
            `${environment.apiUrl}/functions/v1/impulso-api/.well-known/oauth-protected-resource`,
          ),
          fetchFn: (input: string | URL | Request, init?: RequestInit) => {
            const url = new URL(input instanceof Request ? input.url : String(input));
            assert(
              new URL(url.toString()).origin === environment.apiUrl,
              "The delegated Finance fixture cannot leave the local Supabase origin.",
            );
            return fetch(input, { ...init, signal: AbortSignal.timeout(15_000) });
          },
        });
        const server = discovery.authorizationServerMetadata;
        assert(
          server?.registration_endpoint && server.authorization_endpoint && server.token_endpoint,
          "The local OAuth server must advertise registration, authorization and token endpoints.",
        );
        const redirectUri = "http://127.0.0.1:39877/oauth/callback";
        const registration = await fetch(server.registration_endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: environment.anonymousKey },
          body: JSON.stringify({
            client_name: `Impulso Finance revocation ${crypto.randomUUID()}`,
            redirect_uris: [redirectUri],
            grant_types: ["authorization_code", "refresh_token"],
            response_types: ["code"],
            token_endpoint_auth_method: "none",
            client_type: "public",
          }),
          signal: AbortSignal.timeout(15_000),
        });
        const registered = await registration.json();
        assert(
          registration.status === 201 && typeof registered.client_id === "string",
          "The disposable delegated Finance client must register locally.",
        );
        const clientId = registered.client_id as string;
        oauthClients.push(clientId);
        const verifier = base64url(crypto.getRandomValues(new Uint8Array(48)));
        const challenge = base64url(
          new Uint8Array(
            await crypto.subtle.digest(
              "SHA-256",
              new TextEncoder().encode(verifier),
            ),
          ),
        );
        const state = crypto.randomUUID();
        const authorizationUrl = new URL(server.authorization_endpoint);
        authorizationUrl.search = new URLSearchParams({
          client_id: clientId,
          redirect_uri: redirectUri,
          response_type: "code",
          scope: "openid email profile",
          state,
          code_challenge: challenge,
          code_challenge_method: "S256",
          resource,
        }).toString();
        const authorization = await fetch(authorizationUrl, {
          redirect: "manual",
          signal: AbortSignal.timeout(15_000),
        });
        await authorization.arrayBuffer();
        const location = authorization.headers.get("location");
        assert(
          [302, 303].includes(authorization.status) && location,
          "Native Auth must redirect the disposable Finance authorization to consent.",
        );
        const consentUrl = new URL(location);
        assert(
          consentUrl.origin === environment.apiUrl,
          "The consent fixture must remain on the local Supabase origin.",
        );
        const authorizationId = consentUrl.searchParams.get("authorization_id");
        assert(authorizationId, "Native Auth must issue a consent authorization identifier.");
        const details = await owner.client.auth.oauth.getAuthorizationDetails(authorizationId);
        assert(
          !details.error && details.data,
          "The disposable user must inspect native OAuth consent.",
        );
        let redirect: string;
        if ("redirect_url" in details.data) {
          redirect = details.data.redirect_url;
        } else {
          assert(
            details.data.client.id === clientId && details.data.user.id === identity.user_id,
            "Consent must bind the expected disposable user and client.",
          );
          const approved = await owner.client.auth.oauth.approveAuthorization(authorizationId, {
            skipBrowserRedirect: true,
          });
          assert(
            !approved.error && approved.data,
            "The disposable user must approve the local test grant.",
          );
          redirect = approved.data.redirect_url;
        }
        const callback = new URL(redirect);
        const code = callback.searchParams.get("code");
        assert(
          `${callback.origin}${callback.pathname}` === redirectUri &&
            callback.searchParams.get("state") === state && code,
          "The native authorization must preserve its registered callback and state.",
        );
        const exchanged = await fetch(server.token_endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            apikey: environment.anonymousKey,
          },
          body: new URLSearchParams({
            grant_type: "authorization_code",
            client_id: clientId,
            code,
            redirect_uri: redirectUri,
            code_verifier: verifier,
            resource,
          }),
          signal: AbortSignal.timeout(15_000),
        });
        const tokens = await exchanged.json();
        assert(
          exchanged.status === 200 && typeof tokens.access_token === "string",
          "The disposable native OAuth flow must issue a delegated session.",
        );
        const delegated: VerifiedIdentity = {
          ...identity,
          session_id: sessionIdentifier(tokens.access_token),
          oauth_client_id: clientId,
          oauth_scopes: ["openid", "email", "profile"],
        };
        await getFinanceContext(service, delegated, { workspace_id: workspaceId });
        const before = await financeCounts(database, workspaceId);
        const [{ pid: servicePid }] = await service<
          { pid: number }[]
        >`SELECT pg_backend_pid() AS pid`;
        const [{ pid: concurrentPid }] = await concurrent<
          { pid: number }[]
        >`SELECT pg_backend_pid() AS pid`;
        let acquired!: () => void;
        let release!: () => void;
        const locked = new Promise<void>((resolve) => {
          acquired = resolve;
        });
        const unlocked = new Promise<void>((resolve) => {
          release = resolve;
        });
        const holding = blocker.begin(async (sql) => {
          await sql`SELECT id FROM core.workspaces WHERE id = ${workspaceId} FOR UPDATE`;
          acquired();
          await unlocked;
        });
        await locked;
        const deniedWrite = expectApiError(
          () =>
            createAccount(service, delegated, {
              ...accountInput,
              request_id: crypto.randomUUID(),
              person_id: null,
            }),
          401,
          "invalid_session",
        );
        const deniedRead = expectApiError(
          () => getFinanceContext(concurrent, delegated, { workspace_id: workspaceId }),
          401,
          "invalid_session",
        );
        const outcomes = Promise.allSettled([holding, deniedWrite, deniedRead]);
        let coordinationFailure: unknown;
        try {
          await waitForLock(database, servicePid);
          await waitForLock(database, concurrentPid);
          const revoked = await database`UPDATE auth.oauth_consents SET revoked_at = now()
          WHERE user_id = ${identity.user_id} AND client_id = ${clientId} AND revoked_at IS NULL
          RETURNING user_id`;
          assert(
            revoked.length === 1,
            "The live delegated consent must be revoked while both calls wait for the workspace.",
          );
        } catch (error) {
          coordinationFailure = error;
        } finally {
          release();
        }
        const results = await outcomes;
        if (coordinationFailure) throw coordinationFailure;
        assert(
          results.every((result) => result.status === "fulfilled"),
          "Both waiting Finance calls must recheck the revoked consent and return invalid_session.",
        );
        assert(
          JSON.stringify(before) === JSON.stringify(await financeCounts(database, workspaceId)),
          "Revocation during a wait must leave no Finance row, receipt or success audit.",
        );
      },
    );

    await step("A signed-out session loses context and receipt recovery immediately", async () => {
      const signedOut = await owner.client.auth.signOut({ scope: "local" });
      assert(!signedOut.error, "The disposable Finance session could not be revoked.");
      await expectApiError(
        () => getFinanceContext(service, identity, { workspace_id: workspaceId }),
        401,
        "invalid_session",
      );
      await expectApiError(
        () => recordExpense(service, identity, expenseInput),
        401,
        "invalid_session",
      );
    });
  } finally {
    const cleanupFailures: string[] = [];
    try {
      if (users.length > 0) {
        await database.begin(async (sql) => {
          const scopes = await sql<{ id: string }[]>`
            SELECT id FROM core.workspaces WHERE created_by_user_id = ANY(${sql.array(users, 2950)})
          `;
          const workspaceIds = scopes.map((scope) => scope.id);
          await sql`DELETE FROM audit.events WHERE actor_user_id = ANY(${sql.array(users, 2950)})`;
          await sql`DELETE FROM private.operation_receipts WHERE actor_user_id = ANY(${
            sql.array(users, 2950)
          })`;
          await sql`DELETE FROM private.purge_requests WHERE requested_by_user_id = ANY(${
            sql.array(users, 2950)
          })`;
          if (workspaceIds.length > 0) {
            await sql`DELETE FROM finance.transactions WHERE workspace_id = ANY(${
              sql.array(workspaceIds, 2950)
            })`;
            await sql`DELETE FROM finance.accounts WHERE workspace_id = ANY(${
              sql.array(workspaceIds, 2950)
            })`;
            await sql`DELETE FROM finance.book_access WHERE workspace_id = ANY(${
              sql.array(workspaceIds, 2950)
            })`;
            await sql`DELETE FROM finance.books WHERE workspace_id = ANY(${
              sql.array(workspaceIds, 2950)
            })`;
            await sql`DELETE FROM core.person_aliases WHERE workspace_id = ANY(${
              sql.array(workspaceIds, 2950)
            })`;
            await sql`DELETE FROM core.person_access WHERE workspace_id = ANY(${
              sql.array(workspaceIds, 2950)
            })`;
            await sql`DELETE FROM core.person_user_links WHERE workspace_id = ANY(${
              sql.array(workspaceIds, 2950)
            })`;
            await sql`DELETE FROM core.people WHERE workspace_id = ANY(${
              sql.array(workspaceIds, 2950)
            })`;
            await sql`DELETE FROM core.workspace_members WHERE workspace_id = ANY(${
              sql.array(workspaceIds, 2950)
            })`;
            await sql`DELETE FROM core.workspaces WHERE id = ANY(${sql.array(workspaceIds, 2950)})`;
            const [leftovers] = await sql<{ count: number }[]>`
              SELECT (SELECT count(*) FROM finance.transactions
                WHERE workspace_id = ANY(${sql.array(workspaceIds, 2950)}))::int +
                (SELECT count(*) FROM core.workspaces WHERE id = ANY(${
              sql.array(workspaceIds, 2950)
            }))::int AS count
            `;
            assert(
              leftovers.count === 0,
              "Disposable Finance resources must be completely removed.",
            );
          }
        });
      }
    } catch {
      cleanupFailures.push("Finance database fixtures");
    }
    for (const userId of users) {
      try {
        const deleted = await admin.auth.admin.deleteUser(userId);
        if (deleted.error) cleanupFailures.push("Finance Auth fixture");
      } catch {
        cleanupFailures.push("Finance Auth fixture");
      }
    }
    for (const clientId of oauthClients) {
      try {
        const deleted = await admin.auth.admin.oauth.deleteClient(clientId);
        if (deleted.error) cleanupFailures.push("Finance OAuth client");
      } catch {
        cleanupFailures.push("Finance OAuth client");
      }
    }
    try {
      if (oauthClients.length > 0) {
        await database.begin(async (sql) => {
          await sql`DELETE FROM auth.oauth_authorizations WHERE client_id = ANY(${
            sql.array(oauthClients, 2950)
          })`;
          await sql`DELETE FROM auth.oauth_consents WHERE client_id = ANY(${
            sql.array(oauthClients, 2950)
          })`;
          await sql`DELETE FROM auth.oauth_clients WHERE id = ANY(${
            sql.array(oauthClients, 2950)
          })`;
        });
      }
    } catch {
      cleanupFailures.push("Finance OAuth records");
    }
    for (const client of [...clients, admin]) await client.auth.stopAutoRefresh();
    const closed = await Promise.allSettled([
      database.end({ timeout: 5 }),
      service.end({ timeout: 5 }),
      concurrent.end({ timeout: 5 }),
      contextConnection.end({ timeout: 5 }),
      blocker.end({ timeout: 5 }),
    ]);
    if (closed.some((result) => result.status === "rejected")) {
      cleanupFailures.push("Finance connections");
    }
    assert(cleanupFailures.length === 0, `Finance cleanup failed: ${cleanupFailures.join(", ")}.`);
  }
});
