-- Declarative definition: apps/supabase/schemas/finance/tables/recurring_rules.sql.

CREATE TABLE finance.recurring_rules (
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
    name text NOT NULL CHECK (char_length(btrim(name)) > 0 AND char_length(name) <= 200),
    interval text NOT NULL CHECK (interval IN ('monthly', 'annual')),
    start_period date NOT NULL CHECK (start_period >= DATE '0001-01-01' AND start_period <= DATE '9999-12-31' AND date_trunc('month', start_period::timestamp)::date = start_period),
    end_period date CHECK (end_period >= DATE '0001-01-01' AND end_period <= DATE '9999-12-31' AND date_trunc('month', end_period::timestamp)::date = end_period),
    due_day smallint CHECK (due_day BETWEEN 1 AND 31),
    short_month_policy text CHECK (short_month_policy IN ('last_day', 'reject')),
    CHECK (end_period IS NULL OR end_period >= start_period),
    CHECK ((due_day IS NULL AND short_month_policy IS NULL) OR (due_day IS NOT NULL AND short_month_policy IS NOT NULL)),
    canceled_at timestamptz,
    canceled_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    CHECK (canceled_at IS NOT NULL OR canceled_by_user_id IS NULL)
);

CREATE INDEX recurring_rules_created_by_user_id_idx ON finance.recurring_rules (created_by_user_id);

CREATE INDEX recurring_rules_updated_by_user_id_idx ON finance.recurring_rules (updated_by_user_id);

CREATE INDEX recurring_rules_canceled_by_user_id_idx ON finance.recurring_rules (canceled_by_user_id);

CREATE INDEX recurring_rules_book_created_at_idx ON finance.recurring_rules (workspace_id, book_id, created_at, id);

ALTER TABLE finance.recurring_rules ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE finance.recurring_rules FROM PUBLIC, anon, authenticated, service_role;

