-- Declarative definition: apps/supabase/schemas/finance/tables/book_access.sql.

CREATE TABLE finance.book_access (
    workspace_id uuid NOT NULL,
    book_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role text NOT NULL CHECK (role IN ('owner', 'editor', 'viewer')),
    granted_at timestamptz NOT NULL DEFAULT now(),
    granted_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    revoked_at timestamptz,
    revoked_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    version integer NOT NULL DEFAULT 1 CHECK (version > 0),
    PRIMARY KEY (workspace_id, book_id, user_id),
    FOREIGN KEY (workspace_id, book_id) REFERENCES finance.books(workspace_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (workspace_id, user_id) REFERENCES core.workspace_members(workspace_id, user_id) ON DELETE RESTRICT,
    CHECK (revoked_at IS NOT NULL OR revoked_by_user_id IS NULL)
);

CREATE UNIQUE INDEX book_access_one_owner_idx ON finance.book_access (workspace_id, book_id) WHERE role = 'owner' AND revoked_at IS NULL;

CREATE INDEX book_access_user_scope_idx ON finance.book_access (user_id, workspace_id, book_id);

CREATE INDEX book_access_member_fk_idx ON finance.book_access (workspace_id, user_id);

CREATE INDEX book_access_granted_by_user_idx ON finance.book_access (granted_by_user_id);

CREATE INDEX book_access_revoked_by_user_idx ON finance.book_access (revoked_by_user_id);

ALTER TABLE finance.book_access ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE finance.book_access FROM PUBLIC, anon, authenticated, service_role;
