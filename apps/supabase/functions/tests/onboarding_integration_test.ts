import { createClient } from "@supabase/supabase-js";
import type { VerifiedIdentity } from "../_shared/auth.ts";
import { createDatabase, type Database, type Transaction } from "../_shared/database.ts";
import { ApiError } from "../_shared/http.ts";
import { onboard, validateOnboardingInput } from "../_shared/onboarding.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function requiredEnvironment(name: string): string {
  const value = Deno.env.get(name);
  assert(value, `The local onboarding environment is missing ${name}.`);
  return value;
}

function localEnvironment() {
  const api = new URL(requiredEnvironment("SUPABASE_URL"));
  const databaseUrl = requiredEnvironment("SUPABASE_DB_URL");
  const database = new URL(databaseUrl);
  const serviceDatabaseUrl = requiredEnvironment("IMPULSO_TEST_DATABASE_URL");
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
    "Onboarding fixtures may only be created in the local Impulso stack.",
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
  const padded = payload.padEnd(Math.ceil(payload.length / 4) * 4, "=");
  const claims = JSON.parse(atob(padded));
  assert(typeof claims.session_id === "string", "Local Auth must issue a session identifier.");
  return claims.session_id;
}

function input(requestId = crypto.randomUUID()) {
  return validateOnboardingInput({
    request_id: requestId,
    workspace_name: "Personal workspace",
    display_name: "Onboarding integration user",
    timezone: "UTC",
  });
}

async function expectApiError(operation: () => Promise<unknown>, status: number, code: string) {
  try {
    await operation();
  } catch (error) {
    assert(
      error instanceof ApiError && error.status === status && error.code === code,
      `The operation must fail with ${status} ${code}.`,
    );
    return;
  }
  throw new Error(`The operation unexpectedly succeeded instead of ${status} ${code}.`);
}

async function expectPrivilegeDenied(operation: () => Promise<unknown>) {
  try {
    await operation();
  } catch (error) {
    assert(
      error !== null && typeof error === "object" && "code" in error && error.code === "42501",
      "The limited service role must receive PostgreSQL insufficient_privilege.",
    );
    return;
  }
  throw new Error("The limited service role unexpectedly accepted a forbidden SQL operation.");
}

async function scopeCounts(database: Database, userId: string) {
  const [counts] = await database<{
    workspaces: number;
    members: number;
    people: number;
    links: number;
    access: number;
    aliases: number;
    receipts: number;
    events: number;
  }[]>`
    WITH scopes AS (SELECT id FROM core.workspaces WHERE created_by_user_id = ${userId})
    SELECT
      (SELECT count(*)::int FROM scopes) AS workspaces,
      (SELECT count(*)::int FROM core.workspace_members WHERE workspace_id IN
        (SELECT id FROM scopes)) AS members,
      (SELECT count(*)::int FROM core.people WHERE workspace_id IN
        (SELECT id FROM scopes)) AS people,
      (SELECT count(*)::int FROM core.person_user_links WHERE workspace_id IN
        (SELECT id FROM scopes)) AS links,
      (SELECT count(*)::int FROM core.person_access WHERE workspace_id IN
        (SELECT id FROM scopes)) AS access,
      (SELECT count(*)::int FROM core.person_aliases WHERE workspace_id IN
        (SELECT id FROM scopes)) AS aliases,
      (SELECT count(*)::int FROM private.operation_receipts WHERE actor_user_id = ${userId})
        AS receipts,
      (SELECT count(*)::int FROM audit.events WHERE actor_user_id = ${userId}) AS events
  `;
  return counts;
}

async function assertScopeCounts(database: Database, userId: string, receipts: number) {
  const counts = await scopeCounts(database, userId);
  for (
    const resource of ["workspaces", "members", "people", "links", "access", "aliases"] as const
  ) {
    assert(counts[resource] === 1, `Onboarding must create exactly one ${resource} row.`);
  }
  assert(counts.receipts === receipts, "Every accepted request must have exactly one receipt.");
  assert(counts.events === 1, "Only the initial onboarding may create an audit event.");
}

Deno.test("Local onboarding is atomic, idempotent, session-bound and isolated", async (test) => {
  // Password fixtures prove SQL behavior only; they never stand in for a Google OAuth login.
  const environment = localEnvironment();
  const options = {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  };
  const admin = createClient(environment.apiUrl, environment.serviceKey, options);
  const database = createDatabase(environment.databaseUrl);
  const serviceDatabase = createDatabase(environment.serviceDatabaseUrl);
  const concurrent = createDatabase(environment.serviceDatabaseUrl);
  const userIds: string[] = [];
  const clients: { auth: { stopAutoRefresh(): Promise<void> } }[] = [];

  async function fixture() {
    const client = createClient(environment.apiUrl, environment.anonymousKey, options);
    clients.push(client);
    const email = `onboarding-${crypto.randomUUID()}@impulso.test.invalid`;
    const password = `${crypto.randomUUID()}aA1!`;
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    assert(
      !created.error && created.data.user,
      `Creating a disposable local onboarding account failed (${
        created.error?.code ?? "no_user"
      }).`,
    );
    const userId = created.data.user.id;
    userIds.push(userId);
    const signedIn = await client.auth.signInWithPassword({ email, password });
    assert(!signedIn.error && signedIn.data.session, "The disposable account could not sign in.");
    const token = signedIn.data.session.access_token;
    const identity: VerifiedIdentity = {
      user_id: userId,
      session_id: sessionIdentifier(token),
      email,
    };
    return { client, token, identity };
  }

  try {
    await test.step("The limited service role cannot access unrelated or sensitive data", async () => {
      const [role] = await serviceDatabase<{
        name: string;
        rolsuper: boolean;
        rolcreatedb: boolean;
        rolcreaterole: boolean;
        rolinherit: boolean;
      }[]>`
        SELECT current_user AS name, rolsuper, rolcreatedb, rolcreaterole, rolinherit
        FROM pg_catalog.pg_roles WHERE rolname = current_user
      `;
      assert(
        role.name === "impulso_backend" && !role.rolsuper && !role.rolcreatedb &&
          !role.rolcreaterole && !role.rolinherit,
        "Integration onboarding must use a restricted service role with no administrative flags.",
      );
      await expectPrivilegeDenied(() => serviceDatabase`SELECT id FROM finance.books LIMIT 0`);
      await expectPrivilegeDenied(() => serviceDatabase`SELECT id FROM health.records LIMIT 0`);
      await expectPrivilegeDenied(() => serviceDatabase`DELETE FROM core.people WHERE false`);
      await expectPrivilegeDenied(
        () => serviceDatabase`SELECT encrypted_password FROM auth.users LIMIT 0`,
      );
      await expectPrivilegeDenied(() => serviceDatabase`SELECT id FROM auth.users LIMIT 0`);
      await expectPrivilegeDenied(() => serviceDatabase`SELECT id FROM auth.sessions LIMIT 0`);
      await expectPrivilegeDenied(() => serviceDatabase`SELECT id FROM auth.oauth_clients LIMIT 0`);
      await expectPrivilegeDenied(
        () => serviceDatabase`SELECT user_id FROM auth.oauth_consents LIMIT 0`,
      );
      await expectPrivilegeDenied(
        () => serviceDatabase`SELECT updated_at FROM private.auth_users LIMIT 0`,
      );
      await expectPrivilegeDenied(
        () => serviceDatabase`SELECT updated_at FROM private.auth_sessions LIMIT 0`,
      );
      await expectPrivilegeDenied(
        () => serviceDatabase`UPDATE private.auth_sessions SET scopes = 'openid' WHERE false`,
      );
      await expectPrivilegeDenied(
        () => serviceDatabase`UPDATE core.workspace_members SET role = role WHERE false`,
      );
      await expectPrivilegeDenied(() => serviceDatabase`SELECT id FROM audit.events LIMIT 0`);
    });

    const first = await fixture();
    const firstInput = input();

    await test.step("Private Auth views retain locks on the underlying account and session", async () => {
      await serviceDatabase.begin(async (sql) => {
        const sessions = await sql`
          SELECT id FROM private.auth_sessions WHERE id = ${first.identity.session_id} FOR SHARE
        `;
        const accounts = await sql`
          SELECT id FROM private.auth_users WHERE id = ${first.identity.user_id} FOR UPDATE
        `;
        assert(accounts.length === 1 && sessions.length === 1, "Both Auth rows must be locked.");
        for (
          const lock of [
            (transaction: Transaction) =>
              transaction`SELECT id FROM auth.users WHERE id = ${first.identity.user_id} FOR UPDATE`,
            (transaction: Transaction) =>
              transaction`SELECT id FROM auth.sessions WHERE id = ${first.identity.session_id} FOR UPDATE`,
          ]
        ) {
          let blocked = false;
          try {
            await database.begin(async (transaction) => {
              await transaction`SET LOCAL lock_timeout = '200ms'`;
              await lock(transaction);
            });
          } catch (error) {
            assert(
              error !== null && typeof error === "object" && "code" in error &&
                error.code === "55P03",
              "A conflicting Auth row lock must fail with lock_not_available.",
            );
            blocked = true;
          }
          assert(blocked, "A view lock must block a conflicting lock on its Auth base row.");
        }
      });
    });

    await test.step("The public operation denies password login and spoofed provider metadata", async () => {
      async function request(token?: string) {
        const response = await fetch(`${environment.apiUrl}/functions/v1/impulso-api/onboard`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify(firstInput),
          signal: AbortSignal.timeout(10_000),
        });
        const body = await response.json();
        assert(
          response.headers.get("cache-control") === "no-store",
          "Auth responses cannot be cached.",
        );
        return { response, body };
      }
      const missing = await request();
      assert(missing.response.status === 401, "Onboarding requires a verified session.");
      const emailLogin = await request(first.token);
      assert(
        emailLogin.response.status === 403 &&
          emailLogin.body.error?.code === "google_sign_in_required",
        "An email/password session must not satisfy the Google sign-in requirement.",
      );
      const spoofed = await first.client.auth.updateUser({
        data: { provider: "google", providers: ["google"], email_verified: true },
      });
      assert(!spoofed.error, "The metadata spoof fixture could not be prepared.");
      const metadataLogin = await request(first.token);
      assert(
        metadataLogin.response.status === 403 &&
          metadataLogin.body.error?.code === "google_sign_in_required",
        "User-editable provider metadata must never authorize Google onboarding.",
      );
      const counts = await scopeCounts(database, first.identity.user_id);
      assert(
        Object.values(counts).every((count) => count === 0),
        "Denied requests must create no rows.",
      );
    });

    const initial = await onboard(serviceDatabase, first.identity, firstInput);
    await test.step("The first transaction creates the six core rows, audit and receipt", async () => {
      assert(initial.status === "created", "The first onboarding must report creation.");
      await assertScopeCounts(database, first.identity.user_id, 1);
      const [scope] = await database`
        SELECT w.name, w.timezone, m.role, m.status, p.display_name, l.verification_method,
          a.role AS person_role, a.revoked_at, alias.alias
        FROM core.workspaces w
        JOIN core.workspace_members m ON m.workspace_id = w.id AND m.user_id = ${first.identity.user_id}
        JOIN core.people p ON p.id = ${initial.person_id} AND p.workspace_id = w.id
        JOIN core.person_user_links l ON l.workspace_id = w.id AND l.person_id = p.id
        JOIN core.person_access a ON a.workspace_id = w.id AND a.person_id = p.id
          AND a.user_id = m.user_id
        JOIN core.person_aliases alias ON alias.workspace_id = w.id AND alias.person_id = p.id
          AND alias.user_id = m.user_id
        WHERE w.id = ${initial.workspace_id}
      `;
      assert(
        scope.name === firstInput.workspace_name && scope.timezone === firstInput.timezone &&
          scope.display_name === firstInput.display_name && scope.role === "owner" &&
          scope.status === "active" && scope.person_role === "owner" && scope.revoked_at === null &&
          scope.verification_method === "self_registration" && scope.alias === "me",
        "The initial resources must contain the confirmed input and active owner grants.",
      );
      const [receipt] = await database`
        SELECT operation, status, octet_length(payload_hash) AS hash_length, resource_ids
        FROM private.operation_receipts WHERE request_id = ${firstInput.request_id}
      `;
      assert(
        receipt.operation === "onboard" && receipt.status === "completed" &&
          receipt.hash_length === 32 &&
          receipt.resource_ids.includes(initial.workspace_id) &&
          receipt.resource_ids.includes(initial.person_id),
        "The receipt must retain the operation fingerprint and its resource identifiers.",
      );
      const [event] = await database`
        SELECT module, resource_type, resource_id, action, outcome
        FROM audit.events WHERE request_id = ${firstInput.request_id}
      `;
      assert(
        event.module === "core" && event.resource_type === "workspace" &&
          event.resource_id === initial.workspace_id && event.action === "create" &&
          event.outcome === "success",
        "The committed operation must have the matching successful workspace audit event.",
      );
    });

    await test.step("Matching retries return the scope; changed payloads fail without mutation", async () => {
      const same = await onboard(serviceDatabase, first.identity, firstInput);
      assert(
        same.status === "already_processed" && same.workspace_id === initial.workspace_id &&
          same.person_id === initial.person_id,
        "A same-key retry must return the original scope.",
      );
      await expectApiError(
        () =>
          onboard(serviceDatabase, first.identity, { ...firstInput, display_name: "Changed name" }),
        409,
        "request_conflict",
      );
      const another = await onboard(serviceDatabase, first.identity, input());
      assert(
        another.status === "already_processed" && another.workspace_id === initial.workspace_id &&
          another.person_id === initial.person_id,
        "A new request key for an onboarded account must reuse its personal scope.",
      );
      await assertScopeCounts(database, first.identity.user_id, 2);
    });

    await test.step("Separate accounts remain isolated and cannot reuse another actor's request", async () => {
      const second = await fixture();
      await expectApiError(
        () => onboard(serviceDatabase, second.identity, firstInput),
        409,
        "request_conflict",
      );
      const empty = await scopeCounts(database, second.identity.user_id);
      assert(
        Object.values(empty).every((count) => count === 0),
        "A cross-actor conflict must create no rows.",
      );
      const separate = await onboard(serviceDatabase, second.identity, input());
      assert(
        separate.workspace_id !== initial.workspace_id && separate.person_id !== initial.person_id,
        "Different accounts must have different personal scopes.",
      );
      await assertScopeCounts(database, second.identity.user_id, 1);
      await assertScopeCounts(database, first.identity.user_id, 2);
    });

    await test.step("Concurrent same-key creation has one committed result", async () => {
      const third = await fixture();
      const sharedInput = input();
      const outcomes = await Promise.all([
        onboard(serviceDatabase, third.identity, sharedInput),
        onboard(concurrent, third.identity, sharedInput),
      ]);
      assert(
        outcomes.filter((outcome) => outcome.status === "created").length === 1 &&
          outcomes[0].workspace_id === outcomes[1].workspace_id &&
          outcomes[0].person_id === outcomes[1].person_id,
        "Concurrent retries must converge on one initial creation.",
      );
      await assertScopeCounts(database, third.identity.user_id, 1);
    });

    await test.step("Concurrent different-key creation still has one personal workspace", async () => {
      const fourth = await fixture();
      const outcomes = await Promise.all([
        onboard(serviceDatabase, fourth.identity, input()),
        onboard(concurrent, fourth.identity, input()),
      ]);
      assert(
        outcomes.filter((outcome) => outcome.status === "created").length === 1 &&
          outcomes[0].workspace_id === outcomes[1].workspace_id &&
          outcomes[0].person_id === outcomes[1].person_id,
        "Concurrent new keys for one account must not create duplicate resources.",
      );
      await assertScopeCounts(database, fourth.identity.user_id, 2);
    });

    await test.step("A failure after all SQL writes rolls back resources, audit and receipt", async () => {
      const fifth = await fixture();
      const failure = new Error("Intentional failure before the onboarding transaction commits");
      let completedWrites = false;
      const failingDatabase = new Proxy(serviceDatabase, {
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
      try {
        await onboard(failingDatabase, fifth.identity, input());
        throw new Error("The deliberately failing onboarding unexpectedly committed.");
      } catch (error) {
        assert(error === failure, "The transaction must propagate its final callback failure.");
      }
      assert(
        completedWrites,
        "Fault injection must happen after the service completes its writes.",
      );
      const empty = await scopeCounts(database, fifth.identity.user_id);
      assert(
        Object.values(empty).every((count) => count === 0),
        "No failed onboarding row may survive.",
      );
      const retried = await onboard(serviceDatabase, fifth.identity, input());
      assert(
        retried.status === "created",
        "A rolled-back account must remain eligible for onboarding.",
      );
      await assertScopeCounts(database, fifth.identity.user_id, 1);
    });

    await test.step("Receipt replay checks current membership and person access", async () => {
      await database`
        UPDATE core.workspace_members SET status = 'revoked', revoked_at = now()
        WHERE workspace_id = ${initial.workspace_id} AND user_id = ${first.identity.user_id}
      `;
      await expectApiError(
        () => onboard(serviceDatabase, first.identity, firstInput),
        403,
        "workspace_access_denied",
      );
      await database`
        UPDATE core.workspace_members SET status = 'active', revoked_at = NULL
        WHERE workspace_id = ${initial.workspace_id} AND user_id = ${first.identity.user_id}
      `;
      await database`
        UPDATE core.person_access SET revoked_at = now()
        WHERE workspace_id = ${initial.workspace_id} AND person_id = ${initial.person_id}
          AND user_id = ${first.identity.user_id}
      `;
      await expectApiError(
        () => onboard(serviceDatabase, first.identity, firstInput),
        403,
        "workspace_access_denied",
      );
      await database`
        UPDATE core.person_access SET revoked_at = NULL
        WHERE workspace_id = ${initial.workspace_id} AND person_id = ${initial.person_id}
          AND user_id = ${first.identity.user_id}
      `;
      await assertScopeCounts(database, first.identity.user_id, 2);
    });

    await test.step("Archived or purging scopes cannot be returned or recreated", async () => {
      await database`UPDATE core.workspaces SET archived_at = now() WHERE id = ${initial.workspace_id}`;
      await expectApiError(
        () => onboard(serviceDatabase, first.identity, firstInput),
        409,
        "workspace_archived",
      );
      await database`UPDATE core.workspaces SET archived_at = NULL WHERE id = ${initial.workspace_id}`;
      await database`UPDATE core.people SET archived_at = now() WHERE id = ${initial.person_id}`;
      await expectApiError(
        () => onboard(serviceDatabase, first.identity, firstInput),
        409,
        "person_archived",
      );
      await database`UPDATE core.people SET archived_at = NULL WHERE id = ${initial.person_id}`;
      const purgeId = crypto.randomUUID();
      await database`
        INSERT INTO private.purge_requests
          (id, workspace_id, scope, requested_by_user_id, state, manifest, manifest_hash, confirmed_at)
        VALUES (${purgeId}, ${initial.workspace_id}, 'workspace', ${first.identity.user_id},
          'approved', '{}'::jsonb, decode(repeat('00', 32), 'hex'), now())
      `;
      await expectApiError(
        () => onboard(serviceDatabase, first.identity, firstInput),
        409,
        "scope_purge_pending",
      );
      await database`DELETE FROM private.purge_requests WHERE id = ${purgeId}`;
      await assertScopeCounts(database, first.identity.user_id, 2);
    });

    await test.step("A purged receipt prevents resource recreation under both old and new keys", async () => {
      const retired = await fixture();
      const retiredInput = input();
      await database`
        INSERT INTO private.operation_receipts (request_id, actor_user_id, operation, status)
        VALUES (${retiredInput.request_id}, ${retired.identity.user_id}, 'onboard', 'purged')
      `;
      await expectApiError(
        () => onboard(serviceDatabase, retired.identity, retiredInput),
        409,
        "action_retired",
      );
      await expectApiError(
        () => onboard(serviceDatabase, retired.identity, input()),
        409,
        "action_retired",
      );
      const counts = await scopeCounts(database, retired.identity.user_id);
      assert(
        counts.receipts === 1 && counts.events === 0 && counts.workspaces === 0 &&
          counts.members === 0 && counts.people === 0 && counts.links === 0 &&
          counts.access === 0 && counts.aliases === 0,
        "A retained purge marker must never allow onboarding to recreate erased resources.",
      );
    });

    await test.step("Retired receipts deny replay and signing out invalidates all requests", async () => {
      await database`
        UPDATE private.operation_receipts SET status = 'purged', payload_hash = NULL,
          resource_ids = '{}'::uuid[] WHERE request_id = ${firstInput.request_id}
      `;
      await expectApiError(
        () => onboard(serviceDatabase, first.identity, firstInput),
        409,
        "action_retired",
      );
      const signedOut = await first.client.auth.signOut({ scope: "local" });
      assert(!signedOut.error, "The local onboarding session could not be revoked.");
      await expectApiError(
        () => onboard(serviceDatabase, first.identity, input()),
        401,
        "invalid_session",
      );
      await assertScopeCounts(database, first.identity.user_id, 2);
    });
  } finally {
    const cleanupFailures: string[] = [];
    try {
      if (userIds.length > 0) {
        await database.begin(async (sql) => {
          const workspaces = await sql<{ id: string }[]>`
            SELECT id FROM core.workspaces WHERE created_by_user_id = ANY(${
            sql.array(userIds, 2950)
          })
          `;
          const workspaceIds = workspaces.map((workspace) => workspace.id);
          await sql`DELETE FROM audit.events WHERE actor_user_id = ANY(${
            sql.array(userIds, 2950)
          })`;
          await sql`DELETE FROM private.operation_receipts WHERE actor_user_id = ANY(${
            sql.array(userIds, 2950)
          })`;
          await sql`DELETE FROM private.purge_requests WHERE requested_by_user_id = ANY(${
            sql.array(userIds, 2950)
          })`;
          if (workspaceIds.length > 0) {
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
          }
        });
      }
    } catch {
      cleanupFailures.push("onboarding database fixtures");
    }
    for (const userId of userIds) {
      try {
        const deleted = await admin.auth.admin.deleteUser(userId);
        if (deleted.error) cleanupFailures.push("onboarding Auth fixture");
      } catch {
        cleanupFailures.push("onboarding Auth fixture");
      }
    }
    for (const client of [...clients, admin]) await client.auth.stopAutoRefresh();
    const connections = await Promise.allSettled([
      database.end({ timeout: 5 }),
      serviceDatabase.end({ timeout: 5 }),
      concurrent.end({ timeout: 5 }),
    ]);
    if (connections.some((connection) => connection.status === "rejected")) {
      cleanupFailures.push("onboarding database connections");
    }
    assert(
      cleanupFailures.length === 0,
      `Onboarding cleanup failed: ${cleanupFailures.join(", ")}.`,
    );
  }
});
