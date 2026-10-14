-- Declarative definition: apps/supabase/schemas/finance/tables/monthly_summaries.sql.

CREATE TABLE finance.monthly_summaries (
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
    period_start date NOT NULL CHECK (period_start >= DATE '0001-01-01' AND period_start <= DATE '9999-12-31' AND date_trunc('month', period_start::timestamp)::date = period_start),
    kind text NOT NULL CHECK (kind IN ('income', 'expense')),
    amount numeric(20,4) NOT NULL CHECK (amount >= 0 AND amount < 'Infinity'::numeric),
    category_id uuid,
    import_row_id uuid NOT NULL,
    replaces_summary_id uuid,
    retired_at timestamptz,
    retired_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    CHECK (retired_at IS NOT NULL OR retired_by_user_id IS NULL),
    CHECK (replaces_summary_id IS NULL OR replaces_summary_id <> id),
    UNIQUE (workspace_id, book_id, import_row_id),
    FOREIGN KEY (workspace_id, book_id, category_id, currency, kind) REFERENCES finance.categories(workspace_id, book_id, id, currency, kind) ON DELETE RESTRICT,
    FOREIGN KEY (workspace_id, book_id, import_row_id, currency) REFERENCES finance.import_rows(workspace_id, book_id, id, currency) ON DELETE RESTRICT,
    FOREIGN KEY (workspace_id, book_id, replaces_summary_id, currency) REFERENCES finance.monthly_summaries(workspace_id, book_id, id, currency) ON DELETE RESTRICT
);

CREATE INDEX monthly_summaries_created_by_user_id_idx ON finance.monthly_summaries (created_by_user_id);

CREATE INDEX monthly_summaries_updated_by_user_id_idx ON finance.monthly_summaries (updated_by_user_id);

CREATE INDEX monthly_summaries_retired_by_user_id_idx ON finance.monthly_summaries (retired_by_user_id);

CREATE INDEX monthly_summaries_book_created_at_idx ON finance.monthly_summaries (workspace_id, book_id, created_at, id);

CREATE INDEX monthly_summaries_resource_1_fk_idx ON finance.monthly_summaries (workspace_id, book_id, category_id, currency, kind);

CREATE INDEX monthly_summaries_resource_2_fk_idx ON finance.monthly_summaries (workspace_id, book_id, import_row_id, currency);

CREATE INDEX monthly_summaries_resource_3_fk_idx ON finance.monthly_summaries (workspace_id, book_id, replaces_summary_id, currency);

CREATE INDEX monthly_summaries_period_kind_idx ON finance.monthly_summaries (workspace_id, book_id, period_start, kind, category_id);

CREATE UNIQUE INDEX monthly_summaries_one_replacement_idx ON finance.monthly_summaries (workspace_id, book_id, replaces_summary_id) WHERE replaces_summary_id IS NOT NULL;

ALTER TABLE finance.monthly_summaries ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE finance.monthly_summaries FROM PUBLIC, anon, authenticated, service_role;

