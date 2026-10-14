-- Declarative definition: apps/supabase/schemas/finance/tables/transaction_groups.sql.

CREATE TABLE finance.transaction_groups (
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
    request_id uuid NOT NULL,
    description text NOT NULL CHECK (char_length(btrim(description)) > 0 AND char_length(description) <= 2000),
    UNIQUE (workspace_id, book_id, request_id)
);

CREATE INDEX transaction_groups_created_by_user_id_idx ON finance.transaction_groups (created_by_user_id);

CREATE INDEX transaction_groups_updated_by_user_id_idx ON finance.transaction_groups (updated_by_user_id);

CREATE INDEX transaction_groups_book_created_at_idx ON finance.transaction_groups (workspace_id, book_id, created_at, id);

ALTER TABLE finance.transaction_groups ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE finance.transaction_groups FROM PUBLIC, anon, authenticated, service_role;

