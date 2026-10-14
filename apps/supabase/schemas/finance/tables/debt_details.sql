-- Declarative definition: apps/supabase/schemas/finance/tables/debt_details.sql.

CREATE TABLE finance.debt_details (
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
    account_id uuid NOT NULL,
    creditor text CHECK (char_length(btrim(creditor)) > 0 AND char_length(creditor) <= 200),
    credit_limit numeric(20,4) CHECK (credit_limit >= 0 AND credit_limit < 'Infinity'::numeric),
    annual_rate numeric(20,4) CHECK (annual_rate >= 0 AND annual_rate < 'Infinity'::numeric),
    minimum_payment numeric(20,4) CHECK (minimum_payment >= 0 AND minimum_payment < 'Infinity'::numeric),
    statement_day smallint CHECK (statement_day BETWEEN 1 AND 31),
    due_day smallint CHECK (due_day BETWEEN 1 AND 31),
    payment_terms text CHECK (char_length(btrim(payment_terms)) > 0 AND char_length(payment_terms) <= 2000),
    UNIQUE (workspace_id, book_id, account_id, currency),
    FOREIGN KEY (workspace_id, book_id, account_id, currency) REFERENCES finance.accounts(workspace_id, book_id, id, currency) ON DELETE RESTRICT,
    archived_at timestamptz,
    archived_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    CHECK (archived_at IS NOT NULL OR archived_by_user_id IS NULL)
);

CREATE INDEX debt_details_created_by_user_id_idx ON finance.debt_details (created_by_user_id);

CREATE INDEX debt_details_updated_by_user_id_idx ON finance.debt_details (updated_by_user_id);

CREATE INDEX debt_details_archived_by_user_id_idx ON finance.debt_details (archived_by_user_id);

CREATE INDEX debt_details_book_created_at_idx ON finance.debt_details (workspace_id, book_id, created_at, id);

CREATE INDEX debt_details_resource_1_fk_idx ON finance.debt_details (workspace_id, book_id, account_id, currency);

ALTER TABLE finance.debt_details ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE finance.debt_details FROM PUBLIC, anon, authenticated, service_role;

