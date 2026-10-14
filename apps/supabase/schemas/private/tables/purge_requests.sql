-- Declarative definition: apps/supabase/schemas/private/tables/purge_requests.sql.

CREATE TABLE private.purge_requests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL,
    scope text NOT NULL CHECK (scope IN ('book', 'health_person', 'person', 'workspace')),
    person_id uuid,
    book_id uuid,
    requested_by_user_id uuid NOT NULL,
    state text NOT NULL DEFAULT 'prepared' CHECK (state IN ('prepared', 'approved', 'deleting_files', 'deleting_rows', 'completed', 'cancelled', 'failed')),
    manifest jsonb NOT NULL CHECK (jsonb_typeof(manifest) = 'object'),
    manifest_hash bytea NOT NULL CHECK (octet_length(manifest_hash) = 32),
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL DEFAULT (now() + interval '5 minutes'),
    updated_at timestamptz NOT NULL DEFAULT now(),
    confirmed_at timestamptz,
    failure_code text CHECK (failure_code ~ '^[a-z][a-z0-9_]{0,63}$'),
    CHECK ((scope = 'workspace' AND person_id IS NULL AND book_id IS NULL) OR (scope IN ('person', 'health_person') AND person_id IS NOT NULL AND book_id IS NULL) OR (scope = 'book' AND person_id IS NULL AND book_id IS NOT NULL)),
    CHECK (expires_at = created_at + interval '5 minutes'),
    CHECK (state NOT IN ('approved', 'deleting_files', 'deleting_rows', 'completed') OR confirmed_at IS NOT NULL),
    CHECK (state <> 'prepared' OR confirmed_at IS NULL),
    CHECK (state = 'failed' OR failure_code IS NULL)
);

CREATE UNIQUE INDEX purge_requests_one_confirmed_scope_idx ON private.purge_requests (workspace_id) WHERE state IN ('approved', 'deleting_files', 'deleting_rows') OR (state = 'failed' AND confirmed_at IS NOT NULL);

CREATE INDEX purge_requests_workspace_state_idx ON private.purge_requests (workspace_id, state);

CREATE INDEX purge_requests_actor_created_at_idx ON private.purge_requests (requested_by_user_id, created_at);

ALTER TABLE private.purge_requests ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE private.purge_requests FROM PUBLIC, anon, authenticated, service_role;
