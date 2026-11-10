-- Declarative definition: apps/supabase/schemas/finance/tables/project_statuses.sql.
-- Reference data: where a project stands (active, closed).

CREATE TABLE finance.project_statuses (
    code text PRIMARY KEY CHECK (code ~ '^[a-z][a-z_]{0,29}$')
);

ALTER TABLE finance.project_statuses ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE finance.project_statuses FROM PUBLIC, anon, authenticated, service_role;
