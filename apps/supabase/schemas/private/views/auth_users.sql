-- Declarative definition: apps/supabase/schemas/private/views/auth_users.sql.

CREATE VIEW private.auth_users WITH (security_invoker = false) AS
SELECT id, updated_at FROM auth.users;

ALTER VIEW private.auth_users OWNER TO postgres;

REVOKE ALL ON TABLE private.auth_users FROM PUBLIC, anon, authenticated, service_role;
