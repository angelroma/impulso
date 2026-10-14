BEGIN;

GRANT UPDATE (rule_version) ON TABLE finance.planned_items TO impulso_backend;

COMMIT;
