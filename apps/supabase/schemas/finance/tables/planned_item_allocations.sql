-- Declarative definition: apps/supabase/schemas/finance/tables/planned_item_allocations.sql.

CREATE TABLE finance.planned_item_allocations (
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
    planned_item_id uuid NOT NULL,
    planned_item_line_id uuid NOT NULL,
    transaction_id uuid NOT NULL,
    kind text NOT NULL CHECK (kind IN ('income', 'expense', 'transfer')),
    amount numeric(20,4) NOT NULL CHECK (amount > 0 AND amount < 'Infinity'::numeric),
    revoked_at timestamptz,
    revoked_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    CHECK (revoked_at IS NOT NULL OR revoked_by_user_id IS NULL),
    FOREIGN KEY (workspace_id, book_id, planned_item_id, planned_item_line_id, currency, kind) REFERENCES finance.planned_item_lines(workspace_id, book_id, planned_item_id, id, currency, kind) ON DELETE RESTRICT,
    FOREIGN KEY (workspace_id, book_id, transaction_id, currency, kind) REFERENCES finance.transactions(workspace_id, book_id, id, currency, kind) ON DELETE RESTRICT
);

CREATE INDEX planned_item_allocations_created_by_user_id_idx ON finance.planned_item_allocations (created_by_user_id);

CREATE INDEX planned_item_allocations_updated_by_user_id_idx ON finance.planned_item_allocations (updated_by_user_id);

CREATE INDEX planned_item_allocations_revoked_by_user_id_idx ON finance.planned_item_allocations (revoked_by_user_id);

CREATE INDEX planned_item_allocations_book_created_at_idx ON finance.planned_item_allocations (workspace_id, book_id, created_at, id);

CREATE INDEX planned_item_allocations_resource_1_fk_idx ON finance.planned_item_allocations (workspace_id, book_id, planned_item_id, planned_item_line_id, currency, kind);

CREATE INDEX planned_item_allocations_resource_2_fk_idx ON finance.planned_item_allocations (workspace_id, book_id, transaction_id, currency, kind);

CREATE UNIQUE INDEX planned_item_allocations_active_match_idx ON finance.planned_item_allocations (workspace_id, book_id, planned_item_line_id, transaction_id) WHERE revoked_at IS NULL;

ALTER TABLE finance.planned_item_allocations ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE finance.planned_item_allocations FROM PUBLIC, anon, authenticated, service_role;

