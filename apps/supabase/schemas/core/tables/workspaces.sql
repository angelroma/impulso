-- Declarative definition: apps/supabase/schemas/core/tables/workspaces.sql.

CREATE TABLE core.workspaces (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    version integer NOT NULL DEFAULT 1 CHECK (version > 0),
    archived_at timestamptz,
    archived_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    CHECK (archived_at IS NOT NULL OR archived_by_user_id IS NULL),
    name text NOT NULL,
    timezone text NOT NULL,
    UNIQUE (created_by_user_id),
    CHECK (char_length(btrim(name)) > 0 AND char_length(name) <= 200),
    CHECK (char_length(btrim(timezone)) > 0 AND char_length(timezone) <= 200)
);

CREATE INDEX workspaces_updated_by_user_idx ON core.workspaces (updated_by_user_id);

CREATE INDEX workspaces_archived_by_user_idx ON core.workspaces (archived_by_user_id);

ALTER TABLE core.workspaces ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE core.workspaces FROM PUBLIC, anon, authenticated, service_role;
