-- Declarative definition: apps/supabase/schemas/finance/tables/transaction_kinds.sql.
-- Reference data: the direction of a transaction (income, expense, transfer).

CREATE TABLE finance.transaction_kinds (
    code text PRIMARY KEY CHECK (code ~ '^[a-z][a-z_]{0,29}$')
);

ALTER TABLE finance.transaction_kinds ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE finance.transaction_kinds FROM PUBLIC, anon, authenticated, service_role;
