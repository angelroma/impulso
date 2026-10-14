-- Declarative definition: apps/supabase/schemas/finance/tables/files.sql.

CREATE TABLE finance.files (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL,
    book_id uuid NOT NULL,
    transaction_id uuid NOT NULL,
    bucket_id text NOT NULL CHECK (bucket_id = 'finance-files'),
    object_path text NOT NULL UNIQUE,
    original_name text NOT NULL,
    mime_type text NOT NULL CHECK (mime_type IN ('application/pdf', 'image/jpeg', 'image/png')),
    size_bytes bigint NOT NULL CHECK (size_bytes BETWEEN 1 AND 20971520),
    state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'ready', 'deleting')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    version integer NOT NULL DEFAULT 1 CHECK (version > 0),
    archived_at timestamptz,
    archived_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    CHECK (archived_at IS NOT NULL OR archived_by_user_id IS NULL),
    CHECK (char_length(btrim(original_name)) > 0 AND char_length(original_name) <= 255),
    UNIQUE (workspace_id, book_id, id),
    FOREIGN KEY (workspace_id, book_id, transaction_id) REFERENCES finance.transactions(workspace_id, book_id, id) ON DELETE RESTRICT,
    CHECK (object_path = workspace_id::text || '/' || book_id::text || '/' || id::text)
);

CREATE INDEX files_created_by_user_idx ON finance.files (created_by_user_id);

CREATE INDEX files_updated_by_user_idx ON finance.files (updated_by_user_id);

CREATE INDEX files_archived_by_user_idx ON finance.files (archived_by_user_id);

CREATE INDEX files_transaction_fk_idx ON finance.files (workspace_id, book_id, transaction_id);

CREATE INDEX files_book_state_created_at_idx ON finance.files (workspace_id, book_id, state, created_at, id);

ALTER TABLE finance.files ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE finance.files FROM PUBLIC, anon, authenticated, service_role;
