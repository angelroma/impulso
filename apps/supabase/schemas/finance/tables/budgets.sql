-- Declarative definition: apps/supabase/schemas/finance/tables/budgets.sql.

CREATE TABLE finance.budgets (
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
    category_id uuid,
    category_kind text NOT NULL DEFAULT 'expense' CHECK (category_kind = 'expense'),
    starts_on date NOT NULL,
    ends_on date NOT NULL,
    amount numeric(20,4) NOT NULL CHECK (amount > 0 AND amount < 'Infinity'::numeric),
    FOREIGN KEY (workspace_id, book_id, currency) REFERENCES finance.books(workspace_id, id, currency) ON DELETE RESTRICT,
    FOREIGN KEY (workspace_id, person_id) REFERENCES core.people(workspace_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (workspace_id, book_id, category_id, currency, category_kind) REFERENCES finance.categories(workspace_id, book_id, id, currency, kind) ON DELETE RESTRICT,
    UNIQUE NULLS NOT DISTINCT (workspace_id, book_id, person_id, category_id, starts_on, ends_on),
    CHECK (ends_on > starts_on),
    CHECK (char_length(btrim(name)) > 0 AND char_length(name) <= 200)
);

CREATE INDEX budgets_created_by_user_idx ON finance.budgets (created_by_user_id);

CREATE INDEX budgets_updated_by_user_idx ON finance.budgets (updated_by_user_id);

CREATE INDEX budgets_archived_by_user_idx ON finance.budgets (archived_by_user_id);

CREATE INDEX budgets_book_currency_fk_idx ON finance.budgets (workspace_id, book_id, currency);

CREATE INDEX budgets_person_fk_idx ON finance.budgets (workspace_id, person_id);

CREATE INDEX budgets_book_created_at_idx ON finance.budgets (workspace_id, book_id, created_at, id);

CREATE INDEX budgets_interval_idx ON finance.budgets (workspace_id, book_id, starts_on, ends_on);

CREATE INDEX budgets_category_fk_idx ON finance.budgets (workspace_id, book_id, category_id, currency, category_kind);

ALTER TABLE finance.budgets ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE finance.budgets FROM PUBLIC, anon, authenticated, service_role;
