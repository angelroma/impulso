-- Declarative definition: apps/supabase/schemas/private/views/oauth_consents.sql.

CREATE VIEW private.oauth_consents WITH (security_invoker = false) AS
SELECT user_id, client_id, scopes, revoked_at FROM auth.oauth_consents;

ALTER VIEW private.oauth_consents OWNER TO postgres;

REVOKE ALL ON TABLE private.oauth_consents FROM PUBLIC, anon, authenticated, service_role;
