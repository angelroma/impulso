-- Declarative definition: apps/supabase/schemas/finance/tables/planned_items.sql.

CREATE TABLE finance.planned_items (
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
    period_start date NOT NULL CHECK (period_start >= DATE '0001-01-01' AND period_start <= DATE '9999-12-31' AND date_trunc('month', period_start::timestamp)::date = period_start),
    due_on date CHECK (due_on BETWEEN DATE '0001-01-01' AND DATE '9999-12-31'),
    rule_id uuid,
    rule_version integer CHECK (rule_version > 0),
    debt_account_id uuid,
    quoted_total numeric(20,4) CHECK (quoted_total > 0 AND quoted_total < 'Infinity'::numeric),
    components_resolved boolean NOT NULL DEFAULT true,
    CHECK (components_resolved OR quoted_total IS NOT NULL),
    CHECK ((rule_id IS NULL AND rule_version IS NULL) OR (rule_id IS NOT NULL AND rule_version IS NOT NULL)),
    UNIQUE (workspace_id, book_id, rule_id, period_start),
    FOREIGN KEY (workspace_id, book_id, rule_id, currency) REFERENCES finance.recurring_rules(workspace_id, book_id, id, currency) ON DELETE RESTRICT,
    FOREIGN KEY (workspace_id, book_id, debt_account_id, currency) REFERENCES finance.debt_details(workspace_id, book_id, account_id, currency) ON DELETE RESTRICT,
    canceled_at timestamptz,
    canceled_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    CHECK (canceled_at IS NOT NULL OR canceled_by_user_id IS NULL)
);

CREATE INDEX planned_items_created_by_user_id_idx ON finance.planned_items (created_by_user_id);

CREATE INDEX planned_items_updated_by_user_id_idx ON finance.planned_items (updated_by_user_id);

CREATE INDEX planned_items_canceled_by_user_id_idx ON finance.planned_items (canceled_by_user_id);

CREATE INDEX planned_items_book_created_at_idx ON finance.planned_items (workspace_id, book_id, created_at, id);

CREATE INDEX planned_items_resource_1_fk_idx ON finance.planned_items (workspace_id, book_id, rule_id, currency);

CREATE INDEX planned_items_resource_2_fk_idx ON finance.planned_items (workspace_id, book_id, debt_account_id, currency);

CREATE INDEX planned_items_due_idx ON finance.planned_items (workspace_id, book_id, period_start, due_on, id);

ALTER TABLE finance.planned_items ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE finance.planned_items FROM PUBLIC, anon, authenticated, service_role;

