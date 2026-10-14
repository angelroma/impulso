-- Declarative definition: apps/supabase/schemas/finance/tables/transaction_classifications.sql.

CREATE TABLE finance.transaction_classifications (
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
    transaction_id uuid NOT NULL,
    kind text NOT NULL CHECK (kind IN ('income', 'expense', 'transfer')),
    category_id uuid,
    group_id uuid,
    group_position smallint,
    UNIQUE (workspace_id, book_id, transaction_id),
    UNIQUE (workspace_id, book_id, group_id, group_position),
    FOREIGN KEY (workspace_id, book_id, transaction_id, currency, kind) REFERENCES finance.transactions(workspace_id, book_id, id, currency, kind) ON DELETE RESTRICT,
    FOREIGN KEY (workspace_id, book_id, category_id, currency, kind) REFERENCES finance.categories(workspace_id, book_id, id, currency, kind) ON DELETE RESTRICT,
    FOREIGN KEY (workspace_id, book_id, group_id, currency) REFERENCES finance.transaction_groups(workspace_id, book_id, id, currency) ON DELETE RESTRICT,
    CHECK (kind <> 'transfer' OR category_id IS NULL),
    CHECK ((group_id IS NULL AND group_position IS NULL) OR (group_id IS NOT NULL AND group_position IS NOT NULL AND group_position BETWEEN 1 AND 10))
);

CREATE INDEX transaction_classifications_created_by_user_id_idx ON finance.transaction_classifications (created_by_user_id);

CREATE INDEX transaction_classifications_updated_by_user_id_idx ON finance.transaction_classifications (updated_by_user_id);

CREATE INDEX transaction_classifications_book_created_at_idx ON finance.transaction_classifications (workspace_id, book_id, created_at, id);

CREATE INDEX transaction_classifications_category_fk_idx ON finance.transaction_classifications (workspace_id, book_id, category_id, currency, kind);

ALTER TABLE finance.transaction_classifications ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE finance.transaction_classifications FROM PUBLIC, anon, authenticated, service_role;

