-- Declarative definition: apps/supabase/schemas/app/tables/categories.sql.
-- Income or expense labels with an optional one-level text group such as "Hogar".

CREATE TABLE app.categories (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES app.workspaces(id) ON DELETE RESTRICT,
    name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 100),
    group_name text CHECK (group_name IS NULL OR char_length(btrim(group_name)) BETWEEN 1 AND 100),
    kind text NOT NULL CHECK (kind IN ('income', 'expense')),
    archived_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (workspace_id, id)
);

CREATE UNIQUE INDEX categories_active_name_idx ON app.categories (workspace_id, kind, lower(name)) WHERE archived_at IS NULL;

ALTER TABLE app.categories ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE app.categories FROM PUBLIC, anon, authenticated, service_role;
