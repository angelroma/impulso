import assert from "node:assert/strict";
import { ApiError, readJsonObject } from "../_shared/http.ts";

function jsonRequest(body: string, headers: Record<string, string> = {}): Request {
  return new Request("https://example.test/future-operation", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body,
  });
}

Deno.test("bounded JSON parsing accepts only explicitly allowed fields", async () => {
  assert.deepEqual(await readJsonObject(jsonRequest('{"name":"Ana"}'), ["name"]), { name: "Ana" });
  for (
    const body of [
      '{"actor_user_id":"another-user"}',
      '{"user_id":"another-user"}',
      '{"role":"owner"}',
    ]
  ) {
    await assert.rejects(readJsonObject(jsonRequest(body), ["name"]), (error: unknown) => {
      return error instanceof ApiError && error.code === "unknown_field";
    });
  }
});

Deno.test("JSON parsing rejects malformed and non-object input without leaking parser errors", async () => {
  for (const body of ["{", "[]", "null", "123", '"text"']) {
    await assert.rejects(readJsonObject(jsonRequest(body), []), (error: unknown) => {
      return error instanceof ApiError && error.status === 400 && error.code === "invalid_body";
    });
  }
  await assert.rejects(
    readJsonObject(jsonRequest("{}", { "Content-Type": "text/plain" }), []),
    (error: unknown) => error instanceof ApiError && error.status === 415,
  );
});

Deno.test("body size limits apply to actual UTF-8 bytes even with a false Content-Length", async () => {
  const oversized = jsonRequest('{"name":"ááááá"}', { "Content-Length": "1" });
  await assert.rejects(readJsonObject(oversized, ["name"], 16), (error: unknown) => {
    return error instanceof ApiError && error.status === 413;
  });
  await assert.rejects(
    readJsonObject(jsonRequest("{}", { "Content-Length": "9999" }), [], 16),
    (error: unknown) => error instanceof ApiError && error.status === 413,
  );
  await assert.rejects(
    readJsonObject(jsonRequest("{}", { "Content-Length": "invalid" }), []),
    (error: unknown) => error instanceof ApiError && error.status === 400,
  );
});
