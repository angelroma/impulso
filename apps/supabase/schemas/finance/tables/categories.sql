-- Declarative definition: apps/supabase/schemas/finance/tables/categories.sql.
-- Income or expense labels. A category is general ("Suscripciones"); who was paid is a payee.
-- parent_id makes it a subcategory of a top-level category of the same kind ("Vivienda" > "Renta").

CREATE TABLE finance.categories (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES finance.workspaces(id) ON DELETE RESTRICT,
    name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 100),
    parent_id uuid,
    kind text NOT NULL CHECK (kind IN ('income', 'expense')),
    archived_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (workspace_id, id),
    UNIQUE (workspace_id, id, kind),
    FOREIGN KEY (workspace_id, parent_id, kind) REFERENCES finance.categories(workspace_id, id, kind) ON DELETE RESTRICT,
    CHECK (parent_id IS NULL OR parent_id <> id)
);

CREATE INDEX categories_parent_idx ON finance.categories (workspace_id, parent_id) WHERE parent_id IS NOT NULL;

CREATE UNIQUE INDEX categories_active_name_idx ON finance.categories (workspace_id, kind, lower(name)) WHERE archived_at IS NULL;

ALTER TABLE finance.categories ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE finance.categories FROM PUBLIC, anon, authenticated, service_role;
