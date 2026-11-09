-- Declarative definition: apps/supabase/schemas/app/tables/transactions.sql.
-- One row per income, expense or transfer. Rows are editable; deleted_at is a restorable soft delete.
-- Composite keys keep every reference inside the row's workspace. They are deferrable so an
-- account and its transactions can move to another workspace inside one transaction.

CREATE TABLE app.transactions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES app.workspaces(id) ON DELETE RESTRICT,
    account_id uuid NOT NULL,
    to_account_id uuid,
    kind text NOT NULL CHECK (kind IN ('income', 'expense', 'transfer')),
    amount numeric(14,2) NOT NULL CHECK (amount > 0),
    occurred_on date NOT NULL,
    payee_id uuid,
    category_id uuid,
    project_id uuid,
    notes text CHECK (notes IS NULL OR char_length(notes) <= 2000),
    request_id uuid NOT NULL UNIQUE,
    deleted_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (workspace_id, account_id) REFERENCES app.accounts(workspace_id, id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE,
    FOREIGN KEY (workspace_id, to_account_id) REFERENCES app.accounts(workspace_id, id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE,
    FOREIGN KEY (workspace_id, payee_id) REFERENCES app.payees(workspace_id, id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE,
    FOREIGN KEY (workspace_id, category_id) REFERENCES app.categories(workspace_id, id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE,
    FOREIGN KEY (workspace_id, project_id) REFERENCES app.projects(workspace_id, id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE,
    CHECK ((kind = 'transfer') = (to_account_id IS NOT NULL)),
    CHECK (to_account_id IS NULL OR to_account_id <> account_id),
    CHECK (kind <> 'transfer' OR category_id IS NULL)
);

CREATE INDEX transactions_workspace_date_idx ON app.transactions (workspace_id, occurred_on DESC, id);

CREATE INDEX transactions_account_idx ON app.transactions (workspace_id, account_id);

CREATE INDEX transactions_to_account_idx ON app.transactions (workspace_id, to_account_id) WHERE to_account_id IS NOT NULL;

CREATE INDEX transactions_payee_idx ON app.transactions (workspace_id, payee_id) WHERE payee_id IS NOT NULL;

CREATE INDEX transactions_category_idx ON app.transactions (workspace_id, category_id) WHERE category_id IS NOT NULL;

CREATE INDEX transactions_project_idx ON app.transactions (workspace_id, project_id) WHERE project_id IS NOT NULL;

ALTER TABLE app.transactions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE app.transactions FROM PUBLIC, anon, authenticated, service_role;
