-- Declarative definition: apps/supabase/schemas/finance/tables/currencies.sql.
-- Reference data: the ISO 4217 currencies a workspace or account can use. Rows are seeded by the
-- baseline migration; supporting another currency is one INSERT, not a schema change.

CREATE TABLE finance.currencies (
    code text PRIMARY KEY CHECK (code ~ '^[A-Z]{3}$'),
    name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 100)
);

ALTER TABLE finance.currencies ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE finance.currencies FROM PUBLIC, anon, authenticated, service_role;
