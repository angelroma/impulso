-- Client access remains closed; Edge Functions authorize every application operation.

REVOKE ALL ON SCHEMA core, finance, health, api, audit, private FROM PUBLIC, anon, authenticated, service_role;

GRANT USAGE ON SCHEMA api TO anon, authenticated, service_role;

REVOKE ALL ON ALL SEQUENCES IN SCHEMA core, finance, health, api, audit, private FROM PUBLIC, anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA core, finance, health, api, audit, private REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA core, finance, health, api, audit, private REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA core, finance, health, api, audit, private REVOKE ALL ON SEQUENCES FROM PUBLIC, anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA core, finance, health, api, audit, private REVOKE ALL ON SEQUENCES FROM PUBLIC, anon, authenticated, service_role;

GRANT USAGE ON SCHEMA core, audit, private TO impulso_backend;

GRANT SELECT, INSERT ON TABLE
    core.workspaces,
    core.workspace_members,
    core.people,
    core.person_user_links,
    core.person_access,
    core.person_aliases
TO impulso_backend;

-- Native SELECT row locks require UPDATE on at least one column of each locked table.
GRANT UPDATE (updated_at) ON TABLE core.workspaces TO impulso_backend;
GRANT UPDATE (updated_at) ON TABLE core.workspace_members TO impulso_backend;
GRANT UPDATE (updated_at) ON TABLE core.people TO impulso_backend;
GRANT UPDATE (verified_at) ON TABLE core.person_user_links TO impulso_backend;
GRANT UPDATE (granted_at) ON TABLE core.person_access TO impulso_backend;

GRANT INSERT ON TABLE audit.events TO impulso_backend;
GRANT SELECT, INSERT ON TABLE private.operation_receipts TO impulso_backend;
GRANT SELECT ON TABLE private.purge_requests TO impulso_backend;

-- Owner-checked projections expose only Auth identifiers and grant state; locks reach base rows.
GRANT SELECT (id), UPDATE (updated_at) ON TABLE private.auth_users TO impulso_backend;
GRANT SELECT (id, user_id, not_after, oauth_client_id, scopes), UPDATE (updated_at)
ON TABLE private.auth_sessions TO impulso_backend;
GRANT SELECT (id, deleted_at) ON TABLE private.oauth_clients TO impulso_backend;
GRANT SELECT (user_id, client_id, scopes, revoked_at)
ON TABLE private.oauth_consents TO impulso_backend;

-- Environment-specific login credentials are provisioned separately.

