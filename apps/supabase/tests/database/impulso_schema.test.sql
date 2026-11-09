BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = extensions, pg_temp, public;

SELECT no_plan();

CREATE TEMPORARY TABLE expected_tables (
  schema_name text NOT NULL,
  table_name text NOT NULL,
  PRIMARY KEY (schema_name, table_name)
) ON COMMIT DROP;

INSERT INTO expected_tables VALUES
  ('finance', 'workspaces'),
  ('finance', 'accounts'),
  ('finance', 'categories'),
  ('finance', 'payees'),
  ('finance', 'projects'),
  ('finance', 'transactions');

CREATE TEMPORARY TABLE expected_auth_views (
  view_name text PRIMARY KEY,
  column_names text[] NOT NULL
) ON COMMIT DROP;

INSERT INTO expected_auth_views VALUES
  ('auth_users', ARRAY['id', 'updated_at']),
  ('auth_sessions', ARRAY['id', 'user_id', 'not_after', 'updated_at', 'oauth_client_id', 'scopes']),
  ('oauth_clients', ARRAY['id', 'deleted_at']),
  ('oauth_consents', ARRAY['user_id', 'client_id', 'scopes', 'revoked_at']);

SELECT has_schema(schema_name, schema_name || ' schema exists')
FROM (VALUES ('finance'), ('api'), ('private')) AS schemas(schema_name);

SELECT has_table(schema_name, table_name, schema_name || '.' || table_name || ' exists')
FROM expected_tables ORDER BY schema_name, table_name;

SELECT columns_are('private', view_name, column_names, 'private.' || view_name || ' exposes only required Auth columns')
FROM expected_auth_views ORDER BY view_name;

SELECT ok(
  c.relkind = 'v' AND c.relowner = 'postgres'::regrole
    AND NOT coalesce(c.reloptions @> ARRAY['security_invoker=true'], false),
  'private.' || e.view_name || ' uses the postgres view owner for underlying Auth access'
)
FROM expected_auth_views e
LEFT JOIN pg_class c ON c.relnamespace = 'private'::regnamespace AND c.relname = e.view_name
ORDER BY e.view_name;

SELECT ok(
  NOT has_table_privilege(client.role_name, c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
    AND NOT has_any_column_privilege(client.role_name, c.oid, 'SELECT,INSERT,UPDATE,REFERENCES'),
  client.role_name || ' cannot access private.' || e.view_name
)
FROM expected_auth_views e
CROSS JOIN (VALUES ('anon'), ('authenticated'), ('service_role')) AS client(role_name)
JOIN pg_class c ON c.relnamespace = 'private'::regnamespace AND c.relname = e.view_name
ORDER BY client.role_name, e.view_name;

SELECT ok(
  has_column_privilege('impulso_backend', c.oid, column_name, 'SELECT')
    AND NOT has_column_privilege('impulso_backend', c.oid, column_name, 'INSERT,UPDATE,REFERENCES'),
  'The backend may only read private.' || e.view_name || '.' || column_name
)
FROM expected_auth_views e
JOIN pg_class c ON c.relnamespace = 'private'::regnamespace AND c.relname = e.view_name
CROSS JOIN LATERAL unnest(e.column_names) AS columns(column_name)
WHERE column_name <> 'updated_at'
ORDER BY e.view_name, column_name;

SELECT ok(
  has_column_privilege('impulso_backend', 'private.' || view_name, 'updated_at', 'UPDATE')
    AND NOT has_column_privilege('impulso_backend', 'private.' || view_name, 'updated_at', 'SELECT,INSERT,REFERENCES')
    AND NOT has_table_privilege('impulso_backend', 'private.' || view_name, 'DELETE,TRUNCATE,TRIGGER'),
  'The backend timestamp privilege permits native row locks on private.' || view_name
)
FROM (VALUES ('auth_users'), ('auth_sessions')) AS views(view_name);

SELECT is(
  (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname IN ('finance', 'private') AND c.relkind IN ('r', 'p')),
  6::bigint,
  'The model contains exactly 6 application tables'
);

SELECT ok(coalesce(c.relrowsecurity, false), e.schema_name || '.' || e.table_name || ' enables RLS')
FROM expected_tables e
LEFT JOIN pg_namespace n ON n.nspname = e.schema_name
LEFT JOIN pg_class c ON c.relnamespace = n.oid AND c.relname = e.table_name
ORDER BY e.schema_name, e.table_name;

SELECT ok(
  c.oid IS NOT NULL AND NOT has_table_privilege(client.role_name, c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'),
  client.role_name || ' cannot access ' || e.schema_name || '.' || e.table_name
)
FROM expected_tables e
CROSS JOIN (VALUES ('anon'), ('authenticated'), ('service_role')) AS client(role_name)
LEFT JOIN pg_namespace n ON n.nspname = e.schema_name
LEFT JOIN pg_class c ON c.relnamespace = n.oid AND c.relname = e.table_name
ORDER BY client.role_name, e.schema_name, e.table_name;

SELECT ok(
  NOT has_schema_privilege(client.role_name, schema_name, 'USAGE,CREATE'),
  client.role_name || ' has no internal schema privileges on ' || schema_name
)
FROM (VALUES ('finance'), ('private')) AS schemas(schema_name)
CROSS JOIN (VALUES ('anon'), ('authenticated'), ('service_role')) AS client(role_name);

SELECT is(
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname IN ('finance', 'api', 'private')),
  0::bigint,
  'Application schemas contain no custom database functions or procedures'
);
SELECT is(
  (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
   JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname IN ('finance', 'api', 'private') AND NOT t.tgisinternal),
  0::bigint,
  'Application tables contain no custom triggers; PostgreSQL retains internal constraint triggers'
);
SELECT ok(
  EXISTS (SELECT 1 FROM pg_constraint pc WHERE pc.conrelid = c.oid AND pc.contype = 'p'),
  e.schema_name || '.' || e.table_name || ' has a primary key'
)
FROM expected_tables e
JOIN pg_namespace n ON n.nspname = e.schema_name
JOIN pg_class c ON c.relnamespace = n.oid AND c.relname = e.table_name
ORDER BY e.schema_name, e.table_name;

SELECT ok(
  has_schema_privilege(role_name, 'api', 'USAGE') AND NOT has_schema_privilege(role_name, 'api', 'CREATE'),
  role_name || ' can resolve the empty API namespace but cannot create objects'
)
FROM (VALUES ('anon'), ('authenticated'), ('service_role')) AS clients(role_name);

SELECT is(
  (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'api' AND c.relkind IN ('r', 'p', 'v', 'm', 'f', 'S')),
  0::bigint,
  'The API schema exposes no relations before API implementation'
);
SELECT is(
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'api'),
  0::bigint,
  'The API schema exposes no callable operations before API implementation'
);

SELECT ok(
  has_table_privilege('impulso_backend', 'finance.' || e.table_name, 'SELECT,INSERT,UPDATE')
    AND NOT has_table_privilege('impulso_backend', 'finance.' || e.table_name, 'DELETE')
    AND NOT has_table_privilege('impulso_backend', 'finance.' || e.table_name, 'TRUNCATE')
    AND NOT has_table_privilege('impulso_backend', 'finance.' || e.table_name, 'REFERENCES')
    AND NOT has_table_privilege('impulso_backend', 'finance.' || e.table_name, 'TRIGGER'),
  'The backend can read, insert and edit finance.' || e.table_name || ' but never delete it'
)
FROM expected_tables e WHERE e.schema_name = 'finance' ORDER BY e.table_name;

-- Integrity checks use a rolled-back fixture owned by a disposable Auth user.
INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES ('00000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'schema@impulso.test.invalid', now(), '{}'::jsonb, '{}'::jsonb, now(), now());
INSERT INTO finance.workspaces (id, owner_user_id, name, currency, timezone, is_default) VALUES
  ('00000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000001', 'Yo', 'MXN', 'UTC', true),
  ('00000000-0000-4000-8000-000000000012', '00000000-0000-4000-8000-000000000001', 'Mamá', 'MXN', 'UTC', false);
INSERT INTO finance.accounts (id, workspace_id, name, currency, is_default) VALUES
  ('00000000-0000-4000-8000-000000000021', '00000000-0000-4000-8000-000000000011', 'BBVA', 'MXN', true),
  ('00000000-0000-4000-8000-000000000022', '00000000-0000-4000-8000-000000000012', 'Banorte', 'MXN', true);
INSERT INTO finance.categories (id, workspace_id, name, kind) VALUES
  ('00000000-0000-4000-8000-000000000031', '00000000-0000-4000-8000-000000000011', 'Comida', 'expense');

SELECT throws_ok(
  $$INSERT INTO finance.workspaces (owner_user_id, name, currency, timezone, is_default)
    VALUES ('00000000-0000-4000-8000-000000000001', 'Otro', 'MXN', 'UTC', true)$$,
  '23505', NULL, 'A user has at most one default workspace'
);
SELECT throws_ok(
  $$INSERT INTO finance.accounts (workspace_id, name, currency)
    VALUES ('00000000-0000-4000-8000-000000000011', 'bbva', 'MXN')$$,
  '23505', NULL, 'Active account names are unique per workspace regardless of case'
);
SELECT throws_ok(
  $$INSERT INTO finance.transactions (workspace_id, account_id, kind, amount, occurred_on, category_id, request_id)
    VALUES ('00000000-0000-4000-8000-000000000012', '00000000-0000-4000-8000-000000000022', 'expense', 10,
      '2026-11-09', '00000000-0000-4000-8000-000000000031', gen_random_uuid())$$,
  '23503', NULL, 'A transaction cannot use a category from another workspace'
);
SELECT throws_ok(
  $$INSERT INTO finance.transactions (workspace_id, account_id, kind, amount, occurred_on, request_id)
    VALUES ('00000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000021', 'transfer', 10,
      '2026-11-09', gen_random_uuid())$$,
  '23514', NULL, 'A transfer requires a destination account'
);
SELECT throws_ok(
  $$INSERT INTO finance.transactions (workspace_id, account_id, kind, amount, occurred_on, request_id)
    VALUES ('00000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000021', 'expense', 0,
      '2026-11-09', gen_random_uuid())$$,
  '23514', NULL, 'Amounts are positive'
);
SELECT lives_ok(
  $$INSERT INTO finance.transactions (id, workspace_id, account_id, kind, amount, occurred_on, category_id, request_id)
    VALUES ('00000000-0000-4000-8000-000000000041', '00000000-0000-4000-8000-000000000011',
      '00000000-0000-4000-8000-000000000021', 'expense', 10, '2026-11-09',
      '00000000-0000-4000-8000-000000000031', gen_random_uuid())$$,
  'A valid expense is accepted'
);
SET CONSTRAINTS ALL DEFERRED;
UPDATE finance.accounts SET workspace_id = '00000000-0000-4000-8000-000000000012', is_default = false
  WHERE id = '00000000-0000-4000-8000-000000000021';
UPDATE finance.transactions SET workspace_id = '00000000-0000-4000-8000-000000000012', category_id = NULL
  WHERE account_id = '00000000-0000-4000-8000-000000000021';
SELECT lives_ok(
  'SET CONSTRAINTS ALL IMMEDIATE',
  'An account and its transactions can move together inside one transaction'
);

SELECT * FROM finish();
ROLLBACK;
