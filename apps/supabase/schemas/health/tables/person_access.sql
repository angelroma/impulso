-- Declarative definition: apps/supabase/schemas/health/tables/person_access.sql.

CREATE TABLE health.person_access (
    workspace_id uuid NOT NULL,
    person_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role text NOT NULL CHECK (role IN ('owner', 'editor', 'viewer')),
    granted_at timestamptz NOT NULL DEFAULT now(),
    granted_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    revoked_at timestamptz,
    revoked_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    version integer NOT NULL DEFAULT 1 CHECK (version > 0),
    PRIMARY KEY (workspace_id, person_id, user_id),
    FOREIGN KEY (workspace_id, person_id) REFERENCES core.people(workspace_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (workspace_id, user_id) REFERENCES core.workspace_members(workspace_id, user_id) ON DELETE RESTRICT,
    CHECK (revoked_at IS NOT NULL OR revoked_by_user_id IS NULL)
);

CREATE UNIQUE INDEX person_access_one_owner_idx ON health.person_access (workspace_id, person_id) WHERE role = 'owner' AND revoked_at IS NULL;

CREATE INDEX person_access_user_scope_idx ON health.person_access (user_id, workspace_id, person_id);

CREATE INDEX person_access_member_fk_idx ON health.person_access (workspace_id, user_id);

CREATE INDEX person_access_granted_by_user_idx ON health.person_access (granted_by_user_id);

CREATE INDEX person_access_revoked_by_user_idx ON health.person_access (revoked_by_user_id);

ALTER TABLE health.person_access ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE health.person_access FROM PUBLIC, anon, authenticated, service_role;
