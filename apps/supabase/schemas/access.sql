-- Client access remains closed; Edge Functions authorize every application operation.

REVOKE ALL ON SCHEMA core, finance, health, api, audit, private FROM PUBLIC, anon, authenticated, service_role;

GRANT USAGE ON SCHEMA api TO anon, authenticated, service_role;

REVOKE ALL ON ALL SEQUENCES IN SCHEMA core, finance, health, api, audit, private FROM PUBLIC, anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA core, finance, health, api, audit, private REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA core, finance, health, api, audit, private REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA core, finance, health, api, audit, private REVOKE ALL ON SEQUENCES FROM PUBLIC, anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA core, finance, health, api, audit, private REVOKE ALL ON SEQUENCES FROM PUBLIC, anon, authenticated, service_role;

GRANT USAGE ON SCHEMA core, audit, private TO impulso_backend;

GRANT SELECT, INSERT ON TABLE
    core.workspaces,
    core.workspace_members,
    core.people,
    core.person_user_links,
    core.person_access,
    core.person_aliases
TO impulso_backend;

-- Native SELECT row locks require UPDATE on at least one column of each locked table.
GRANT UPDATE (updated_at) ON TABLE core.workspaces TO impulso_backend;
GRANT UPDATE (updated_at) ON TABLE core.workspace_members TO impulso_backend;
GRANT UPDATE (updated_at) ON TABLE core.people TO impulso_backend;
GRANT UPDATE (verified_at) ON TABLE core.person_user_links TO impulso_backend;
GRANT UPDATE (granted_at) ON TABLE core.person_access TO impulso_backend;

GRANT INSERT ON TABLE audit.events TO impulso_backend;
GRANT SELECT, INSERT ON TABLE private.operation_receipts TO impulso_backend;
GRANT SELECT ON TABLE private.purge_requests TO impulso_backend;

-- Finance services authorize current book grants inside every transaction.
GRANT USAGE ON SCHEMA finance TO impulso_backend;
GRANT SELECT, INSERT ON TABLE
    finance.books,
    finance.book_access,
    finance.accounts,
    finance.transactions
TO impulso_backend;
GRANT UPDATE (updated_at) ON TABLE finance.books, finance.accounts TO impulso_backend;
GRANT UPDATE (granted_at) ON TABLE finance.book_access TO impulso_backend;

-- Ledger metadata changes never grant rewrites of posted financial values.
GRANT SELECT, INSERT ON TABLE finance.categories, finance.transaction_groups, finance.transaction_classifications TO impulso_backend;
GRANT UPDATE (account_kind, opening_balance_on, version, updated_at, updated_by_user_id) ON TABLE finance.accounts TO impulso_backend;
GRANT UPDATE (voided_at, voided_by_user_id, void_reason, version, updated_at, updated_by_user_id) ON TABLE finance.transactions TO impulso_backend;
GRANT UPDATE (name, archived_at, archived_by_user_id, version, updated_at, updated_by_user_id) ON TABLE finance.categories TO impulso_backend;
GRANT UPDATE (category_id, version, updated_at, updated_by_user_id) ON TABLE finance.transaction_classifications TO impulso_backend;
GRANT UPDATE (updated_at) ON TABLE finance.transaction_groups TO impulso_backend;

-- Planning and wealth retain history through explicit metadata revisions.
GRANT SELECT, INSERT ON TABLE
    finance.budgets, finance.recurring_rules, finance.recurring_rule_lines,
    finance.planned_items, finance.planned_item_lines, finance.planned_item_allocations,
    finance.debt_details, finance.savings_goals, finance.goal_allocations,
    finance.assets, finance.asset_valuations
TO impulso_backend;
GRANT UPDATE (name, person_id, category_id, starts_on, ends_on, amount, archived_at, archived_by_user_id, version, updated_at, updated_by_user_id) ON TABLE finance.budgets TO impulso_backend;
GRANT UPDATE (name, interval, start_period, end_period, due_day, short_month_policy, canceled_at, canceled_by_user_id, version, updated_at, updated_by_user_id) ON TABLE finance.recurring_rules TO impulso_backend;
GRANT UPDATE (name, period_start, due_on, debt_account_id, quoted_total, components_resolved, canceled_at, canceled_by_user_id, version, updated_at, updated_by_user_id) ON TABLE finance.planned_items TO impulso_backend;
GRANT UPDATE (rule_version) ON TABLE finance.planned_items TO impulso_backend;
GRANT UPDATE (retired_at, retired_by_user_id, version, updated_at, updated_by_user_id) ON TABLE finance.recurring_rule_lines, finance.planned_item_lines, finance.asset_valuations TO impulso_backend;
GRANT UPDATE (revoked_at, revoked_by_user_id, version, updated_at, updated_by_user_id) ON TABLE finance.planned_item_allocations, finance.goal_allocations TO impulso_backend;
GRANT UPDATE (creditor, credit_limit, annual_rate, minimum_payment, statement_day, due_day, payment_terms, archived_at, archived_by_user_id, version, updated_at, updated_by_user_id) ON TABLE finance.debt_details TO impulso_backend;
GRANT UPDATE (name, target_amount, target_on, person_id, canceled_at, canceled_by_user_id, version, updated_at, updated_by_user_id) ON TABLE finance.savings_goals TO impulso_backend;
GRANT UPDATE (name, identity_text, ownership_text, person_id, archived_at, archived_by_user_id, version, updated_at, updated_by_user_id) ON TABLE finance.assets TO impulso_backend;

-- Import source snapshots remain immutable; review state and result links are bounded service writes.
GRANT SELECT, INSERT ON TABLE finance.import_batches, finance.import_rows, finance.monthly_summaries, finance.report_coverage TO impulso_backend;
GRANT UPDATE (status, blockers, reconciliation, committed_at, version, updated_at, updated_by_user_id) ON TABLE finance.import_batches TO impulso_backend;
GRANT UPDATE (blockers, result_transaction_id, result_planned_item_id, result_summary_id, result_valuation_id, result_account_id, consumed_at, retired_at, retired_by_user_id, version, updated_at, updated_by_user_id) ON TABLE finance.import_rows TO impulso_backend;
GRANT UPDATE (retired_at, retired_by_user_id, version, updated_at, updated_by_user_id) ON TABLE finance.monthly_summaries TO impulso_backend;
GRANT UPDATE (authority, reviewed_detail_count, reviewed_detail_digest, version, updated_at, updated_by_user_id) ON TABLE finance.report_coverage TO impulso_backend;

-- Owner-checked projections expose only Auth identifiers and grant state; locks reach base rows.
GRANT SELECT (id), UPDATE (updated_at) ON TABLE private.auth_users TO impulso_backend;
GRANT SELECT (id, user_id, not_after, oauth_client_id, scopes), UPDATE (updated_at)
ON TABLE private.auth_sessions TO impulso_backend;
GRANT SELECT (id, deleted_at) ON TABLE private.oauth_clients TO impulso_backend;
GRANT SELECT (user_id, client_id, scopes, revoked_at)
ON TABLE private.oauth_consents TO impulso_backend;

-- Environment-specific login credentials are provisioned separately.

