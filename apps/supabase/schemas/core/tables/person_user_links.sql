-- Declarative definition: apps/supabase/schemas/core/tables/person_user_links.sql.

CREATE TABLE core.person_user_links (
    workspace_id uuid NOT NULL,
    person_id uuid NOT NULL,
    user_id uuid NOT NULL,
    verified_at timestamptz NOT NULL DEFAULT now(),
    verification_method text NOT NULL CHECK (verification_method IN ('self_registration', 'dual_acceptance')),
    PRIMARY KEY (workspace_id, person_id),
    UNIQUE (workspace_id, user_id),
    FOREIGN KEY (workspace_id, person_id) REFERENCES core.people(workspace_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (workspace_id, user_id) REFERENCES core.workspace_members(workspace_id, user_id) ON DELETE RESTRICT
);

CREATE INDEX person_user_links_user_idx ON core.person_user_links (user_id, workspace_id, person_id);

ALTER TABLE core.person_user_links ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE core.person_user_links FROM PUBLIC, anon, authenticated, service_role;
