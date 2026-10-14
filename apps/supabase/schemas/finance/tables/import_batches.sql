-- Declarative definition: apps/supabase/schemas/finance/tables/import_batches.sql.

CREATE TABLE finance.import_batches (
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
    actor_user_id uuid NOT NULL,
    workbook_id text NOT NULL CHECK (char_length(btrim(workbook_id)) > 0 AND char_length(workbook_id) <= 200),
    source_version text NOT NULL CHECK (char_length(btrim(source_version)) > 0 AND char_length(source_version) <= 200),
    captured_at timestamptz NOT NULL,
    manifest jsonb NOT NULL CHECK (jsonb_typeof(manifest) = 'object' AND octet_length(manifest::text) <= 32768),
    review_digest bytea NOT NULL CHECK (octet_length(review_digest) = 32),
    status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'ready', 'committed', 'retired')),
    blockers text[] NOT NULL DEFAULT '{}'::text[] CHECK (cardinality(blockers) <= 1000),
    reconciliation jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(reconciliation) = 'object' AND octet_length(reconciliation::text) <= 32768),
    committed_at timestamptz,
    CHECK ((status = 'committed' AND committed_at IS NOT NULL) OR status <> 'committed'),
    UNIQUE (workspace_id, book_id, id, workbook_id, currency)
);

CREATE INDEX import_batches_created_by_user_id_idx ON finance.import_batches (created_by_user_id);

CREATE INDEX import_batches_updated_by_user_id_idx ON finance.import_batches (updated_by_user_id);

CREATE INDEX import_batches_book_created_at_idx ON finance.import_batches (workspace_id, book_id, created_at, id);

CREATE INDEX import_batches_actor_status_idx ON finance.import_batches (actor_user_id, workspace_id, book_id, status, created_at, id);

ALTER TABLE finance.import_batches ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE finance.import_batches FROM PUBLIC, anon, authenticated, service_role;

