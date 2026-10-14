-- Declarative definition: apps/supabase/schemas/finance/tables/goal_allocations.sql.

CREATE TABLE finance.goal_allocations (
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
    goal_id uuid NOT NULL,
    account_id uuid NOT NULL,
    amount numeric(20,4) NOT NULL CHECK (amount > 0 AND amount < 'Infinity'::numeric),
    funding_basis text NOT NULL CHECK (funding_basis IN ('ledger', 'valuation')),
    valuation_id uuid,
    revoked_at timestamptz,
    revoked_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    CHECK (revoked_at IS NOT NULL OR revoked_by_user_id IS NULL),
    CHECK ((funding_basis = 'ledger' AND valuation_id IS NULL) OR (funding_basis = 'valuation' AND valuation_id IS NOT NULL)),
    FOREIGN KEY (workspace_id, book_id, goal_id, currency) REFERENCES finance.savings_goals(workspace_id, book_id, id, currency) ON DELETE RESTRICT,
    FOREIGN KEY (workspace_id, book_id, account_id, currency) REFERENCES finance.accounts(workspace_id, book_id, id, currency) ON DELETE RESTRICT,
    FOREIGN KEY (workspace_id, book_id, valuation_id, account_id, currency) REFERENCES finance.asset_valuations(workspace_id, book_id, id, account_id, currency) ON DELETE RESTRICT
);

CREATE INDEX goal_allocations_created_by_user_id_idx ON finance.goal_allocations (created_by_user_id);

CREATE INDEX goal_allocations_updated_by_user_id_idx ON finance.goal_allocations (updated_by_user_id);

CREATE INDEX goal_allocations_revoked_by_user_id_idx ON finance.goal_allocations (revoked_by_user_id);

CREATE INDEX goal_allocations_book_created_at_idx ON finance.goal_allocations (workspace_id, book_id, created_at, id);

CREATE INDEX goal_allocations_resource_1_fk_idx ON finance.goal_allocations (workspace_id, book_id, goal_id, currency);

CREATE INDEX goal_allocations_resource_2_fk_idx ON finance.goal_allocations (workspace_id, book_id, account_id, currency);

CREATE INDEX goal_allocations_resource_3_fk_idx ON finance.goal_allocations (workspace_id, book_id, valuation_id, account_id, currency);

CREATE UNIQUE INDEX goal_allocations_active_match_idx ON finance.goal_allocations (workspace_id, book_id, goal_id, account_id) WHERE revoked_at IS NULL;

ALTER TABLE finance.goal_allocations ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE finance.goal_allocations FROM PUBLIC, anon, authenticated, service_role;

