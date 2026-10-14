-- Declarative definition: apps/supabase/schemas/core/tables/people.sql.

CREATE TABLE core.people (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES core.workspaces(id) ON DELETE RESTRICT,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    version integer NOT NULL DEFAULT 1 CHECK (version > 0),
    archived_at timestamptz,
    archived_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    CHECK (archived_at IS NOT NULL OR archived_by_user_id IS NULL),
    UNIQUE (workspace_id, id),
    display_name text NOT NULL,
    CHECK (char_length(btrim(display_name)) > 0 AND char_length(display_name) <= 200)
);

CREATE INDEX people_created_by_user_idx ON core.people (created_by_user_id);

CREATE INDEX people_updated_by_user_idx ON core.people (updated_by_user_id);

CREATE INDEX people_archived_by_user_idx ON core.people (archived_by_user_id);

CREATE INDEX people_name_idx ON core.people (workspace_id, display_name, id);

CREATE INDEX people_created_at_idx ON core.people (workspace_id, created_at, id);

ALTER TABLE core.people ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE core.people FROM PUBLIC, anon, authenticated, service_role;
