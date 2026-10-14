-- Declarative definition: apps/supabase/schemas/finance/tables/categories.sql.

CREATE TABLE finance.categories (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES core.workspaces(id) ON DELETE RESTRICT,
    book_id uuid NOT NULL,
    currency text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    version integer NOT NULL DEFAULT 1 CHECK (version > 0),
    UNIQUE (workspace_id, book_id, id, currency),
    FOREIGN KEY (workspace_id, book_id, currency) REFERENCES finance.books(workspace_id, id, currency) ON DELETE RESTRICT,
    kind text NOT NULL CHECK (kind IN ('income', 'expense')),
    name text NOT NULL CHECK (char_length(btrim(name)) > 0 AND char_length(name) <= 200),
    archived_at timestamptz,
    archived_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    CHECK (archived_at IS NOT NULL OR archived_by_user_id IS NULL),
    UNIQUE (workspace_id, book_id, id, currency, kind)
);

CREATE INDEX categories_created_by_user_id_idx ON finance.categories (created_by_user_id);

CREATE INDEX categories_updated_by_user_id_idx ON finance.categories (updated_by_user_id);

CREATE INDEX categories_archived_by_user_id_idx ON finance.categories (archived_by_user_id);

CREATE INDEX categories_book_created_at_idx ON finance.categories (workspace_id, book_id, created_at, id);

ALTER TABLE finance.categories ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE finance.categories FROM PUBLIC, anon, authenticated, service_role;

