-- Private column projections bridge managed Auth ACLs without changing Auth objects or privileges.
-- View-owner checks retain native row locks on auth.users and auth.sessions.

CREATE VIEW private.auth_users WITH (security_invoker = false) AS
SELECT id, updated_at FROM auth.users;
ALTER VIEW private.auth_users OWNER TO postgres;

CREATE VIEW private.auth_sessions WITH (security_invoker = false) AS
SELECT id, user_id, not_after, updated_at, oauth_client_id, scopes FROM auth.sessions;
ALTER VIEW private.auth_sessions OWNER TO postgres;

CREATE VIEW private.oauth_clients WITH (security_invoker = false) AS
SELECT id, deleted_at FROM auth.oauth_clients;
ALTER VIEW private.oauth_clients OWNER TO postgres;

CREATE VIEW private.oauth_consents WITH (security_invoker = false) AS
SELECT user_id, client_id, scopes, revoked_at FROM auth.oauth_consents;
ALTER VIEW private.oauth_consents OWNER TO postgres;

REVOKE ALL ON TABLE private.auth_users, private.auth_sessions, private.oauth_clients, private.oauth_consents
FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT (id), UPDATE (updated_at) ON TABLE private.auth_users TO impulso_backend;
GRANT SELECT (id, user_id, not_after, oauth_client_id, scopes), UPDATE (updated_at)
ON TABLE private.auth_sessions TO impulso_backend;
GRANT SELECT (id, deleted_at) ON TABLE private.oauth_clients TO impulso_backend;
GRANT SELECT (user_id, client_id, scopes, revoked_at)
ON TABLE private.oauth_consents TO impulso_backend;
