-- Declarative definition: apps/supabase/schemas/finance/tables/assets.sql.

CREATE TABLE finance.assets (
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
    identity_text text NOT NULL CHECK (char_length(btrim(identity_text)) > 0 AND char_length(identity_text) <= 2000),
    ownership_text text NOT NULL CHECK (char_length(btrim(ownership_text)) > 0 AND char_length(ownership_text) <= 2000),
    person_id uuid,
    FOREIGN KEY (workspace_id, person_id) REFERENCES core.people(workspace_id, id) ON DELETE RESTRICT,
    archived_at timestamptz,
    archived_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    CHECK (archived_at IS NOT NULL OR archived_by_user_id IS NULL)
);

CREATE INDEX assets_created_by_user_id_idx ON finance.assets (created_by_user_id);

CREATE INDEX assets_updated_by_user_id_idx ON finance.assets (updated_by_user_id);

CREATE INDEX assets_archived_by_user_id_idx ON finance.assets (archived_by_user_id);

CREATE INDEX assets_book_created_at_idx ON finance.assets (workspace_id, book_id, created_at, id);

CREATE INDEX assets_person_fk_idx ON finance.assets (workspace_id, person_id);

ALTER TABLE finance.assets ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE finance.assets FROM PUBLIC, anon, authenticated, service_role;

