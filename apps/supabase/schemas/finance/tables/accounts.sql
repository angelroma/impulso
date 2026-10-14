-- Declarative definition: apps/supabase/schemas/finance/tables/accounts.sql.

CREATE TABLE finance.accounts (
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
    book_id uuid NOT NULL,
    currency text NOT NULL,
    name text NOT NULL,
    person_id uuid,
    opening_balance numeric(20,4) NOT NULL CHECK (opening_balance > '-Infinity'::numeric AND opening_balance < 'Infinity'::numeric),
    FOREIGN KEY (workspace_id, book_id, currency) REFERENCES finance.books(workspace_id, id, currency) ON DELETE RESTRICT,
    FOREIGN KEY (workspace_id, person_id) REFERENCES core.people(workspace_id, id) ON DELETE RESTRICT,
    UNIQUE (workspace_id, book_id, id, currency),
    CHECK (char_length(btrim(name)) > 0 AND char_length(name) <= 200)
);

CREATE INDEX accounts_created_by_user_idx ON finance.accounts (created_by_user_id);

CREATE INDEX accounts_updated_by_user_idx ON finance.accounts (updated_by_user_id);

CREATE INDEX accounts_archived_by_user_idx ON finance.accounts (archived_by_user_id);

CREATE INDEX accounts_book_currency_fk_idx ON finance.accounts (workspace_id, book_id, currency);

CREATE INDEX accounts_book_created_at_idx ON finance.accounts (workspace_id, book_id, created_at, id);

CREATE INDEX accounts_person_fk_idx ON finance.accounts (workspace_id, person_id);

ALTER TABLE finance.accounts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE finance.accounts FROM PUBLIC, anon, authenticated, service_role;
