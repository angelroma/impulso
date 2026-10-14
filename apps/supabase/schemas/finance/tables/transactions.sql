-- Declarative definition: apps/supabase/schemas/finance/tables/transactions.sql.

CREATE TABLE finance.transactions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES core.workspaces(id) ON DELETE RESTRICT,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    version integer NOT NULL DEFAULT 1 CHECK (version > 0),
    UNIQUE (workspace_id, id),
    book_id uuid NOT NULL,
    currency text NOT NULL,
    kind text NOT NULL CHECK (kind IN ('income', 'expense', 'transfer')),
    amount numeric(20,4) NOT NULL CHECK (amount > 0 AND amount < 'Infinity'::numeric),
    source_account_id uuid,
    destination_account_id uuid,
    beneficiary_person_id uuid,
    occurred_on date NOT NULL,
    description text NOT NULL,
    request_id uuid NOT NULL,
    replaces_transaction_id uuid,
    voided_at timestamptz,
    voided_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    void_reason text,
    UNIQUE (workspace_id, book_id, id),
    UNIQUE (workspace_id, book_id, request_id),
    FOREIGN KEY (workspace_id, book_id, currency) REFERENCES finance.books(workspace_id, id, currency) ON DELETE RESTRICT,
    FOREIGN KEY (workspace_id, book_id, source_account_id, currency) REFERENCES finance.accounts(workspace_id, book_id, id, currency) ON DELETE RESTRICT,
    FOREIGN KEY (workspace_id, book_id, destination_account_id, currency) REFERENCES finance.accounts(workspace_id, book_id, id, currency) ON DELETE RESTRICT,
    FOREIGN KEY (workspace_id, beneficiary_person_id) REFERENCES core.people(workspace_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (workspace_id, book_id, replaces_transaction_id) REFERENCES finance.transactions(workspace_id, book_id, id) ON DELETE RESTRICT,
    CHECK ((kind = 'income' AND source_account_id IS NULL AND destination_account_id IS NOT NULL) OR (kind = 'expense' AND source_account_id IS NOT NULL AND destination_account_id IS NULL) OR (kind = 'transfer' AND source_account_id IS NOT NULL AND destination_account_id IS NOT NULL AND source_account_id <> destination_account_id)),
    CHECK (replaces_transaction_id IS NULL OR replaces_transaction_id <> id),
    CHECK ((voided_at IS NULL AND voided_by_user_id IS NULL AND void_reason IS NULL) OR (voided_at IS NOT NULL AND void_reason IS NOT NULL AND char_length(btrim(void_reason)) > 0)),
    CHECK (void_reason IS NULL OR char_length(void_reason) <= 2000),
    CHECK (char_length(btrim(description)) > 0 AND char_length(description) <= 2000)
);

CREATE INDEX transactions_created_by_user_idx ON finance.transactions (created_by_user_id);

CREATE INDEX transactions_updated_by_user_idx ON finance.transactions (updated_by_user_id);

CREATE UNIQUE INDEX transactions_one_replacement_idx ON finance.transactions (workspace_id, book_id, replaces_transaction_id) WHERE replaces_transaction_id IS NOT NULL;

CREATE INDEX transactions_book_currency_fk_idx ON finance.transactions (workspace_id, book_id, currency);

CREATE INDEX transactions_book_occurred_on_idx ON finance.transactions (workspace_id, book_id, occurred_on, id);

CREATE INDEX transactions_source_account_fk_idx ON finance.transactions (workspace_id, book_id, source_account_id, currency);

CREATE INDEX transactions_destination_account_fk_idx ON finance.transactions (workspace_id, book_id, destination_account_id, currency);

CREATE INDEX transactions_beneficiary_fk_idx ON finance.transactions (workspace_id, beneficiary_person_id);

CREATE INDEX transactions_voided_by_user_idx ON finance.transactions (voided_by_user_id);

ALTER TABLE finance.transactions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE finance.transactions FROM PUBLIC, anon, authenticated, service_role;
