-- Declarative definition: apps/supabase/schemas/core/tables/person_aliases.sql.

CREATE TABLE core.person_aliases (
    workspace_id uuid NOT NULL,
    user_id uuid NOT NULL,
    person_id uuid NOT NULL,
    alias text NOT NULL,
    alias_normalized text GENERATED ALWAYS AS (lower(btrim(alias))) STORED,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    version integer NOT NULL DEFAULT 1 CHECK (version > 0),
    PRIMARY KEY (workspace_id, user_id, alias_normalized),
    FOREIGN KEY (workspace_id, user_id) REFERENCES core.workspace_members(workspace_id, user_id) ON DELETE RESTRICT,
    FOREIGN KEY (workspace_id, person_id) REFERENCES core.people(workspace_id, id) ON DELETE RESTRICT,
    CHECK (char_length(btrim(alias)) > 0 AND char_length(alias) <= 80)
);

CREATE INDEX person_aliases_person_fk_idx ON core.person_aliases (workspace_id, person_id);

CREATE INDEX person_aliases_user_person_idx ON core.person_aliases (workspace_id, user_id, person_id);

ALTER TABLE core.person_aliases ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE core.person_aliases FROM PUBLIC, anon, authenticated, service_role;
