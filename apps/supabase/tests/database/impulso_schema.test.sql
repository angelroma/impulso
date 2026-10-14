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
  ('core', 'workspaces'),
  ('core', 'workspace_members'),
  ('core', 'people'),
  ('core', 'person_user_links'),
  ('core', 'person_access'),
  ('core', 'person_aliases'),
  ('core', 'identity_link_requests'),
  ('core', 'ownership_transfer_requests'),
  ('finance', 'books'),
  ('finance', 'accounts'),
  ('finance', 'transactions'),
  ('finance', 'budgets'),
  ('finance', 'book_access'),
  ('finance', 'files'),
  ('health', 'records'),
  ('health', 'medications'),
  ('health', 'appointments'),
  ('health', 'lab_results'),
  ('health', 'person_access'),
  ('health', 'files'),
  ('audit', 'events'),
  ('private', 'operation_receipts'),
  ('private', 'purge_requests');

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
FROM (VALUES ('core'), ('finance'), ('health'), ('api'), ('audit'), ('private')) AS schemas(schema_name);

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
   WHERE n.nspname IN ('core', 'finance', 'health', 'audit', 'private') AND c.relkind IN ('r', 'p')),
  23::bigint,
  'The initial model contains exactly 23 application tables'
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
FROM (VALUES ('core'), ('finance'), ('health'), ('audit'), ('private')) AS schemas(schema_name)
CROSS JOIN (VALUES ('anon'), ('authenticated'), ('service_role')) AS client(role_name);

SELECT is(
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname IN ('core', 'finance', 'health', 'api', 'audit', 'private')),
  0::bigint,
  'Application schemas contain no custom database functions or procedures'
);
SELECT is(
  (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
   JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname IN ('core', 'finance', 'health', 'api', 'audit', 'private') AND NOT t.tgisinternal),
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

-- Every fixture is temporary or contained in this rolled-back transaction.
CREATE TEMPORARY TABLE fixture_ids (
  name text PRIMARY KEY,
  id uuid NOT NULL DEFAULT gen_random_uuid()
) ON COMMIT DROP;

INSERT INTO fixture_ids (name) VALUES
  ('owner_one'), ('member_one'), ('owner_two'),
  ('workspace_one'), ('workspace_two'),
  ('person_one'), ('person_two'), ('person_three'),
  ('book_one'), ('book_two'), ('book_three'),
  ('account_one'), ('account_two'), ('account_three'), ('account_four'),
  ('transaction_one'), ('record_one'), ('record_two'), ('health_file_one'), ('health_file_cross_subject'), ('historical_record');

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
SELECT id, 'authenticated', 'authenticated', id::text || '@impulso.test.invalid', now(),
       '{"provider":"google","providers":["google"]}'::jsonb, '{}'::jsonb, now(), now()
FROM fixture_ids WHERE name IN ('owner_one', 'member_one', 'owner_two');


INSERT INTO core.workspaces (id, name, timezone)
VALUES ((SELECT id FROM pg_temp.fixture_ids WHERE name = 'workspace_one'), 'First test workspace', 'America/Mexico_City');
INSERT INTO core.workspace_members (workspace_id, user_id, role, status, accepted_at)
VALUES
  ((SELECT id FROM pg_temp.fixture_ids WHERE name = 'workspace_one'), (SELECT id FROM pg_temp.fixture_ids WHERE name = 'owner_one'), 'owner', 'active', now()),
  ((SELECT id FROM pg_temp.fixture_ids WHERE name = 'workspace_one'), (SELECT id FROM pg_temp.fixture_ids WHERE name = 'member_one'), 'member', 'active', now());
INSERT INTO core.people (id, workspace_id, display_name)
VALUES
  ((SELECT id FROM pg_temp.fixture_ids WHERE name = 'person_one'), (SELECT id FROM pg_temp.fixture_ids WHERE name = 'workspace_one'), 'First test person'),
  ((SELECT id FROM pg_temp.fixture_ids WHERE name = 'person_two'), (SELECT id FROM pg_temp.fixture_ids WHERE name = 'workspace_one'), 'Second test person');
INSERT INTO core.person_access (workspace_id, person_id, user_id, role)
VALUES
  ((SELECT id FROM pg_temp.fixture_ids WHERE name = 'workspace_one'), (SELECT id FROM pg_temp.fixture_ids WHERE name = 'person_one'), (SELECT id FROM pg_temp.fixture_ids WHERE name = 'owner_one'), 'owner'),
  ((SELECT id FROM pg_temp.fixture_ids WHERE name = 'workspace_one'), (SELECT id FROM pg_temp.fixture_ids WHERE name = 'person_two'), (SELECT id FROM pg_temp.fixture_ids WHERE name = 'owner_one'), 'owner');
INSERT INTO core.person_user_links (workspace_id, person_id, user_id, verification_method)
VALUES ((SELECT id FROM pg_temp.fixture_ids WHERE name = 'workspace_one'), (SELECT id FROM pg_temp.fixture_ids WHERE name = 'person_one'), (SELECT id FROM pg_temp.fixture_ids WHERE name = 'owner_one'), 'self_registration');

INSERT INTO finance.books (id, workspace_id, name, currency, minor_unit)
VALUES
  ((SELECT id FROM pg_temp.fixture_ids WHERE name = 'book_one'), (SELECT id FROM pg_temp.fixture_ids WHERE name = 'workspace_one'), 'First test book', 'MXN', 2),
  ((SELECT id FROM pg_temp.fixture_ids WHERE name = 'book_two'), (SELECT id FROM pg_temp.fixture_ids WHERE name = 'workspace_one'), 'Second test book', 'MXN', 2);
INSERT INTO finance.book_access (workspace_id, book_id, user_id, role)
VALUES
  ((SELECT id FROM pg_temp.fixture_ids WHERE name = 'workspace_one'), (SELECT id FROM pg_temp.fixture_ids WHERE name = 'book_one'), (SELECT id FROM pg_temp.fixture_ids WHERE name = 'owner_one'), 'owner'),
  ((SELECT id FROM pg_temp.fixture_ids WHERE name = 'workspace_one'), (SELECT id FROM pg_temp.fixture_ids WHERE name = 'book_two'), (SELECT id FROM pg_temp.fixture_ids WHERE name = 'owner_one'), 'owner');
INSERT INTO finance.accounts (id, workspace_id, book_id, currency, name, person_id, opening_balance)
VALUES
  ((SELECT id FROM pg_temp.fixture_ids WHERE name = 'account_one'), (SELECT id FROM pg_temp.fixture_ids WHERE name = 'workspace_one'), (SELECT id FROM pg_temp.fixture_ids WHERE name = 'book_one'), 'MXN', 'First test account', (SELECT id FROM pg_temp.fixture_ids WHERE name = 'person_one'), 100),
  ((SELECT id FROM pg_temp.fixture_ids WHERE name = 'account_two'), (SELECT id FROM pg_temp.fixture_ids WHERE name = 'workspace_one'), (SELECT id FROM pg_temp.fixture_ids WHERE name = 'book_one'), 'MXN', 'Second test account', NULL, 0),
  ((SELECT id FROM pg_temp.fixture_ids WHERE name = 'account_three'), (SELECT id FROM pg_temp.fixture_ids WHERE name = 'workspace_one'), (SELECT id FROM pg_temp.fixture_ids WHERE name = 'book_two'), 'MXN', 'Other book account', NULL, 0);
INSERT INTO finance.transactions (id, workspace_id, book_id, currency, kind, amount, source_account_id, occurred_on, description, request_id)
VALUES ((SELECT id FROM pg_temp.fixture_ids WHERE name = 'transaction_one'), (SELECT id FROM pg_temp.fixture_ids WHERE name = 'workspace_one'), (SELECT id FROM pg_temp.fixture_ids WHERE name = 'book_one'),
        'MXN', 'expense', 10, (SELECT id FROM pg_temp.fixture_ids WHERE name = 'account_one'), DATE '2026-01-10', 'Test expense', gen_random_uuid());

INSERT INTO health.person_access (workspace_id, person_id, user_id, role)
VALUES
  ((SELECT id FROM pg_temp.fixture_ids WHERE name = 'workspace_one'), (SELECT id FROM pg_temp.fixture_ids WHERE name = 'person_one'), (SELECT id FROM pg_temp.fixture_ids WHERE name = 'owner_one'), 'owner'),
  ((SELECT id FROM pg_temp.fixture_ids WHERE name = 'workspace_one'), (SELECT id FROM pg_temp.fixture_ids WHERE name = 'person_two'), (SELECT id FROM pg_temp.fixture_ids WHERE name = 'owner_one'), 'owner');
INSERT INTO health.records (id, workspace_id, person_id, kind, title, body)
VALUES
  ((SELECT id FROM pg_temp.fixture_ids WHERE name = 'record_one'), (SELECT id FROM pg_temp.fixture_ids WHERE name = 'workspace_one'), (SELECT id FROM pg_temp.fixture_ids WHERE name = 'person_one'), 'note', 'Undated test note', 'A manually reported test note.'),
  ((SELECT id FROM pg_temp.fixture_ids WHERE name = 'record_two'), (SELECT id FROM pg_temp.fixture_ids WHERE name = 'workspace_one'), (SELECT id FROM pg_temp.fixture_ids WHERE name = 'person_two'), 'note', 'Other person note', 'A separate subject fixture.');
INSERT INTO health.files (id, workspace_id, person_id, record_id, bucket_id, object_path, original_name, mime_type, size_bytes)
VALUES ((SELECT id FROM pg_temp.fixture_ids WHERE name = 'health_file_one'), (SELECT id FROM pg_temp.fixture_ids WHERE name = 'workspace_one'), (SELECT id FROM pg_temp.fixture_ids WHERE name = 'person_one'),
        (SELECT id FROM pg_temp.fixture_ids WHERE name = 'record_one'), 'health-files',
        (SELECT id FROM pg_temp.fixture_ids WHERE name = 'workspace_one')::text || '/' || (SELECT id FROM pg_temp.fixture_ids WHERE name = 'person_one')::text || '/' || (SELECT id FROM pg_temp.fixture_ids WHERE name = 'health_file_one')::text,
        'unverified-report.pdf', 'application/pdf', 100);


INSERT INTO core.workspaces (id, name, timezone)
VALUES ((SELECT id FROM pg_temp.fixture_ids WHERE name = 'workspace_two'), 'Second test workspace', 'UTC');
INSERT INTO core.workspace_members (workspace_id, user_id, role, status, accepted_at)
VALUES ((SELECT id FROM pg_temp.fixture_ids WHERE name = 'workspace_two'), (SELECT id FROM pg_temp.fixture_ids WHERE name = 'owner_two'), 'owner', 'active', now());
INSERT INTO core.people (id, workspace_id, display_name)
VALUES ((SELECT id FROM pg_temp.fixture_ids WHERE name = 'person_three'), (SELECT id FROM pg_temp.fixture_ids WHERE name = 'workspace_two'), 'Other workspace person');
INSERT INTO core.person_access (workspace_id, person_id, user_id, role)
VALUES ((SELECT id FROM pg_temp.fixture_ids WHERE name = 'workspace_two'), (SELECT id FROM pg_temp.fixture_ids WHERE name = 'person_three'), (SELECT id FROM pg_temp.fixture_ids WHERE name = 'owner_two'), 'owner');
INSERT INTO core.person_user_links (workspace_id, person_id, user_id, verification_method)
VALUES ((SELECT id FROM pg_temp.fixture_ids WHERE name = 'workspace_two'), (SELECT id FROM pg_temp.fixture_ids WHERE name = 'person_three'), (SELECT id FROM pg_temp.fixture_ids WHERE name = 'owner_two'), 'self_registration');
INSERT INTO finance.books (id, workspace_id, name, currency, minor_unit)
VALUES ((SELECT id FROM pg_temp.fixture_ids WHERE name = 'book_three'), (SELECT id FROM pg_temp.fixture_ids WHERE name = 'workspace_two'), 'Other workspace book', 'USD', 2);
INSERT INTO finance.book_access (workspace_id, book_id, user_id, role)
VALUES ((SELECT id FROM pg_temp.fixture_ids WHERE name = 'workspace_two'), (SELECT id FROM pg_temp.fixture_ids WHERE name = 'book_three'), (SELECT id FROM pg_temp.fixture_ids WHERE name = 'owner_two'), 'owner');
INSERT INTO finance.accounts (id, workspace_id, book_id, currency, name, opening_balance)
VALUES ((SELECT id FROM pg_temp.fixture_ids WHERE name = 'account_four'), (SELECT id FROM pg_temp.fixture_ids WHERE name = 'workspace_two'), (SELECT id FROM pg_temp.fixture_ids WHERE name = 'book_three'), 'USD', 'Other workspace account', 0);


SELECT is((SELECT count(*) FROM core.workspaces WHERE id IN ((SELECT id FROM pg_temp.fixture_ids WHERE name = 'workspace_one'), (SELECT id FROM pg_temp.fixture_ids WHERE name = 'workspace_two'))),
          2::bigint, 'Two isolated fixture workspaces exist');
SELECT is((SELECT count(*) FROM auth.users WHERE id IN ((SELECT id FROM pg_temp.fixture_ids WHERE name = 'owner_one'), (SELECT id FROM pg_temp.fixture_ids WHERE name = 'member_one'), (SELECT id FROM pg_temp.fixture_ids WHERE name = 'owner_two'))),
          3::bigint, 'Three temporary Google account fixtures exist');
SELECT ok((SELECT occurred_on IS NULL AND occurred_at IS NULL FROM health.records WHERE id = (SELECT id FROM pg_temp.fixture_ids WHERE name = 'record_one')),
          'An unknown clinical date stays unknown');
SELECT is((SELECT state FROM health.files WHERE id = (SELECT id FROM pg_temp.fixture_ids WHERE name = 'health_file_one')), 'pending',
          'An unverified PDF remains pending');

SELECT throws_ok(test.statement, test.expected_state, NULL::text, test.description)
FROM (VALUES
  ($sql$INSERT INTO core.person_user_links (workspace_id, person_id, user_id, verification_method)
    VALUES ((SELECT id FROM pg_temp.fixture_ids WHERE name = 'workspace_one'), (SELECT id FROM pg_temp.fixture_ids WHERE name = 'person_three'), (SELECT id FROM pg_temp.fixture_ids WHERE name = 'member_one'), 'dual_acceptance')$sql$,
    '23503', 'A person link cannot cross workspaces'),
  ($sql$INSERT INTO core.person_access (workspace_id, person_id, user_id, role)
    VALUES ((SELECT id FROM pg_temp.fixture_ids WHERE name = 'workspace_one'), (SELECT id FROM pg_temp.fixture_ids WHERE name = 'person_one'), (SELECT id FROM pg_temp.fixture_ids WHERE name = 'owner_two'), 'viewer')$sql$,
    '23503', 'An ACL recipient must reference a member of the same workspace'),
  ($sql$INSERT INTO finance.accounts (workspace_id, book_id, currency, name, opening_balance, person_id)
    VALUES ((SELECT id FROM pg_temp.fixture_ids WHERE name = 'workspace_one'), (SELECT id FROM pg_temp.fixture_ids WHERE name = 'book_one'), 'MXN', 'Invalid subject account', 0, (SELECT id FROM pg_temp.fixture_ids WHERE name = 'person_three'))$sql$,
    '23503', 'An account cannot reference a person from another workspace'),
  ($sql$INSERT INTO finance.accounts (workspace_id, book_id, currency, name, opening_balance)
    VALUES ((SELECT id FROM pg_temp.fixture_ids WHERE name = 'workspace_one'), (SELECT id FROM pg_temp.fixture_ids WHERE name = 'book_three'), 'USD', 'Invalid workspace account', 0)$sql$,
    '23503', 'An account cannot reference a book from another workspace'),
  ($sql$INSERT INTO finance.transactions (workspace_id, book_id, currency, kind, amount, source_account_id, occurred_on, description, request_id)
    VALUES ((SELECT id FROM pg_temp.fixture_ids WHERE name = 'workspace_one'), (SELECT id FROM pg_temp.fixture_ids WHERE name = 'book_one'), 'MXN', 'expense', 1, (SELECT id FROM pg_temp.fixture_ids WHERE name = 'account_three'), DATE '2026-01-10', 'Invalid book', gen_random_uuid())$sql$,
    '23503', 'A transaction account cannot belong to another book'),
  ($sql$INSERT INTO finance.transactions (workspace_id, book_id, currency, kind, amount, source_account_id, occurred_on, description, request_id)
    VALUES ((SELECT id FROM pg_temp.fixture_ids WHERE name = 'workspace_one'), (SELECT id FROM pg_temp.fixture_ids WHERE name = 'book_one'), 'USD', 'expense', 1, (SELECT id FROM pg_temp.fixture_ids WHERE name = 'account_four'), DATE '2026-01-10', 'Invalid workspace', gen_random_uuid())$sql$,
    '23503', 'A transaction account cannot belong to another workspace'),
  ($sql$INSERT INTO health.records (workspace_id, person_id, kind, title, body)
    VALUES ((SELECT id FROM pg_temp.fixture_ids WHERE name = 'workspace_one'), (SELECT id FROM pg_temp.fixture_ids WHERE name = 'person_three'), 'note', 'Invalid subject', 'Cross-workspace fixture.')$sql$,
    '23503', 'A clinical record cannot cross workspaces'),
  ($sql$INSERT INTO health.files (id, workspace_id, person_id, record_id, bucket_id, object_path, original_name, mime_type, size_bytes)
    VALUES ((SELECT id FROM pg_temp.fixture_ids WHERE name = 'health_file_cross_subject'), (SELECT id FROM pg_temp.fixture_ids WHERE name = 'workspace_one'), (SELECT id FROM pg_temp.fixture_ids WHERE name = 'person_one'), (SELECT id FROM pg_temp.fixture_ids WHERE name = 'record_two'), 'health-files',
      (SELECT id FROM pg_temp.fixture_ids WHERE name = 'workspace_one')::text || '/' || (SELECT id FROM pg_temp.fixture_ids WHERE name = 'person_one')::text || '/' || (SELECT id FROM pg_temp.fixture_ids WHERE name = 'health_file_cross_subject')::text,
      'invalid-subject.pdf', 'application/pdf', 100)$sql$,
    '23503', 'A health attachment cannot reference another subject')
) AS test(statement, expected_state, description);

-- shortcut: Raw decimal syntax and book-specific precision need Edge Function tests when the parser exists.
SELECT throws_ok(test.statement, test.expected_state, NULL::text, test.description)
FROM (VALUES
  ($sql$INSERT INTO finance.transactions (workspace_id, book_id, currency, kind, amount, occurred_on, description, request_id)
    VALUES ((SELECT id FROM pg_temp.fixture_ids WHERE name = 'workspace_one'), (SELECT id FROM pg_temp.fixture_ids WHERE name = 'book_one'), 'MXN', 'expense', 1, DATE '2026-01-10', 'Missing source', gen_random_uuid())$sql$,
    '23514', 'An expense requires a source account'),
  ($sql$INSERT INTO finance.transactions (workspace_id, book_id, currency, kind, amount, source_account_id, occurred_on, description, request_id)
    VALUES ((SELECT id FROM pg_temp.fixture_ids WHERE name = 'workspace_one'), (SELECT id FROM pg_temp.fixture_ids WHERE name = 'book_one'), 'MXN', 'income', 1, (SELECT id FROM pg_temp.fixture_ids WHERE name = 'account_one'), DATE '2026-01-10', 'Invalid income', gen_random_uuid())$sql$,
    '23514', 'An income cannot use a source account'),
  ($sql$INSERT INTO finance.transactions (workspace_id, book_id, currency, kind, amount, source_account_id, destination_account_id, occurred_on, description, request_id)
    VALUES ((SELECT id FROM pg_temp.fixture_ids WHERE name = 'workspace_one'), (SELECT id FROM pg_temp.fixture_ids WHERE name = 'book_one'), 'MXN', 'transfer', 1, (SELECT id FROM pg_temp.fixture_ids WHERE name = 'account_one'), (SELECT id FROM pg_temp.fixture_ids WHERE name = 'account_one'), DATE '2026-01-10', 'Self transfer', gen_random_uuid())$sql$,
    '23514', 'A transfer requires distinct accounts'),
  ($sql$INSERT INTO finance.transactions (workspace_id, book_id, currency, kind, amount, source_account_id, occurred_on, description, request_id)
    VALUES ((SELECT id FROM pg_temp.fixture_ids WHERE name = 'workspace_one'), (SELECT id FROM pg_temp.fixture_ids WHERE name = 'book_one'), 'MXN', 'unknown', 1, (SELECT id FROM pg_temp.fixture_ids WHERE name = 'account_one'), DATE '2026-01-10', 'Unknown kind', gen_random_uuid())$sql$,
    '23514', 'Unknown financial kinds are rejected'),
  ($sql$INSERT INTO finance.accounts (workspace_id, book_id, currency, name, opening_balance)
    VALUES ((SELECT id FROM pg_temp.fixture_ids WHERE name = 'workspace_one'), (SELECT id FROM pg_temp.fixture_ids WHERE name = 'book_one'), 'USD', 'Wrong currency account', 0)$sql$,
    '23503', 'Account currency must match the book'),
  ($sql$INSERT INTO finance.books (workspace_id, name, currency, minor_unit)
    VALUES ((SELECT id FROM pg_temp.fixture_ids WHERE name = 'workspace_one'), 'Invalid currency book', 'mxn', 2)$sql$,
    '23514', 'Currency codes must use three uppercase letters'),
  ($sql$INSERT INTO finance.books (workspace_id, name, currency, minor_unit)
    VALUES ((SELECT id FROM pg_temp.fixture_ids WHERE name = 'workspace_one'), 'Invalid precision book', 'MXN', 5)$sql$,
    '23514', 'A book cannot declare more than four decimal places'),
  ($sql$INSERT INTO finance.transactions (workspace_id, book_id, currency, kind, amount, source_account_id, occurred_on, description, request_id)
    VALUES ((SELECT id FROM pg_temp.fixture_ids WHERE name = 'workspace_one'), (SELECT id FROM pg_temp.fixture_ids WHERE name = 'book_one'), 'MXN', 'expense', 0, (SELECT id FROM pg_temp.fixture_ids WHERE name = 'account_one'), DATE '2026-01-10', 'Zero amount', gen_random_uuid())$sql$,
    '23514', 'Transaction amounts must be positive'),
  ($sql$INSERT INTO finance.transactions (workspace_id, book_id, currency, kind, amount, source_account_id, occurred_on, description, request_id)
    VALUES ((SELECT id FROM pg_temp.fixture_ids WHERE name = 'workspace_one'), (SELECT id FROM pg_temp.fixture_ids WHERE name = 'book_one'), 'MXN', 'expense', 'NaN'::numeric, (SELECT id FROM pg_temp.fixture_ids WHERE name = 'account_one'), DATE '2026-01-10', 'Nonfinite amount', gen_random_uuid())$sql$,
    '23514', 'NaN cannot become a transaction amount'),
  ($sql$INSERT INTO finance.transactions (workspace_id, book_id, currency, kind, amount, source_account_id, occurred_on, description, request_id)
    VALUES ((SELECT id FROM pg_temp.fixture_ids WHERE name = 'workspace_one'), (SELECT id FROM pg_temp.fixture_ids WHERE name = 'book_one'), 'MXN', 'expense', 'Infinity'::numeric, (SELECT id FROM pg_temp.fixture_ids WHERE name = 'account_one'), DATE '2026-01-10', 'Infinite amount', gen_random_uuid())$sql$,
    '22003', 'Infinite values cannot fit monetary columns'),
  ($sql$UPDATE finance.accounts SET opening_balance = 'NaN'::numeric WHERE id = (SELECT id FROM pg_temp.fixture_ids WHERE name = 'account_two')$sql$,
    '23514', 'NaN cannot become an opening balance'),
  ($sql$INSERT INTO finance.budgets (workspace_id, book_id, currency, name, starts_on, ends_on, amount)
    VALUES ((SELECT id FROM pg_temp.fixture_ids WHERE name = 'workspace_one'), (SELECT id FROM pg_temp.fixture_ids WHERE name = 'book_one'), 'MXN', 'Invalid interval', DATE '2026-02-01', DATE '2026-02-01', 100)$sql$,
    '23514', 'A budget interval must have a later exclusive end'),
  ($sql$INSERT INTO finance.transactions (workspace_id, book_id, currency, kind, amount, source_account_id, occurred_on, description, request_id)
    VALUES ((SELECT id FROM pg_temp.fixture_ids WHERE name = 'workspace_one'), (SELECT id FROM pg_temp.fixture_ids WHERE name = 'book_one'), 'MXN', 'expense', 1, (SELECT id FROM pg_temp.fixture_ids WHERE name = 'account_one'), '2026-02-30'::date, 'Invalid date', gen_random_uuid())$sql$,
    '22008', 'Impossible calendar dates are rejected'),
  ($sql$INSERT INTO health.records (workspace_id, person_id, kind, occurred_on, occurred_at, title, body)
    VALUES ((SELECT id FROM pg_temp.fixture_ids WHERE name = 'workspace_one'), (SELECT id FROM pg_temp.fixture_ids WHERE name = 'person_one'), 'note', DATE '2026-01-10', TIMESTAMPTZ '2026-01-10 12:00:00+00', 'Duplicate precision', 'Both date representations were supplied.')$sql$,
    '23514', 'A clinical event cannot contain both date representations'),
  ($sql$INSERT INTO health.lab_results (workspace_id, person_id, test_name, collected_on, collected_at, result_text)
    VALUES ((SELECT id FROM pg_temp.fixture_ids WHERE name = 'workspace_one'), (SELECT id FROM pg_temp.fixture_ids WHERE name = 'person_one'), 'Test result', DATE '2026-01-10', TIMESTAMPTZ '2026-01-10 12:00:00+00', 'Reported fixture result')$sql$,
    '23514', 'A laboratory result cannot contain both collection date representations'),
  ($sql$INSERT INTO health.medications (workspace_id, person_id, name, starts_on, ends_on)
    VALUES ((SELECT id FROM pg_temp.fixture_ids WHERE name = 'workspace_one'), (SELECT id FROM pg_temp.fixture_ids WHERE name = 'person_one'), 'Reported test medication', DATE '2026-02-01', DATE '2026-01-01')$sql$,
    '23514', 'Medication end dates cannot precede start dates'),
  ($sql$INSERT INTO health.appointments (workspace_id, person_id, starts_at, ends_at, timezone)
    VALUES ((SELECT id FROM pg_temp.fixture_ids WHERE name = 'workspace_one'), (SELECT id FROM pg_temp.fixture_ids WHERE name = 'person_one'), TIMESTAMPTZ '2026-02-01 12:00:00+00', TIMESTAMPTZ '2026-02-01 11:00:00+00', 'UTC')$sql$,
    '23514', 'Appointment end times must be later than start times')
) AS test(statement, expected_state, description);

SELECT throws_ok(test.statement, '23505', NULL::text, test.description)
FROM (VALUES
  ($sql$INSERT INTO core.workspace_members (workspace_id, user_id, role, status, accepted_at)
    VALUES ((SELECT id FROM pg_temp.fixture_ids WHERE name = 'workspace_one'), (SELECT id FROM pg_temp.fixture_ids WHERE name = 'owner_two'), 'owner', 'active', now())$sql$,
    'A workspace cannot have two active owners'),
  ($sql$INSERT INTO core.person_access (workspace_id, person_id, user_id, role)
    VALUES ((SELECT id FROM pg_temp.fixture_ids WHERE name = 'workspace_one'), (SELECT id FROM pg_temp.fixture_ids WHERE name = 'person_one'), (SELECT id FROM pg_temp.fixture_ids WHERE name = 'member_one'), 'owner')$sql$,
    'A person cannot have two active basic owners'),
  ($sql$INSERT INTO finance.book_access (workspace_id, book_id, user_id, role)
    VALUES ((SELECT id FROM pg_temp.fixture_ids WHERE name = 'workspace_one'), (SELECT id FROM pg_temp.fixture_ids WHERE name = 'book_one'), (SELECT id FROM pg_temp.fixture_ids WHERE name = 'member_one'), 'owner')$sql$,
    'A book cannot have two active owners'),
  ($sql$INSERT INTO health.person_access (workspace_id, person_id, user_id, role)
    VALUES ((SELECT id FROM pg_temp.fixture_ids WHERE name = 'workspace_one'), (SELECT id FROM pg_temp.fixture_ids WHERE name = 'person_one'), (SELECT id FROM pg_temp.fixture_ids WHERE name = 'member_one'), 'owner')$sql$,
    'A health scope cannot have two active owners'),
  ($sql$INSERT INTO core.person_user_links (workspace_id, person_id, user_id, verification_method)
    VALUES ((SELECT id FROM pg_temp.fixture_ids WHERE name = 'workspace_one'), (SELECT id FROM pg_temp.fixture_ids WHERE name = 'person_one'), (SELECT id FROM pg_temp.fixture_ids WHERE name = 'member_one'), 'dual_acceptance')$sql$,
    'A person cannot link to two accounts in one workspace'),
  ($sql$INSERT INTO core.person_user_links (workspace_id, person_id, user_id, verification_method)
    VALUES ((SELECT id FROM pg_temp.fixture_ids WHERE name = 'workspace_one'), (SELECT id FROM pg_temp.fixture_ids WHERE name = 'person_two'), (SELECT id FROM pg_temp.fixture_ids WHERE name = 'owner_one'), 'dual_acceptance')$sql$,
    'An account cannot link to two people in one workspace')
) AS test(statement, description);

-- SQL constraints keep relational integrity; Edge Functions will own lifecycle and authorization rules.
SELECT throws_ok(test.statement, test.expected_state, NULL::text, test.description)
FROM (VALUES
  ($sql$UPDATE finance.accounts SET version = 0 WHERE id = (SELECT id FROM pg_temp.fixture_ids WHERE name = 'account_two')$sql$,
    '23514', 'Versions must remain positive integers'),
  ($sql$UPDATE health.files SET size_bytes = 0 WHERE id = (SELECT id FROM pg_temp.fixture_ids WHERE name = 'health_file_one')$sql$,
    '23514', 'Attachments must have a positive declared size'),
  ($sql$UPDATE health.files SET mime_type = 'application/executable' WHERE id = (SELECT id FROM pg_temp.fixture_ids WHERE name = 'health_file_one')$sql$,
    '23514', 'Unsupported attachment MIME types are rejected'),
  ($sql$UPDATE health.files SET object_path = 'outside-scope.pdf' WHERE id = (SELECT id FROM pg_temp.fixture_ids WHERE name = 'health_file_one')$sql$,
    '23514', 'Attachment object paths must match their workspace, subject and identifier'),
  ($sql$INSERT INTO private.operation_receipts (request_id, actor_user_id, operation, status)
    VALUES (gen_random_uuid(), (SELECT id FROM pg_temp.fixture_ids WHERE name = 'owner_one'), 'create_person', 'completed')$sql$,
    '23514', 'Completed operation receipts require a 32-byte payload hash'),
  ($sql$INSERT INTO private.purge_requests (workspace_id, scope, requested_by_user_id, manifest, manifest_hash)
    VALUES ((SELECT id FROM pg_temp.fixture_ids WHERE name = 'workspace_one'), 'person', (SELECT id FROM pg_temp.fixture_ids WHERE name = 'owner_one'), '{}'::jsonb, decode(repeat('00', 32), 'hex'))$sql$,
    '23514', 'A person purge manifest requires the person identifier')
) AS test(statement, expected_state, description);

-- Successful writes follow negative assertions and remain inside the outer rolled-back transaction.
SELECT lives_ok($sql$UPDATE finance.accounts SET name = 'Updated test account'
  WHERE id = (SELECT id FROM pg_temp.fixture_ids WHERE name = 'account_two')$sql$, 'An administrator can update a table without custom triggers');
SELECT is((SELECT version FROM finance.accounts WHERE id = (SELECT id FROM pg_temp.fixture_ids WHERE name = 'account_two')), 1,
          'An ordinary database update does not automatically increment the version');
SELECT lives_ok($sql$UPDATE finance.accounts SET version = 2, updated_at = TIMESTAMPTZ '2026-02-01 12:00:00+00',
  updated_by_user_id = (SELECT id FROM pg_temp.fixture_ids WHERE name = 'owner_one') WHERE id = (SELECT id FROM pg_temp.fixture_ids WHERE name = 'account_two')$sql$,
  'The backend can write version and update metadata explicitly');
SELECT ok((SELECT version = 2 AND updated_at = TIMESTAMPTZ '2026-02-01 12:00:00+00'
  AND updated_by_user_id = (SELECT id FROM pg_temp.fixture_ids WHERE name = 'owner_one') FROM finance.accounts WHERE id = (SELECT id FROM pg_temp.fixture_ids WHERE name = 'account_two')),
  'Explicit version and update metadata are preserved');
SELECT lives_ok($sql$UPDATE finance.accounts SET opening_balance = 101 WHERE id = (SELECT id FROM pg_temp.fixture_ids WHERE name = 'account_one')$sql$,
  'Opening balance locking after a movement is deferred to the backend');
SELECT lives_ok($sql$UPDATE finance.accounts SET opening_balance = -10 WHERE id = (SELECT id FROM pg_temp.fixture_ids WHERE name = 'account_two')$sql$,
  'Finite negative opening balances remain valid at the table level');
SELECT lives_ok($sql$INSERT INTO finance.transactions (workspace_id, book_id, currency, kind, amount, source_account_id, occurred_on, description, request_id)
  VALUES ((SELECT id FROM pg_temp.fixture_ids WHERE name = 'workspace_one'), (SELECT id FROM pg_temp.fixture_ids WHERE name = 'book_one'), 'MXN', 'expense', 1.001,
    (SELECT id FROM pg_temp.fixture_ids WHERE name = 'account_one'), DATE '2026-01-10', 'Backend precision validation fixture', gen_random_uuid())$sql$,
  'Book-specific decimal precision is deferred to the backend; the SQL column supports four places');
SELECT lives_ok($sql$UPDATE finance.transactions SET amount = 20, description = 'Explicit correction fixture'
  WHERE id = (SELECT id FROM pg_temp.fixture_ids WHERE name = 'transaction_one')$sql$, 'Financial history immutability is deferred to the backend');
SELECT lives_ok($sql$UPDATE core.workspace_members SET role = 'member'
  WHERE workspace_id = (SELECT id FROM pg_temp.fixture_ids WHERE name = 'workspace_one') AND user_id = (SELECT id FROM pg_temp.fixture_ids WHERE name = 'owner_one')$sql$,
  'Preventing removal of the last owner is deferred to the backend');
SELECT is((SELECT count(*) FROM core.workspace_members
  WHERE workspace_id = (SELECT id FROM pg_temp.fixture_ids WHERE name = 'workspace_one') AND role = 'owner' AND status = 'active'),
  0::bigint, 'SQL owner indexes enforce at most one owner; requiring an owner belongs to the backend');
SELECT lives_ok($sql$INSERT INTO health.medications (workspace_id, person_id, name)
  VALUES ((SELECT id FROM pg_temp.fixture_ids WHERE name = 'workspace_one'), (SELECT id FROM pg_temp.fixture_ids WHERE name = 'person_one'), 'Reported medication only')$sql$,
  'An unspecified medication does not require invented instructions or dates');
SELECT lives_ok($sql$INSERT INTO health.lab_results (workspace_id, person_id, test_name, result_text)
  VALUES ((SELECT id FROM pg_temp.fixture_ids WHERE name = 'workspace_one'), (SELECT id FROM pg_temp.fixture_ids WHERE name = 'person_one'), 'Undated test', 'Reported fixture value')$sql$,
  'A laboratory result may have an unknown collection date');

-- Auth foreign-key cleanup remains a native table relationship, without a custom trigger.
INSERT INTO health.records (id, workspace_id, person_id, kind, title, body, created_by_user_id,
  updated_by_user_id, archived_by_user_id, created_at, updated_at, archived_at, version)
VALUES ((SELECT id FROM pg_temp.fixture_ids WHERE name = 'historical_record'), (SELECT id FROM pg_temp.fixture_ids WHERE name = 'workspace_one'), (SELECT id FROM pg_temp.fixture_ids WHERE name = 'person_one'),
  'note', 'Historical actor test', 'A manually attributed archived note.', (SELECT id FROM pg_temp.fixture_ids WHERE name = 'member_one'),
  (SELECT id FROM pg_temp.fixture_ids WHERE name = 'owner_one'), (SELECT id FROM pg_temp.fixture_ids WHERE name = 'owner_one'), TIMESTAMPTZ '2026-01-01 00:00:00+00',
  TIMESTAMPTZ '2026-01-02 00:00:00+00', TIMESTAMPTZ '2026-01-03 00:00:00+00', 42);
DELETE FROM core.workspace_members
WHERE workspace_id = (SELECT id FROM pg_temp.fixture_ids WHERE name = 'workspace_one') AND user_id = (SELECT id FROM pg_temp.fixture_ids WHERE name = 'member_one');
DELETE FROM auth.users WHERE id = (SELECT id FROM pg_temp.fixture_ids WHERE name = 'member_one');
SELECT ok((SELECT created_by_user_id IS NULL AND updated_by_user_id = (SELECT id FROM pg_temp.fixture_ids WHERE name = 'owner_one')
  AND archived_by_user_id = (SELECT id FROM pg_temp.fixture_ids WHERE name = 'owner_one') AND version = 42
  AND created_at = TIMESTAMPTZ '2026-01-01 00:00:00+00' AND updated_at = TIMESTAMPTZ '2026-01-02 00:00:00+00'
  AND archived_at = TIMESTAMPTZ '2026-01-03 00:00:00+00' AND body = 'A manually attributed archived note.'
  FROM health.records WHERE id = (SELECT id FROM pg_temp.fixture_ids WHERE name = 'historical_record')),
  'Auth deletion nulls the historical creator while preserving other actors, metadata and content');
SELECT ok(NOT EXISTS (SELECT 1 FROM auth.users WHERE id = (SELECT id FROM pg_temp.fixture_ids WHERE name = 'member_one')),
  'The deleted test account remains absent until the outer transaction is rolled back');

SELECT * FROM finish();
ROLLBACK;
