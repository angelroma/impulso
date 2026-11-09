-- Declarative definition: apps/supabase/schemas/app/tables/workspaces.sql.
-- Independent containers owned by one user, for example "Yo", "Mamá" or "Negocio".

CREATE TABLE app.workspaces (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 100),
    currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
    timezone text NOT NULL CHECK (char_length(timezone) BETWEEN 1 AND 64),
    is_default boolean NOT NULL DEFAULT false,
    archived_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (NOT (is_default AND archived_at IS NOT NULL))
);

CREATE UNIQUE INDEX workspaces_one_default_idx ON app.workspaces (owner_user_id) WHERE is_default;

CREATE UNIQUE INDEX workspaces_active_name_idx ON app.workspaces (owner_user_id, lower(name)) WHERE archived_at IS NULL;

ALTER TABLE app.workspaces ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE app.workspaces FROM PUBLIC, anon, authenticated, service_role;
