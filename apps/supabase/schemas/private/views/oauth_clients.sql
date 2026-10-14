-- Declarative definition: apps/supabase/schemas/private/views/oauth_clients.sql.

CREATE VIEW private.oauth_clients WITH (security_invoker = false) AS
SELECT id, deleted_at FROM auth.oauth_clients;

ALTER VIEW private.oauth_clients OWNER TO postgres;

REVOKE ALL ON TABLE private.oauth_clients FROM PUBLIC, anon, authenticated, service_role;
