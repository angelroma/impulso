-- Declarative definition: apps/supabase/schemas/app/tables/projects.sql.
-- Cross-category buckets such as "Viaje Japón"; spent and remaining are computed from transactions.

CREATE TABLE app.projects (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES app.workspaces(id) ON DELETE RESTRICT,
    name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 100),
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed')),
    budget numeric(14,2) CHECK (budget IS NULL OR budget > 0),
    start_date date,
    end_date date,
    notes text CHECK (notes IS NULL OR char_length(notes) <= 2000),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (workspace_id, id),
    CHECK (start_date IS NULL OR end_date IS NULL OR end_date >= start_date)
);

CREATE UNIQUE INDEX projects_name_idx ON app.projects (workspace_id, lower(name));

ALTER TABLE app.projects ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE app.projects FROM PUBLIC, anon, authenticated, service_role;
