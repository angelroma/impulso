-- Declarative definition: apps/supabase/schemas/health/tables/files.sql.

CREATE TABLE health.files (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL,
    person_id uuid NOT NULL,
    record_id uuid,
    medication_id uuid,
    appointment_id uuid,
    lab_result_id uuid,
    bucket_id text NOT NULL CHECK (bucket_id = 'health-files'),
    object_path text NOT NULL UNIQUE,
    original_name text NOT NULL,
    mime_type text NOT NULL CHECK (mime_type IN ('application/pdf', 'image/jpeg', 'image/png')),
    size_bytes bigint NOT NULL CHECK (size_bytes BETWEEN 1 AND 20971520),
    state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'ready', 'deleting')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    version integer NOT NULL DEFAULT 1 CHECK (version > 0),
    archived_at timestamptz,
    archived_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    CHECK (archived_at IS NOT NULL OR archived_by_user_id IS NULL),
    CHECK (char_length(btrim(original_name)) > 0 AND char_length(original_name) <= 255),
    UNIQUE (workspace_id, person_id, id),
    FOREIGN KEY (workspace_id, person_id, record_id) REFERENCES health.records(workspace_id, person_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (workspace_id, person_id, medication_id) REFERENCES health.medications(workspace_id, person_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (workspace_id, person_id, appointment_id) REFERENCES health.appointments(workspace_id, person_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (workspace_id, person_id, lab_result_id) REFERENCES health.lab_results(workspace_id, person_id, id) ON DELETE RESTRICT,
    CHECK (num_nonnulls(record_id, medication_id, appointment_id, lab_result_id) = 1),
    CHECK (object_path = workspace_id::text || '/' || person_id::text || '/' || id::text)
);

CREATE INDEX files_created_by_user_idx ON health.files (created_by_user_id);

CREATE INDEX files_updated_by_user_idx ON health.files (updated_by_user_id);

CREATE INDEX files_archived_by_user_idx ON health.files (archived_by_user_id);

CREATE INDEX files_record_fk_idx ON health.files (workspace_id, person_id, record_id);

CREATE INDEX files_medication_fk_idx ON health.files (workspace_id, person_id, medication_id);

CREATE INDEX files_appointment_fk_idx ON health.files (workspace_id, person_id, appointment_id);

CREATE INDEX files_lab_result_fk_idx ON health.files (workspace_id, person_id, lab_result_id);

CREATE INDEX files_person_state_created_at_idx ON health.files (workspace_id, person_id, state, created_at, id);

ALTER TABLE health.files ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE health.files FROM PUBLIC, anon, authenticated, service_role;
