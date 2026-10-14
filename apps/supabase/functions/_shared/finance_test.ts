import assert from "node:assert/strict";
import type { VerifiedIdentity } from "./auth.ts";
import { type Database, type Transaction, withIdentityTransaction } from "./database.ts";
import { getFinanceContext } from "./finance.ts";
import { ApiError } from "./http.ts";

const identity: VerifiedIdentity = {
  user_id: "10000000-0000-4000-8000-000000000001",
  session_id: "10000000-0000-4000-8000-000000000002",
  email: null,
};
const requestId = "10000000-0000-4000-8000-000000000003";

function fixture(query: (text: string) => unknown): Database {
  const sql =
    ((parts: TemplateStringsArray) =>
      Promise.resolve(query(parts.join("?")))) as unknown as Transaction;
  return {
    begin: (operation: (sql: Transaction) => unknown) => operation(sql),
  } as unknown as Database;
}

Deno.test("transaction entry checks session and locks request before scope work", async () => {
  const queries: string[] = [];
  const database = fixture((text) => {
    queries.push(text);
    return text.includes("private.auth_sessions") ? [{ id: identity.session_id }] : [];
  });
  const result = await withIdentityTransaction(database, identity, () => {
    queries.push("scope work");
    return Promise.resolve("committed");
  }, requestId);
  assert.equal(result, "committed");
  assert.match(queries[0], /statement_timeout/);
  assert.match(queries[1], /lock_timeout/);
  assert.match(queries[2], /private.auth_sessions/);
  assert.match(queries[3], /pg_advisory_xact_lock/);
  assert.equal(queries[4], "scope work");
  assert.match(queries[5], /private.auth_sessions/);
});

Deno.test("transaction session denial prevents request locks and protected work", async () => {
  const queries: string[] = [];
  const database = fixture((text) => {
    queries.push(text);
    return [];
  });
  await assert.rejects(
    () =>
      withIdentityTransaction(database, identity, () => {
        throw new Error("Protected work must not run.");
      }, requestId),
    (error: unknown) => error instanceof ApiError && error.code === "invalid_session",
  );
  assert.equal(queries.some((query) => query.includes("pg_advisory_xact_lock")), false);
});

Deno.test("transaction entry rechecks delegated state before completing protected work", async () => {
  let sessionChecks = 0;
  const database = fixture((text) => {
    if (text.includes("private.auth_sessions")) {
      sessionChecks++;
      return sessionChecks === 1 ? [{ id: identity.session_id }] : [];
    }
    return [];
  });
  await assert.rejects(
    () => withIdentityTransaction(database, identity, () => Promise.resolve("pending commit")),
    (error: unknown) => error instanceof ApiError && error.code === "invalid_session",
  );
  assert.equal(sessionChecks, 2);
});

Deno.test("transaction lock and serialization failures expose only controlled retry errors", async () => {
  for (const code of ["55P03", "40P01", "40001", "57014"]) {
    const database = fixture(() => {
      throw Object.assign(new Error("Private SQL and connection details"), { code });
    });
    await assert.rejects(
      () => withIdentityTransaction(database, identity, () => Promise.resolve()),
      (error: unknown) => {
        assert(error instanceof ApiError);
        assert.equal(error.code, "operation_retry_required");
        assert.equal(error.status, 503);
        assert.match(error.message, /same request identifier and unchanged values/);
        assert.doesNotMatch(error.message, /Private SQL/);
        return true;
      },
    );
  }
});

Deno.test("Finance continuation rejects malformed or mismatched scopes before database work", () => {
  const database = fixture(() => {
    throw new Error("Invalid cursors must not query the database.");
  });
  const workspaceId = "10000000-0000-4000-8000-000000000004";
  const cursor = (changes: Record<string, unknown>) =>
    btoa(JSON.stringify({
      v: 1,
      w: workspaceId,
      b: null,
      t: "2026-10-13T12:34:56.123456Z",
      i: requestId,
      ...changes,
    })).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
  for (
    const value of [
      "bad cursor",
      cursor({ w: requestId }),
      cursor({ b: requestId }),
      cursor({ t: "2026-02-30T12:34:56.123456Z" }),
      cursor({ t: "2026-10-13T12:34:60.123456Z" }),
      cursor({ t: "2026-10-13T12:34:56.123Z" }),
      cursor({ extra: true }),
    ]
  ) {
    assert.throws(
      () => getFinanceContext(database, identity, { workspace_id: workspaceId, cursor: value }),
      (error: unknown) => error instanceof ApiError && error.code === "invalid_cursor",
    );
  }
});
