-- Declarative definition: apps/supabase/schemas/core/tables/ownership_transfer_requests.sql.

CREATE TABLE core.ownership_transfer_requests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES core.workspaces(id) ON DELETE RESTRICT,
    scope text NOT NULL CHECK (scope IN ('workspace', 'person', 'book', 'health_person')),
    person_id uuid,
    book_id uuid,
    offered_by_user_id uuid NOT NULL,
    target_user_id uuid NOT NULL,
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'cancelled', 'expired')),
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
    completed_at timestamptz,
    completed_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    FOREIGN KEY (workspace_id, person_id) REFERENCES core.people(workspace_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (workspace_id, book_id) REFERENCES finance.books(workspace_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (workspace_id, offered_by_user_id) REFERENCES core.workspace_members(workspace_id, user_id) ON DELETE RESTRICT,
    FOREIGN KEY (workspace_id, target_user_id) REFERENCES core.workspace_members(workspace_id, user_id) ON DELETE RESTRICT,
    CHECK ((scope = 'workspace' AND person_id IS NULL AND book_id IS NULL) OR (scope IN ('person', 'health_person') AND person_id IS NOT NULL AND book_id IS NULL) OR (scope = 'book' AND person_id IS NULL AND book_id IS NOT NULL)),
    CHECK (offered_by_user_id <> target_user_id),
    CHECK (expires_at = created_at + interval '7 days'),
    CHECK ((status = 'pending') = (completed_at IS NULL)),
    CHECK (status NOT IN ('pending', 'expired') OR completed_by_user_id IS NULL)
);

CREATE UNIQUE INDEX ownership_transfer_requests_pending_scope_idx ON core.ownership_transfer_requests (workspace_id, scope, person_id, book_id) NULLS NOT DISTINCT WHERE status = 'pending';

CREATE INDEX ownership_transfer_requests_person_fk_idx ON core.ownership_transfer_requests (workspace_id, person_id);

CREATE INDEX ownership_transfer_requests_book_fk_idx ON core.ownership_transfer_requests (workspace_id, book_id);

CREATE INDEX ownership_transfer_requests_offerer_member_idx ON core.ownership_transfer_requests (workspace_id, offered_by_user_id);

CREATE INDEX ownership_transfer_requests_target_member_idx ON core.ownership_transfer_requests (workspace_id, target_user_id);

CREATE INDEX ownership_transfer_requests_target_status_idx ON core.ownership_transfer_requests (target_user_id, status, expires_at);

CREATE INDEX ownership_transfer_requests_completed_by_user_idx ON core.ownership_transfer_requests (completed_by_user_id);

ALTER TABLE core.ownership_transfer_requests ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE core.ownership_transfer_requests FROM PUBLIC, anon, authenticated, service_role;
