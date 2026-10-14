-- Declarative definition: apps/supabase/schemas/finance/tables/asset_valuations.sql.

CREATE TABLE finance.asset_valuations (
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
    asset_id uuid,
    account_id uuid,
    valued_on date NOT NULL CHECK (valued_on BETWEEN DATE '0001-01-01' AND DATE '9999-12-31'),
    amount numeric(20,4) NOT NULL CHECK (amount >= 0 AND amount < 'Infinity'::numeric),
    source text NOT NULL CHECK (char_length(btrim(source)) > 0 AND char_length(source) <= 2000),
    replaces_valuation_id uuid,
    retired_at timestamptz,
    retired_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    CHECK (retired_at IS NOT NULL OR retired_by_user_id IS NULL),
    CHECK (num_nonnulls(asset_id, account_id) = 1),
    CHECK (replaces_valuation_id IS NULL OR replaces_valuation_id <> id),
    UNIQUE (workspace_id, book_id, id, account_id, currency),
    FOREIGN KEY (workspace_id, book_id, asset_id, currency) REFERENCES finance.assets(workspace_id, book_id, id, currency) ON DELETE RESTRICT,
    FOREIGN KEY (workspace_id, book_id, account_id, currency) REFERENCES finance.accounts(workspace_id, book_id, id, currency) ON DELETE RESTRICT,
    FOREIGN KEY (workspace_id, book_id, replaces_valuation_id, currency) REFERENCES finance.asset_valuations(workspace_id, book_id, id, currency) ON DELETE RESTRICT
);

CREATE INDEX asset_valuations_created_by_user_id_idx ON finance.asset_valuations (created_by_user_id);

CREATE INDEX asset_valuations_updated_by_user_id_idx ON finance.asset_valuations (updated_by_user_id);

CREATE INDEX asset_valuations_retired_by_user_id_idx ON finance.asset_valuations (retired_by_user_id);

CREATE INDEX asset_valuations_book_created_at_idx ON finance.asset_valuations (workspace_id, book_id, created_at, id);

CREATE INDEX asset_valuations_resource_1_fk_idx ON finance.asset_valuations (workspace_id, book_id, asset_id, currency);

CREATE INDEX asset_valuations_resource_2_fk_idx ON finance.asset_valuations (workspace_id, book_id, account_id, currency);

CREATE INDEX asset_valuations_resource_3_fk_idx ON finance.asset_valuations (workspace_id, book_id, replaces_valuation_id, currency);

CREATE UNIQUE INDEX asset_valuations_active_asset_date_idx ON finance.asset_valuations (workspace_id, book_id, asset_id, valued_on) WHERE retired_at IS NULL AND asset_id IS NOT NULL;

CREATE UNIQUE INDEX asset_valuations_active_account_date_idx ON finance.asset_valuations (workspace_id, book_id, account_id, valued_on) WHERE retired_at IS NULL AND account_id IS NOT NULL;

CREATE UNIQUE INDEX asset_valuations_one_replacement_idx ON finance.asset_valuations (workspace_id, book_id, replaces_valuation_id) WHERE replaces_valuation_id IS NOT NULL;

ALTER TABLE finance.asset_valuations ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE finance.asset_valuations FROM PUBLIC, anon, authenticated, service_role;

