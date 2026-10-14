-- Declarative definition: apps/supabase/schemas/finance/tables/savings_goals.sql.

CREATE TABLE finance.savings_goals (
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
    target_amount numeric(20,4) NOT NULL CHECK (target_amount > 0 AND target_amount < 'Infinity'::numeric),
    target_on date CHECK (target_on BETWEEN DATE '0001-01-01' AND DATE '9999-12-31'),
    person_id uuid,
    FOREIGN KEY (workspace_id, person_id) REFERENCES core.people(workspace_id, id) ON DELETE RESTRICT,
    canceled_at timestamptz,
    canceled_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    CHECK (canceled_at IS NOT NULL OR canceled_by_user_id IS NULL)
);

CREATE INDEX savings_goals_created_by_user_id_idx ON finance.savings_goals (created_by_user_id);

CREATE INDEX savings_goals_updated_by_user_id_idx ON finance.savings_goals (updated_by_user_id);

CREATE INDEX savings_goals_canceled_by_user_id_idx ON finance.savings_goals (canceled_by_user_id);

CREATE INDEX savings_goals_book_created_at_idx ON finance.savings_goals (workspace_id, book_id, created_at, id);

CREATE INDEX savings_goals_person_fk_idx ON finance.savings_goals (workspace_id, person_id);

ALTER TABLE finance.savings_goals ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE finance.savings_goals FROM PUBLIC, anon, authenticated, service_role;

