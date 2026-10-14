-- Declarative definition: apps/supabase/schemas/health/tables/medications.sql.

CREATE TABLE health.medications (
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
    name text NOT NULL,
    instructions text CHECK (char_length(instructions) <= 4000),
    starts_on date,
    ends_on date,
    status text NOT NULL DEFAULT 'reported' CHECK (status IN ('reported', 'active', 'stopped')),
    CHECK (starts_on IS NULL OR ends_on IS NULL OR ends_on >= starts_on),
    CHECK (char_length(btrim(name)) > 0 AND char_length(name) <= 200)
);

CREATE INDEX medications_created_by_user_idx ON health.medications (created_by_user_id);

CREATE INDEX medications_updated_by_user_idx ON health.medications (updated_by_user_id);

CREATE INDEX medications_archived_by_user_idx ON health.medications (archived_by_user_id);

CREATE INDEX medications_person_created_at_idx ON health.medications (workspace_id, person_id, created_at, id);

ALTER TABLE health.medications ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE health.medications FROM PUBLIC, anon, authenticated, service_role;
