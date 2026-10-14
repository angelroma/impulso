-- Declarative definition: apps/supabase/schemas/core/tables/workspace_members.sql.

CREATE TABLE core.workspace_members (
    workspace_id uuid NOT NULL REFERENCES core.workspaces(id) ON DELETE RESTRICT,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    role text NOT NULL CHECK (role IN ('owner', 'member')),
    status text NOT NULL CHECK (status IN ('invited', 'active', 'revoked')),
    invited_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    invited_at timestamptz,
    invite_expires_at timestamptz,
    accepted_at timestamptz,
    revoked_at timestamptz,
    revoked_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    version integer NOT NULL DEFAULT 1 CHECK (version > 0),
    PRIMARY KEY (workspace_id, user_id),
    CHECK ((invited_at IS NULL) = (invite_expires_at IS NULL)),
    CHECK (invite_expires_at IS NULL OR invite_expires_at > invited_at),
    CHECK ((status = 'invited' AND invited_at IS NOT NULL AND accepted_at IS NULL AND revoked_at IS NULL) OR (status = 'active' AND accepted_at IS NOT NULL AND revoked_at IS NULL) OR (status = 'revoked' AND revoked_at IS NOT NULL)),
    CHECK (revoked_at IS NOT NULL OR revoked_by_user_id IS NULL)
);

CREATE UNIQUE INDEX workspace_members_one_owner_idx ON core.workspace_members (workspace_id) WHERE role = 'owner' AND status = 'active';

CREATE INDEX workspace_members_user_status_idx ON core.workspace_members (user_id, status, workspace_id);

CREATE INDEX workspace_members_invited_by_user_idx ON core.workspace_members (invited_by_user_id);

CREATE INDEX workspace_members_revoked_by_user_idx ON core.workspace_members (revoked_by_user_id);

ALTER TABLE core.workspace_members ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE core.workspace_members FROM PUBLIC, anon, authenticated, service_role;
