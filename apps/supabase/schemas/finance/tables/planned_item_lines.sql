-- Declarative definition: apps/supabase/schemas/finance/tables/planned_item_lines.sql.

CREATE TABLE finance.planned_item_lines (
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
    planned_item_id uuid NOT NULL,
    line_number smallint NOT NULL CHECK (line_number BETWEEN 1 AND 10),
    kind text NOT NULL CHECK (kind IN ('income', 'expense', 'transfer')),
    amount numeric(20,4) NOT NULL CHECK (amount > 0 AND amount < 'Infinity'::numeric),
    category_id uuid,
    source_account_id uuid,
    destination_account_id uuid,
    beneficiary_person_id uuid,
    FOREIGN KEY (workspace_id, book_id, category_id, currency, kind) REFERENCES finance.categories(workspace_id, book_id, id, currency, kind) ON DELETE RESTRICT,
    FOREIGN KEY (workspace_id, book_id, source_account_id, currency) REFERENCES finance.accounts(workspace_id, book_id, id, currency) ON DELETE RESTRICT,
    FOREIGN KEY (workspace_id, book_id, destination_account_id, currency) REFERENCES finance.accounts(workspace_id, book_id, id, currency) ON DELETE RESTRICT,
    FOREIGN KEY (workspace_id, beneficiary_person_id) REFERENCES core.people(workspace_id, id) ON DELETE RESTRICT,
    CHECK (kind <> 'transfer' OR category_id IS NULL),
    CHECK ((kind <> 'income' OR source_account_id IS NULL) AND (kind <> 'expense' OR destination_account_id IS NULL)),
    CHECK (source_account_id IS NULL OR destination_account_id IS NULL OR source_account_id <> destination_account_id),
    retired_at timestamptz,
    retired_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    CHECK (retired_at IS NOT NULL OR retired_by_user_id IS NULL),
    UNIQUE (workspace_id, book_id, planned_item_id, id, currency, kind),
    FOREIGN KEY (workspace_id, book_id, planned_item_id, currency) REFERENCES finance.planned_items(workspace_id, book_id, id, currency) ON DELETE RESTRICT
);

CREATE INDEX planned_item_lines_created_by_user_id_idx ON finance.planned_item_lines (created_by_user_id);

CREATE INDEX planned_item_lines_updated_by_user_id_idx ON finance.planned_item_lines (updated_by_user_id);

CREATE INDEX planned_item_lines_retired_by_user_id_idx ON finance.planned_item_lines (retired_by_user_id);

CREATE INDEX planned_item_lines_book_created_at_idx ON finance.planned_item_lines (workspace_id, book_id, created_at, id);

CREATE INDEX planned_item_lines_resource_1_fk_idx ON finance.planned_item_lines (workspace_id, book_id, category_id, currency, kind);

CREATE INDEX planned_item_lines_resource_2_fk_idx ON finance.planned_item_lines (workspace_id, book_id, source_account_id, currency);

CREATE INDEX planned_item_lines_resource_3_fk_idx ON finance.planned_item_lines (workspace_id, book_id, destination_account_id, currency);

CREATE INDEX planned_item_lines_resource_4_fk_idx ON finance.planned_item_lines (workspace_id, book_id, planned_item_id, currency);

CREATE INDEX planned_item_lines_person_fk_idx ON finance.planned_item_lines (workspace_id, beneficiary_person_id);

CREATE UNIQUE INDEX planned_item_lines_active_position_idx ON finance.planned_item_lines (workspace_id, book_id, planned_item_id, line_number) WHERE retired_at IS NULL;

ALTER TABLE finance.planned_item_lines ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE finance.planned_item_lines FROM PUBLIC, anon, authenticated, service_role;

