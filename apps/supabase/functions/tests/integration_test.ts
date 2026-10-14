import { createClient } from "@supabase/supabase-js";
import type { VerifiedIdentity } from "../_shared/auth.ts";
import { createDatabase, sessionIsActive, withWorkspaceTransaction } from "../_shared/database.ts";
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
  const loopback = ["127.0.0.1", "localhost"];
  assert(
    api.protocol === "http:" && loopback.includes(api.hostname) && api.port === "54321" &&
      api.username === "" && api.password === "" && api.pathname === "/" &&
      api.search === "" && api.hash === "" &&
      ["postgres:", "postgresql:"].includes(database.protocol) &&
      loopback.includes(database.hostname) && database.port === "54322",
    "Integration fixtures may only be created in the local Impulso stack.",
  );
  assert(
    requiredEnvironment("IMPULSO_AUTH_ISSUER") === `${api.origin}/auth/v1`,
    "The integration issuer must belong to the local Auth server.",
  );
  return {
    apiUrl: api.origin,
    databaseUrl,
    anonymousKey: requiredEnvironment("SUPABASE_ANON_KEY"),
    serviceKey: requiredEnvironment("SUPABASE_SERVICE_ROLE_KEY"),
  };
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
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

Deno.test("Local Edge API verifies identity and protects PostgreSQL transactions", async (test) => {
  // Validate both destinations before constructing privileged clients or creating fixtures.
  const environment = localEnvironment();
  const options = {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  };
  const admin = createClient(environment.apiUrl, environment.serviceKey, options);
  const client = createClient(environment.apiUrl, environment.anonymousKey, options);
  const database = createDatabase(environment.databaseUrl);
  const blocker = createDatabase(environment.databaseUrl);
  const observer = createDatabase(environment.databaseUrl);
  const workspaceId = crypto.randomUUID();
  const otherWorkspaceId = crypto.randomUUID();
  const personId = crypto.randomUUID();
  const fixtureName = `Edge integration ${crypto.randomUUID()}`;
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

    await database.begin(async (sql) => {
      await sql`
        INSERT INTO core.workspaces (id, name, timezone, created_by_user_id)
        VALUES (${workspaceId}, ${fixtureName}, 'UTC', ${fixtureUserId})
      `;
      await sql`
        INSERT INTO core.workspaces (id, name, timezone)
        VALUES (${otherWorkspaceId}, ${`${fixtureName} without access`}, 'UTC')
      `;
      await sql`
        INSERT INTO core.workspace_members (workspace_id, user_id, role, status, accepted_at)
        VALUES (${workspaceId}, ${fixtureUserId}, 'owner', 'active', now())
      `;
    });

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

    await test.step("An inaccessible workspace never executes a business callback", async () => {
      let executed = false;
      try {
        await withWorkspaceTransaction(database, identity, otherWorkspaceId, () => {
          executed = true;
          return Promise.resolve();
        });
        throw new Error("An inaccessible workspace unexpectedly accepted an operation.");
      } catch (error) {
        assert(
          error instanceof ApiError && error.status === 403 &&
            error.code === "workspace_access_denied",
          "An inaccessible workspace must produce an authorization error.",
        );
      }
      assert(!executed, "Authorization must precede execution of a business callback.");
    });

    await test.step("A failed operation rolls back rows and leaves the connection usable", async () => {
      const failure = new Error("Intentional integration rollback");
      try {
        await withWorkspaceTransaction(database, identity, workspaceId, async (sql, access) => {
          assert(
            access.workspace_id === workspaceId && access.member_role === "owner",
            "The workspace context must come from the active database membership.",
          );
          await sql`
            INSERT INTO core.people (id, workspace_id, display_name, created_by_user_id)
            VALUES (${personId}, ${workspaceId}, 'Rollback fixture', ${identity.user_id})
          `;
          throw failure;
        });
        throw new Error("A deliberately failing operation unexpectedly completed.");
      } catch (error) {
        assert(error === failure, "The transaction must propagate its callback failure.");
      }
      const rows = await database`SELECT id FROM core.people WHERE id = ${personId}`;
      assert(rows.length === 0, "No row from a failed operation may remain committed.");
      assert(await sessionIsActive(database, identity), "The connection must work after rollback.");
    });

    await test.step("A waiting operation checks membership after the workspace lock", async () => {
      const [backend] = await database<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
      const locked = deferred();
      const release = deferred();
      let lockReady = false;
      let callbackExecuted = false;
      const blockingOperation = blocker.begin(async (sql) => {
        await sql`SELECT id FROM core.workspaces WHERE id = ${workspaceId} FOR UPDATE`;
        lockReady = true;
        locked.resolve();
        await release.promise;
        await sql`
          UPDATE core.workspace_members SET status = 'revoked', revoked_at = now()
          WHERE workspace_id = ${workspaceId} AND user_id = ${identity.user_id}
        `;
      });
      let waitingOperation: Promise<{ error: unknown }> | undefined;
      try {
        await Promise.race([
          locked.promise,
          blockingOperation.then(() => {
            assert(lockReady, "The blocking transaction must acquire its workspace lock.");
          }),
        ]);
        waitingOperation = withWorkspaceTransaction(database, identity, workspaceId, () => {
          callbackExecuted = true;
          return Promise.resolve();
        }).then(() => ({ error: null }), (error: unknown) => ({ error }));
        let waitingOnLock = false;
        const deadline = Date.now() + 1_500;
        while (Date.now() < deadline) {
          const [activity] = await observer<{ wait_event_type: string | null }[]>`
            SELECT wait_event_type FROM pg_stat_activity WHERE pid = ${backend.pid}
          `;
          if (activity?.wait_event_type === "Lock") {
            waitingOnLock = true;
            break;
          }
          await new Promise((complete) => setTimeout(complete, 25));
        }
        assert(waitingOnLock, "The concurrent operation must wait on the existing workspace lock.");
        assert(
          !callbackExecuted,
          "No callback may execute while its workspace lock is unavailable.",
        );
        release.resolve();
        await blockingOperation;
        const outcome = await waitingOperation;
        assert(
          outcome.error instanceof ApiError && outcome.error.status === 403 &&
            outcome.error.code === "workspace_access_denied",
          "Fresh membership must reject an operation after the locked revocation commits.",
        );
        assert(!callbackExecuted, "A revoked membership must never reach the business callback.");
      } finally {
        release.resolve();
        await Promise.allSettled([
          blockingOperation,
          ...(waitingOperation ? [waitingOperation] : []),
        ]);
      }
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
      await database.begin(async (sql) => {
        await sql`
          DELETE FROM core.people WHERE workspace_id IN (${workspaceId}, ${otherWorkspaceId})
        `;
        await sql`
          DELETE FROM core.workspace_members
          WHERE workspace_id IN (${workspaceId}, ${otherWorkspaceId})
        `;
        await sql`DELETE FROM core.workspaces WHERE id IN (${workspaceId}, ${otherWorkspaceId})`;
      });
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
      blocker.end({ timeout: 5 }),
      observer.end({ timeout: 5 }),
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
