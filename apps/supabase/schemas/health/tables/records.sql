-- Declarative definition: apps/supabase/schemas/health/tables/records.sql.

CREATE TABLE health.records (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES core.workspaces(id) ON DELETE RESTRICT,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    version integer NOT NULL DEFAULT 1 CHECK (version > 0),
    archived_at timestamptz,
    archived_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    CHECK (archived_at IS NOT NULL OR archived_by_user_id IS NULL),
    UNIQUE (workspace_id, id),
    person_id uuid NOT NULL,
    FOREIGN KEY (workspace_id, person_id) REFERENCES core.people(workspace_id, id) ON DELETE RESTRICT,
    UNIQUE (workspace_id, person_id, id),
    kind text NOT NULL CHECK (kind IN ('note', 'symptom', 'diagnosis', 'history', 'medication_intake')),
    occurred_on date,
    occurred_at timestamptz,
    title text NOT NULL,
    body text NOT NULL,
    CHECK (occurred_on IS NULL OR occurred_at IS NULL),
    CHECK (char_length(btrim(title)) > 0 AND char_length(title) <= 200),
    CHECK (char_length(btrim(body)) > 0 AND char_length(body) <= 20000)
);

CREATE INDEX records_created_by_user_idx ON health.records (created_by_user_id);

CREATE INDEX records_updated_by_user_idx ON health.records (updated_by_user_id);

CREATE INDEX records_archived_by_user_idx ON health.records (archived_by_user_id);

CREATE INDEX records_person_created_at_idx ON health.records (workspace_id, person_id, created_at, id);

ALTER TABLE health.records ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE health.records FROM PUBLIC, anon, authenticated, service_role;
