-- Declarative definition: apps/supabase/schemas/health/tables/lab_results.sql.

CREATE TABLE health.lab_results (
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
    test_name text NOT NULL,
    collected_on date,
    collected_at timestamptz,
    result_text text NOT NULL,
    unit text CHECK (char_length(unit) <= 100),
    reference_range text CHECK (char_length(reference_range) <= 500),
    laboratory text CHECK (char_length(laboratory) <= 200),
    CHECK (collected_on IS NULL OR collected_at IS NULL),
    CHECK (char_length(btrim(test_name)) > 0 AND char_length(test_name) <= 200),
    CHECK (char_length(btrim(result_text)) > 0 AND char_length(result_text) <= 4000)
);

CREATE INDEX lab_results_created_by_user_idx ON health.lab_results (created_by_user_id);

CREATE INDEX lab_results_updated_by_user_idx ON health.lab_results (updated_by_user_id);

CREATE INDEX lab_results_archived_by_user_idx ON health.lab_results (archived_by_user_id);

CREATE INDEX lab_results_person_created_at_idx ON health.lab_results (workspace_id, person_id, created_at, id);

ALTER TABLE health.lab_results ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE health.lab_results FROM PUBLIC, anon, authenticated, service_role;
