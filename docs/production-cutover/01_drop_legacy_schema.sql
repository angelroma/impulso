-- One-time production cutover, step 1: remove the pre-rebuild Impulso schemas so the baseline
-- migration (20261109180000_create_impulso_baseline.sql) can be applied to a clean database.
--
-- DESTRUCTIVE. Run it once, by hand, only after a fresh export of the hosted data exists
-- (see README.md in this folder). It runs in a single transaction: any error leaves the
-- database untouched.
--
-- Kept: auth (users, sessions, OAuth clients and consents), the impulso_backend role and its
-- password, and every Supabase-managed schema.
-- Removed: the legacy audit, core, finance, api, private and health schemas with all their rows,
-- and the migration history older than the baseline. The export never included `private`
-- (encrypted Google tokens, receipts, sync state); that data is not recoverable afterwards.

BEGIN;

-- Refuse to run anywhere but the legacy database: finance.books only exists before the rebuild.
-- This keeps the script from ever wiping the new schema if it is run a second time.
DO $guard$
BEGIN
    IF to_regclass('finance.books') IS NULL THEN
        RAISE EXCEPTION 'finance.books not found: this is not the legacy schema, nothing dropped';
    END IF;
    IF to_regclass('finance.workspaces') IS NOT NULL THEN
        RAISE EXCEPTION 'finance.workspaces exists: the new schema is already here, nothing dropped';
    END IF;
END;
$guard$;

DROP SCHEMA IF EXISTS audit CASCADE;
DROP SCHEMA IF EXISTS core CASCADE;
DROP SCHEMA IF EXISTS finance CASCADE;
DROP SCHEMA IF EXISTS api CASCADE;
DROP SCHEMA IF EXISTS private CASCADE;
-- Health was dropped from the product; its tables were empty in the 2026-11-09 export.
DROP SCHEMA IF EXISTS health CASCADE;

-- The baseline replaces the earlier history; without this `supabase db push` refuses to run
-- because the remote lists versions that no longer exist locally.
DELETE FROM supabase_migrations.schema_migrations WHERE version < '20261109180000';

-- Review before the transaction ends: expect no rows in the first result and none in the second.
SELECT nspname AS leftover_schema FROM pg_namespace
WHERE nspname IN ('audit', 'core', 'finance', 'api', 'private', 'health');
SELECT version AS leftover_migration FROM supabase_migrations.schema_migrations;

COMMIT;
