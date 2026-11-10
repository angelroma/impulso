-- Declarative definition: apps/supabase/schemas/finance/tables/account_types.sql.
-- Reference data: what an account is (cash, checking, savings, credit_card, loan, investment).
-- is_liability marks types whose balance is money owed, recorded as a negative amount.

CREATE TABLE finance.account_types (
    code text PRIMARY KEY CHECK (code ~ '^[a-z][a-z_]{0,29}$'),
    is_liability boolean NOT NULL DEFAULT false
);

ALTER TABLE finance.account_types ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE finance.account_types FROM PUBLIC, anon, authenticated, service_role;
