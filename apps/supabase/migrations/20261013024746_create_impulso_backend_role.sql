BEGIN;

-- Roles survive some reset paths; this anonymous block only creates infrastructure when absent.
DO $infrastructure$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'impulso_backend') THEN
        CREATE ROLE impulso_backend
            NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION BYPASSRLS;
    END IF;
END;
$infrastructure$;

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

-- Auth owner grants and environment-specific login credentials are provisioned separately.
COMMIT;
