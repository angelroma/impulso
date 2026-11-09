-- Declarative definition: apps/supabase/schemas/app/tables/payees.sql.
-- Who was paid or who paid; the default category lets a known payee skip categorization questions.

CREATE TABLE app.payees (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES app.workspaces(id) ON DELETE RESTRICT,
    name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 100),
    default_category_id uuid,
    archived_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (workspace_id, id),
    FOREIGN KEY (workspace_id, default_category_id) REFERENCES app.categories(workspace_id, id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE
);

CREATE UNIQUE INDEX payees_active_name_idx ON app.payees (workspace_id, lower(name)) WHERE archived_at IS NULL;

CREATE INDEX payees_default_category_idx ON app.payees (workspace_id, default_category_id);

ALTER TABLE app.payees ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE app.payees FROM PUBLIC, anon, authenticated, service_role;
