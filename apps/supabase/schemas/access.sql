-- Client access remains closed; Edge Functions authorize every application operation.

REVOKE ALL ON SCHEMA app, api, private FROM PUBLIC, anon, authenticated, service_role;

GRANT USAGE ON SCHEMA api TO anon, authenticated, service_role;

REVOKE ALL ON ALL SEQUENCES IN SCHEMA app, api, private FROM PUBLIC, anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA app, api, private REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA app, api, private REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA app, api, private REVOKE ALL ON SEQUENCES FROM PUBLIC, anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA app, api, private REVOKE ALL ON SEQUENCES FROM PUBLIC, anon, authenticated, service_role;

GRANT USAGE ON SCHEMA app, private TO impulso_backend;

-- Records are editable; removal is a soft delete or archive, so the backend never receives DELETE.
GRANT SELECT, INSERT, UPDATE ON TABLE
    app.workspaces,
    app.accounts,
    app.categories,
    app.payees,
    app.projects,
    app.transactions
TO impulso_backend;

-- Owner-checked projections expose only Auth identifiers and grant state; locks reach base rows.
GRANT SELECT (id), UPDATE (updated_at) ON TABLE private.auth_users TO impulso_backend;
GRANT SELECT (id, user_id, not_after, oauth_client_id, scopes), UPDATE (updated_at)
ON TABLE private.auth_sessions TO impulso_backend;
GRANT SELECT (id, deleted_at) ON TABLE private.oauth_clients TO impulso_backend;
GRANT SELECT (user_id, client_id, scopes, revoked_at)
ON TABLE private.oauth_consents TO impulso_backend;

-- Environment-specific login credentials are provisioned separately.
