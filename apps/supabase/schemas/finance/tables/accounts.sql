-- Declarative definition: apps/supabase/schemas/finance/tables/accounts.sql.
-- Accounts can be renamed and moved to another workspace together with their transactions.

CREATE TABLE finance.accounts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES finance.workspaces(id) ON DELETE RESTRICT,
    name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 100),
    type text NOT NULL DEFAULT 'checking' REFERENCES finance.account_types(code) ON DELETE RESTRICT,
    currency text NOT NULL REFERENCES finance.currencies(code) ON DELETE RESTRICT,
    opening_balance numeric(14,2) NOT NULL DEFAULT 0,
    is_default boolean NOT NULL DEFAULT false,
    archived_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (workspace_id, id),
    CHECK (NOT (is_default AND archived_at IS NOT NULL))
);

CREATE UNIQUE INDEX accounts_one_default_idx ON finance.accounts (workspace_id) WHERE is_default;

CREATE UNIQUE INDEX accounts_active_name_idx ON finance.accounts (workspace_id, lower(name)) WHERE archived_at IS NULL;

ALTER TABLE finance.accounts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE finance.accounts FROM PUBLIC, anon, authenticated, service_role;
