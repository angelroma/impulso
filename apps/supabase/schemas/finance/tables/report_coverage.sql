-- Declarative definition: apps/supabase/schemas/finance/tables/report_coverage.sql.

CREATE TABLE finance.report_coverage (
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
    category_id uuid,
    authority text NOT NULL CHECK (authority IN ('detail', 'summary')),
    reviewed_detail_count bigint NOT NULL CHECK (reviewed_detail_count >= 0),
    reviewed_detail_digest bytea CHECK (octet_length(reviewed_detail_digest) = 32),
    FOREIGN KEY (workspace_id, book_id, category_id, currency, kind) REFERENCES finance.categories(workspace_id, book_id, id, currency, kind) ON DELETE RESTRICT,
    UNIQUE NULLS NOT DISTINCT (workspace_id, book_id, currency, period_start, kind, category_id)
);

CREATE INDEX report_coverage_created_by_user_id_idx ON finance.report_coverage (created_by_user_id);

CREATE INDEX report_coverage_updated_by_user_id_idx ON finance.report_coverage (updated_by_user_id);

CREATE INDEX report_coverage_book_created_at_idx ON finance.report_coverage (workspace_id, book_id, created_at, id);

CREATE INDEX report_coverage_resource_1_fk_idx ON finance.report_coverage (workspace_id, book_id, category_id, currency, kind);

ALTER TABLE finance.report_coverage ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE finance.report_coverage FROM PUBLIC, anon, authenticated, service_role;

