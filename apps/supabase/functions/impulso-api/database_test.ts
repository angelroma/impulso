import assert from "node:assert/strict";
import { X509Certificate } from "node:crypto";
import { createDatabase } from "../_shared/database.ts";
import { supabaseRoot2021Ca } from "../_shared/supabase_root_ca.ts";

Deno.test("the bundled Supabase root CA matches its independently verified fingerprint", () => {
  const certificate = new X509Certificate(supabaseRoot2021Ca);
  assert.equal(certificate.ca, true);
  assert.equal(
    certificate.fingerprint256.replaceAll(":", "").toLowerCase(),
    "807025ad50d4ed219d2c9c7d299c004f824eb00cf7f65afef607d07b72e6cafa",
  );
});

Deno.test("database connections require verified TLS outside known local hosts", async () => {
  for (const hostname of ["db.example.com", "project.supabase.co", "127.0.0.2"]) {
    const database = createDatabase(
      `postgresql://user:password@${hostname}/postgres?sslmode=disable`,
    );
    assert.deepEqual(database.options.ssl, { ca: supabaseRoot2021Ca, rejectUnauthorized: true });
    assert.equal(database.options.prepare, false);
    assert.equal(database.options.max, 1);
    assert.equal(Reflect.get(database.options, "max_pipeline"), 1);
    await database.end();
  }
  for (const hostname of ["localhost", "127.0.0.1", "[::1]", "db", "supabase_db_Impulso"]) {
    const database = createDatabase(`postgresql://user:password@${hostname}/postgres`);
    assert.equal(database.options.ssl, false);
    await database.end();
  }
});
