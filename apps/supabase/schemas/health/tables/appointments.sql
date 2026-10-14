-- Declarative definition: apps/supabase/schemas/health/tables/appointments.sql.

CREATE TABLE health.appointments (
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
    starts_at timestamptz NOT NULL,
    ends_at timestamptz,
    timezone text NOT NULL,
    provider text CHECK (char_length(provider) <= 200),
    location text CHECK (char_length(location) <= 500),
    reason text CHECK (char_length(reason) <= 4000),
    status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'completed', 'cancelled', 'missed')),
    CHECK (ends_at IS NULL OR ends_at > starts_at),
    CHECK (char_length(btrim(timezone)) > 0 AND char_length(timezone) <= 200)
);

CREATE INDEX appointments_created_by_user_idx ON health.appointments (created_by_user_id);

CREATE INDEX appointments_updated_by_user_idx ON health.appointments (updated_by_user_id);

CREATE INDEX appointments_archived_by_user_idx ON health.appointments (archived_by_user_id);

CREATE INDEX appointments_person_starts_at_idx ON health.appointments (workspace_id, person_id, starts_at, id);

ALTER TABLE health.appointments ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE health.appointments FROM PUBLIC, anon, authenticated, service_role;
