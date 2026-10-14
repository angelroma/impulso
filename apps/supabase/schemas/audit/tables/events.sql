-- Declarative definition: apps/supabase/schemas/audit/tables/events.sql.

CREATE TABLE audit.events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    occurred_at timestamptz NOT NULL DEFAULT now(),
    request_id uuid NOT NULL,
    actor_user_id uuid,
    workspace_id uuid,
    module text NOT NULL CHECK (module IN ('core', 'finance', 'health', 'auth')),
    resource_type text NOT NULL,
    resource_id uuid,
    subject_person_id uuid,
    book_id uuid,
    action text NOT NULL CHECK (action IN ('create', 'update', 'correct', 'void', 'archive', 'restore', 'invite', 'accept', 'reject', 'grant', 'revoke', 'transfer', 'upload', 'download', 'purge_request', 'purge_complete', 'login', 'logout')),
    outcome text NOT NULL CHECK (outcome IN ('success', 'denied', 'failed')),
    changed_fields text[] NOT NULL DEFAULT '{}'::text[],
    CHECK ((module = 'core' AND resource_type IN ('workspace', 'workspace_member', 'person', 'person_user_link', 'person_access', 'person_alias', 'identity_link_request', 'ownership_transfer_request', 'purge_request')) OR (module = 'finance' AND resource_type IN ('book', 'book_access', 'account', 'transaction', 'budget', 'file', 'purge_request')) OR (module = 'health' AND resource_type IN ('person_access', 'record', 'medication', 'appointment', 'lab_result', 'file', 'purge_request')) OR (module = 'auth' AND resource_type IN ('account', 'session'))),
    CHECK (outcome <> 'success' OR module <> 'health' OR subject_person_id IS NOT NULL),
    CHECK (outcome <> 'success' OR module <> 'finance' OR book_id IS NOT NULL)
);

CREATE INDEX events_scope_occurred_at_idx ON audit.events (workspace_id, module, occurred_at, id);

CREATE INDEX events_actor_idx ON audit.events (actor_user_id, occurred_at, id);

CREATE INDEX events_resource_idx ON audit.events (workspace_id, module, resource_type, resource_id, occurred_at, id);

ALTER TABLE audit.events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE audit.events FROM PUBLIC, anon, authenticated, service_role;
