-- Declarative definition: apps/supabase/schemas/core/tables/identity_link_requests.sql.

CREATE TABLE core.identity_link_requests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL,
    person_id uuid NOT NULL,
    target_user_id uuid NOT NULL,
    requested_by_user_id uuid NOT NULL,
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'cancelled', 'expired')),
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
    completed_at timestamptz,
    completed_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    FOREIGN KEY (workspace_id, person_id) REFERENCES core.people(workspace_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (workspace_id, target_user_id) REFERENCES core.workspace_members(workspace_id, user_id) ON DELETE RESTRICT,
    FOREIGN KEY (workspace_id, requested_by_user_id) REFERENCES core.workspace_members(workspace_id, user_id) ON DELETE RESTRICT,
    CHECK (expires_at = created_at + interval '7 days'),
    CHECK ((status = 'pending') = (completed_at IS NULL)),
    CHECK (status NOT IN ('pending', 'expired') OR completed_by_user_id IS NULL)
);

CREATE UNIQUE INDEX identity_link_requests_pending_person_idx ON core.identity_link_requests (workspace_id, person_id) WHERE status = 'pending';

CREATE UNIQUE INDEX identity_link_requests_pending_target_idx ON core.identity_link_requests (workspace_id, target_user_id) WHERE status = 'pending';

CREATE INDEX identity_link_requests_person_fk_idx ON core.identity_link_requests (workspace_id, person_id);

CREATE INDEX identity_link_requests_target_member_idx ON core.identity_link_requests (workspace_id, target_user_id);

CREATE INDEX identity_link_requests_requester_member_idx ON core.identity_link_requests (workspace_id, requested_by_user_id);

CREATE INDEX identity_link_requests_target_status_idx ON core.identity_link_requests (target_user_id, status, expires_at);

CREATE INDEX identity_link_requests_completed_by_user_idx ON core.identity_link_requests (completed_by_user_id);

ALTER TABLE core.identity_link_requests ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE core.identity_link_requests FROM PUBLIC, anon, authenticated, service_role;
