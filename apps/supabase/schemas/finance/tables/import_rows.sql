-- Declarative definition: apps/supabase/schemas/finance/tables/import_rows.sql.

CREATE TABLE finance.import_rows (
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
    batch_id uuid NOT NULL,
    row_number smallint NOT NULL CHECK (row_number BETWEEN 1 AND 100),
    workbook_id text NOT NULL CHECK (char_length(btrim(workbook_id)) > 0 AND char_length(workbook_id) <= 200),
    sheet_id bigint NOT NULL CHECK (sheet_id >= 0),
    source_cell text NOT NULL CHECK (source_cell ~ '^[A-Z]{1,4}[1-9][0-9]{0,6}$'),
    period_start date CHECK (period_start >= DATE '0001-01-01' AND period_start <= DATE '9999-12-31' AND date_trunc('month', period_start::timestamp)::date = period_start),
    source_key text NOT NULL CHECK (char_length(source_key) BETWEEN 1 AND 1000),
    source_digest bytea NOT NULL CHECK (octet_length(source_digest) = 32),
    source_snapshot jsonb NOT NULL CHECK (jsonb_typeof(source_snapshot) = 'object' AND octet_length(source_snapshot::text) <= 32768),
    mapping jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(mapping) = 'object' AND octet_length(mapping::text) <= 32768),
    role text NOT NULL DEFAULT 'unknown' CHECK (role IN ('actual_detail', 'actual_summary', 'planned', 'opening_balance', 'valuation', 'reference', 'unknown')),
    amount numeric(20,4) CHECK (amount > '-Infinity'::numeric AND amount < 'Infinity'::numeric),
    kind text CHECK (kind IN ('income', 'expense', 'transfer')),
    category_id uuid,
    account_id uuid,
    destination_account_id uuid,
    person_id uuid,
    accepted boolean NOT NULL DEFAULT false,
    blockers text[] NOT NULL DEFAULT '{}'::text[] CHECK (cardinality(blockers) <= 100),
    result_transaction_id uuid,
    result_planned_item_id uuid,
    result_summary_id uuid,
    result_valuation_id uuid,
    result_account_id uuid,
    consumed_at timestamptz,
    replaces_row_id uuid,
    retired_at timestamptz,
    retired_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    CHECK (retired_at IS NOT NULL OR retired_by_user_id IS NULL),
    CHECK (replaces_row_id IS NULL OR replaces_row_id <> id),
    CHECK (consumed_at IS NULL OR (accepted AND role NOT IN ('reference', 'unknown'))),
    CHECK (consumed_at IS NULL OR (num_nonnulls(result_transaction_id, result_planned_item_id, result_summary_id, result_valuation_id, result_account_id) = 1 AND ((role = 'actual_detail' AND result_transaction_id IS NOT NULL) OR (role = 'actual_summary' AND result_summary_id IS NOT NULL) OR (role = 'planned' AND result_planned_item_id IS NOT NULL) OR (role = 'valuation' AND result_valuation_id IS NOT NULL) OR (role = 'opening_balance' AND result_account_id IS NOT NULL)))),
    UNIQUE (workspace_id, book_id, batch_id, row_number),
    FOREIGN KEY (workspace_id, book_id, batch_id, workbook_id, currency) REFERENCES finance.import_batches(workspace_id, book_id, id, workbook_id, currency) ON DELETE RESTRICT,
    FOREIGN KEY (workspace_id, book_id, category_id, currency) REFERENCES finance.categories(workspace_id, book_id, id, currency) ON DELETE RESTRICT,
    FOREIGN KEY (workspace_id, book_id, account_id, currency) REFERENCES finance.accounts(workspace_id, book_id, id, currency) ON DELETE RESTRICT,
    FOREIGN KEY (workspace_id, book_id, destination_account_id, currency) REFERENCES finance.accounts(workspace_id, book_id, id, currency) ON DELETE RESTRICT,
    FOREIGN KEY (workspace_id, person_id) REFERENCES core.people(workspace_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (workspace_id, book_id, result_transaction_id, currency) REFERENCES finance.transactions(workspace_id, book_id, id, currency) ON DELETE RESTRICT,
    FOREIGN KEY (workspace_id, book_id, result_planned_item_id, currency) REFERENCES finance.planned_items(workspace_id, book_id, id, currency) ON DELETE RESTRICT,
    FOREIGN KEY (workspace_id, book_id, result_valuation_id, currency) REFERENCES finance.asset_valuations(workspace_id, book_id, id, currency) ON DELETE RESTRICT,
    FOREIGN KEY (workspace_id, book_id, result_account_id, currency) REFERENCES finance.accounts(workspace_id, book_id, id, currency) ON DELETE RESTRICT,
    FOREIGN KEY (workspace_id, book_id, replaces_row_id, currency) REFERENCES finance.import_rows(workspace_id, book_id, id, currency) ON DELETE RESTRICT
);

-- Separate the back-reference so the declarative loader can create both provenance tables.
ALTER TABLE finance.import_rows ADD CONSTRAINT import_rows_result_summary_fk
    FOREIGN KEY (workspace_id, book_id, result_summary_id, currency)
    REFERENCES finance.monthly_summaries(workspace_id, book_id, id, currency) ON DELETE RESTRICT;

CREATE INDEX import_rows_created_by_user_id_idx ON finance.import_rows (created_by_user_id);

CREATE INDEX import_rows_updated_by_user_id_idx ON finance.import_rows (updated_by_user_id);

CREATE INDEX import_rows_retired_by_user_id_idx ON finance.import_rows (retired_by_user_id);

CREATE INDEX import_rows_book_created_at_idx ON finance.import_rows (workspace_id, book_id, created_at, id);

CREATE INDEX import_rows_resource_1_fk_idx ON finance.import_rows (workspace_id, book_id, batch_id, workbook_id, currency);

CREATE INDEX import_rows_resource_2_fk_idx ON finance.import_rows (workspace_id, book_id, category_id, currency);

CREATE INDEX import_rows_resource_3_fk_idx ON finance.import_rows (workspace_id, book_id, account_id, currency);

CREATE INDEX import_rows_resource_4_fk_idx ON finance.import_rows (workspace_id, book_id, destination_account_id, currency);

CREATE INDEX import_rows_resource_5_fk_idx ON finance.import_rows (workspace_id, book_id, result_transaction_id, currency);

CREATE INDEX import_rows_resource_6_fk_idx ON finance.import_rows (workspace_id, book_id, result_planned_item_id, currency);

CREATE INDEX import_rows_resource_7_fk_idx ON finance.import_rows (workspace_id, book_id, result_summary_id, currency);

CREATE INDEX import_rows_resource_8_fk_idx ON finance.import_rows (workspace_id, book_id, result_valuation_id, currency);

CREATE INDEX import_rows_resource_9_fk_idx ON finance.import_rows (workspace_id, book_id, result_account_id, currency);

CREATE INDEX import_rows_resource_10_fk_idx ON finance.import_rows (workspace_id, book_id, replaces_row_id, currency);

CREATE INDEX import_rows_person_fk_idx ON finance.import_rows (workspace_id, person_id);

CREATE UNIQUE INDEX import_rows_consumed_source_idx ON finance.import_rows (workspace_id, book_id, workbook_id, sheet_id, source_cell, period_start) NULLS NOT DISTINCT WHERE consumed_at IS NOT NULL AND retired_at IS NULL;

CREATE UNIQUE INDEX import_rows_one_replacement_idx ON finance.import_rows (workspace_id, book_id, replaces_row_id) WHERE replaces_row_id IS NOT NULL AND consumed_at IS NOT NULL;

CREATE INDEX import_rows_source_history_idx ON finance.import_rows (workspace_id, book_id, workbook_id, sheet_id, source_cell, period_start, created_at, id);

ALTER TABLE finance.import_rows ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE finance.import_rows FROM PUBLIC, anon, authenticated, service_role;

