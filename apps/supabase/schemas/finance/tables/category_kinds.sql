-- Declarative definition: apps/supabase/schemas/finance/tables/category_kinds.sql.
-- Reference data: the transaction kinds a category can label (income, expense; never transfer).

CREATE TABLE finance.category_kinds (
    code text PRIMARY KEY REFERENCES finance.transaction_kinds(code) ON DELETE RESTRICT
);

ALTER TABLE finance.category_kinds ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE finance.category_kinds FROM PUBLIC, anon, authenticated, service_role;
