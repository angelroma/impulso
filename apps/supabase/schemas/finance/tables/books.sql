-- Declarative definition: apps/supabase/schemas/finance/tables/books.sql.

CREATE TABLE finance.books (
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
    name text NOT NULL,
    currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
    minor_unit smallint NOT NULL CHECK (minor_unit BETWEEN 0 AND 4),
    UNIQUE (workspace_id, id, currency),
    CHECK (char_length(btrim(name)) > 0 AND char_length(name) <= 200)
);

CREATE INDEX books_created_by_user_idx ON finance.books (created_by_user_id);

CREATE INDEX books_updated_by_user_idx ON finance.books (updated_by_user_id);

CREATE INDEX books_archived_by_user_idx ON finance.books (archived_by_user_id);

CREATE INDEX books_created_at_idx ON finance.books (workspace_id, created_at, id);

ALTER TABLE finance.books ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE finance.books FROM PUBLIC, anon, authenticated, service_role;
