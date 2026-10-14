-- Declarative definition: apps/supabase/schemas/private/views/auth_sessions.sql.

CREATE VIEW private.auth_sessions WITH (security_invoker = false) AS
SELECT id, user_id, not_after, updated_at, oauth_client_id, scopes FROM auth.sessions;

ALTER VIEW private.auth_sessions OWNER TO postgres;

REVOKE ALL ON TABLE private.auth_sessions FROM PUBLIC, anon, authenticated, service_role;
