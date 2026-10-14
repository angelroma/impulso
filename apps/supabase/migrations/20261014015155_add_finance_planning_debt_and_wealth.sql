BEGIN;

ALTER TABLE "audit"."events"
  DROP CONSTRAINT "events_check";

ALTER TABLE "finance"."budgets"
  DROP CONSTRAINT "budgets_workspace_id_book_id_person_id_starts_on_ends_on_key";

ALTER TABLE "private"."operation_receipts"
  DROP CONSTRAINT "operation_receipts_operation_check";

CREATE TABLE "finance"."asset_valuations" (
  "id"                    uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id"          uuid                     NOT NULL,
  "book_id"               uuid                     NOT NULL,
  "currency"              text                     NOT NULL,
  "created_at"            timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"            timestamp with time zone NOT NULL DEFAULT now(),
  "created_by_user_id"    uuid,
  "updated_by_user_id"    uuid,
  "version"               integer                  NOT NULL DEFAULT 1,
  "asset_id"              uuid,
  "account_id"            uuid,
  "valued_on"             date                     NOT NULL,
  "amount"                numeric(20,4)            NOT NULL,
  "source"                text                     NOT NULL,
  "replaces_valuation_id" uuid,
  "retired_at"            timestamp with time zone,
  "retired_by_user_id"    uuid,
  CONSTRAINT "asset_valuations_amount_check" CHECK (((amount >= (0)::numeric) AND (amount < 'Infinity'::numeric))),
  CONSTRAINT "asset_valuations_check1" CHECK ((num_nonnulls(asset_id, account_id) = 1)),
  CONSTRAINT "asset_valuations_check2" CHECK (((replaces_valuation_id IS NULL) OR (replaces_valuation_id <> id))),
  CONSTRAINT "asset_valuations_check" CHECK (((retired_at IS NOT NULL) OR (retired_by_user_id IS NULL))),
  CONSTRAINT "asset_valuations_pkey" PRIMARY KEY (id),
  CONSTRAINT "asset_valuations_source_check" CHECK (((char_length(btrim(source)) > 0) AND (char_length(source) <= 2000))),
  CONSTRAINT "asset_valuations_valued_on_check" CHECK (((valued_on >= '0001-01-01'::date) AND (valued_on <= '9999-12-31'::date))),
  CONSTRAINT "asset_valuations_version_check" CHECK ((version > 0)),
  CONSTRAINT "asset_valuations_workspace_id_book_id_id_account_id_currenc_key" UNIQUE (workspace_id, book_id, id, account_id, currency),
  CONSTRAINT "asset_valuations_workspace_id_book_id_id_currency_key" UNIQUE (workspace_id, book_id, id, currency)
);

ALTER TABLE "finance"."asset_valuations"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "finance"."assets" (
  "id"                  uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id"        uuid                     NOT NULL,
  "book_id"             uuid                     NOT NULL,
  "currency"            text                     NOT NULL,
  "created_at"          timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"          timestamp with time zone NOT NULL DEFAULT now(),
  "created_by_user_id"  uuid,
  "updated_by_user_id"  uuid,
  "version"             integer                  NOT NULL DEFAULT 1,
  "name"                text                     NOT NULL,
  "identity_text"       text                     NOT NULL,
  "ownership_text"      text                     NOT NULL,
  "person_id"           uuid,
  "archived_at"         timestamp with time zone,
  "archived_by_user_id" uuid,
  CONSTRAINT "assets_check" CHECK (((archived_at IS NOT NULL) OR (archived_by_user_id IS NULL))),
  CONSTRAINT "assets_identity_text_check" CHECK (((char_length(btrim(identity_text)) > 0) AND (char_length(identity_text) <= 2000))),
  CONSTRAINT "assets_name_check" CHECK (((char_length(btrim(name)) > 0) AND (char_length(name) <= 200))),
  CONSTRAINT "assets_ownership_text_check" CHECK (((char_length(btrim(ownership_text)) > 0) AND (char_length(ownership_text) <= 2000))),
  CONSTRAINT "assets_pkey" PRIMARY KEY (id),
  CONSTRAINT "assets_version_check" CHECK ((version > 0)),
  CONSTRAINT "assets_workspace_id_book_id_id_currency_key" UNIQUE (workspace_id, book_id, id, currency)
);

ALTER TABLE "finance"."assets"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "finance"."debt_details" (
  "id"                  uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id"        uuid                     NOT NULL,
  "book_id"             uuid                     NOT NULL,
  "currency"            text                     NOT NULL,
  "created_at"          timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"          timestamp with time zone NOT NULL DEFAULT now(),
  "created_by_user_id"  uuid,
  "updated_by_user_id"  uuid,
  "version"             integer                  NOT NULL DEFAULT 1,
  "account_id"          uuid                     NOT NULL,
  "creditor"            text,
  "credit_limit"        numeric(20,4),
  "annual_rate"         numeric(20,4),
  "minimum_payment"     numeric(20,4),
  "statement_day"       smallint,
  "due_day"             smallint,
  "payment_terms"       text,
  "archived_at"         timestamp with time zone,
  "archived_by_user_id" uuid,
  CONSTRAINT "debt_details_annual_rate_check" CHECK (((annual_rate >= (0)::numeric) AND (annual_rate < 'Infinity'::numeric))),
  CONSTRAINT "debt_details_check" CHECK (((archived_at IS NOT NULL) OR (archived_by_user_id IS NULL))),
  CONSTRAINT "debt_details_credit_limit_check" CHECK (((credit_limit >= (0)::numeric) AND (credit_limit < 'Infinity'::numeric))),
  CONSTRAINT "debt_details_creditor_check" CHECK (((char_length(btrim(creditor)) > 0) AND (char_length(creditor) <= 200))),
  CONSTRAINT "debt_details_due_day_check" CHECK (((due_day >= 1) AND (due_day <= 31))),
  CONSTRAINT "debt_details_minimum_payment_check" CHECK (((minimum_payment >= (0)::numeric) AND (minimum_payment < 'Infinity'::numeric))),
  CONSTRAINT "debt_details_payment_terms_check" CHECK (((char_length(btrim(payment_terms)) > 0) AND (char_length(payment_terms) <= 2000))),
  CONSTRAINT "debt_details_pkey" PRIMARY KEY (id),
  CONSTRAINT "debt_details_statement_day_check" CHECK (((statement_day >= 1) AND (statement_day <= 31))),
  CONSTRAINT "debt_details_version_check" CHECK ((version > 0)),
  CONSTRAINT "debt_details_workspace_id_book_id_account_id_currency_key" UNIQUE (workspace_id, book_id, account_id, currency),
  CONSTRAINT "debt_details_workspace_id_book_id_id_currency_key" UNIQUE (workspace_id, book_id, id, currency)
);

ALTER TABLE "finance"."debt_details"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "finance"."goal_allocations" (
  "id"                 uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id"       uuid                     NOT NULL,
  "book_id"            uuid                     NOT NULL,
  "currency"           text                     NOT NULL,
  "created_at"         timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"         timestamp with time zone NOT NULL DEFAULT now(),
  "created_by_user_id" uuid,
  "updated_by_user_id" uuid,
  "version"            integer                  NOT NULL DEFAULT 1,
  "goal_id"            uuid                     NOT NULL,
  "account_id"         uuid                     NOT NULL,
  "amount"             numeric(20,4)            NOT NULL,
  "funding_basis"      text                     NOT NULL,
  "valuation_id"       uuid,
  "revoked_at"         timestamp with time zone,
  "revoked_by_user_id" uuid,
  CONSTRAINT "goal_allocations_amount_check" CHECK (((amount > (0)::numeric) AND (amount < 'Infinity'::numeric))),
  CONSTRAINT "goal_allocations_check1" CHECK ((((funding_basis = 'ledger'::text) AND (valuation_id IS NULL)) OR ((funding_basis = 'valuation'::text) AND (valuation_id IS
    NOT NULL)))),
  CONSTRAINT "goal_allocations_check" CHECK (((revoked_at IS NOT NULL) OR (revoked_by_user_id IS NULL))),
  CONSTRAINT "goal_allocations_funding_basis_check" CHECK ((funding_basis = ANY (ARRAY['ledger'::text, 'valuation'::text]))),
  CONSTRAINT "goal_allocations_pkey" PRIMARY KEY (id),
  CONSTRAINT "goal_allocations_version_check" CHECK ((version > 0)),
  CONSTRAINT "goal_allocations_workspace_id_book_id_id_currency_key" UNIQUE (workspace_id, book_id, id, currency)
);

ALTER TABLE "finance"."goal_allocations"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "finance"."planned_item_allocations" (
  "id"                   uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id"         uuid                     NOT NULL,
  "book_id"              uuid                     NOT NULL,
  "currency"             text                     NOT NULL,
  "created_at"           timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"           timestamp with time zone NOT NULL DEFAULT now(),
  "created_by_user_id"   uuid,
  "updated_by_user_id"   uuid,
  "version"              integer                  NOT NULL DEFAULT 1,
  "planned_item_id"      uuid                     NOT NULL,
  "planned_item_line_id" uuid                     NOT NULL,
  "transaction_id"       uuid                     NOT NULL,
  "kind"                 text                     NOT NULL,
  "amount"               numeric(20,4)            NOT NULL,
  "revoked_at"           timestamp with time zone,
  "revoked_by_user_id"   uuid,
  CONSTRAINT "planned_item_allocations_amount_check" CHECK (((amount > (0)::numeric) AND (amount < 'Infinity'::numeric))),
  CONSTRAINT "planned_item_allocations_check" CHECK (((revoked_at IS NOT NULL) OR (revoked_by_user_id IS NULL))),
  CONSTRAINT "planned_item_allocations_kind_check" CHECK ((kind = ANY (ARRAY['income'::text, 'expense'::text, 'transfer'::text]))),
  CONSTRAINT "planned_item_allocations_pkey" PRIMARY KEY (id),
  CONSTRAINT "planned_item_allocations_version_check" CHECK ((version > 0)),
  CONSTRAINT "planned_item_allocations_workspace_id_book_id_id_currency_key" UNIQUE (workspace_id, book_id, id, currency)
);

ALTER TABLE "finance"."planned_item_allocations"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "finance"."planned_item_lines" (
  "id"                     uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id"           uuid                     NOT NULL,
  "book_id"                uuid                     NOT NULL,
  "currency"               text                     NOT NULL,
  "created_at"             timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"             timestamp with time zone NOT NULL DEFAULT now(),
  "created_by_user_id"     uuid,
  "updated_by_user_id"     uuid,
  "version"                integer                  NOT NULL DEFAULT 1,
  "planned_item_id"        uuid                     NOT NULL,
  "line_number"            smallint                 NOT NULL,
  "kind"                   text                     NOT NULL,
  "amount"                 numeric(20,4)            NOT NULL,
  "category_id"            uuid,
  "source_account_id"      uuid,
  "destination_account_id" uuid,
  "beneficiary_person_id"  uuid,
  "retired_at"             timestamp with time zone,
  "retired_by_user_id"     uuid,
  CONSTRAINT "planned_item_lines_amount_check" CHECK (((amount > (0)::numeric) AND (amount < 'Infinity'::numeric))),
  CONSTRAINT "planned_item_lines_check1" CHECK ((((kind <> 'income'::text) OR (source_account_id IS NULL)) AND ((kind <> 'expense'::text) OR (destination_account_id IS NULL)))),
  CONSTRAINT "planned_item_lines_check2" CHECK (((source_account_id IS NULL) OR (destination_account_id IS NULL) OR (source_account_id <> destination_account_id))),
  CONSTRAINT "planned_item_lines_check3" CHECK (((retired_at IS NOT NULL) OR (retired_by_user_id IS NULL))),
  CONSTRAINT "planned_item_lines_check" CHECK (((kind <> 'transfer'::text) OR (category_id IS NULL))),
  CONSTRAINT "planned_item_lines_kind_check" CHECK ((kind = ANY (ARRAY['income'::text, 'expense'::text, 'transfer'::text]))),
  CONSTRAINT "planned_item_lines_line_number_check" CHECK (((line_number >= 1) AND (line_number <= 10))),
  CONSTRAINT "planned_item_lines_pkey" PRIMARY KEY (id),
  CONSTRAINT "planned_item_lines_version_check" CHECK ((version > 0)),
  CONSTRAINT "planned_item_lines_workspace_id_book_id_id_currency_key" UNIQUE (workspace_id, book_id, id, currency),
  CONSTRAINT "planned_item_lines_workspace_id_book_id_planned_item_id_id__key" UNIQUE (workspace_id, book_id, planned_item_id, id, currency, kind)
);

ALTER TABLE "finance"."planned_item_lines"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "finance"."planned_items" (
  "id"                  uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id"        uuid                     NOT NULL,
  "book_id"             uuid                     NOT NULL,
  "currency"            text                     NOT NULL,
  "created_at"          timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"          timestamp with time zone NOT NULL DEFAULT now(),
  "created_by_user_id"  uuid,
  "updated_by_user_id"  uuid,
  "version"             integer                  NOT NULL DEFAULT 1,
  "name"                text                     NOT NULL,
  "period_start"        date                     NOT NULL,
  "due_on"              date,
  "rule_id"             uuid,
  "rule_version"        integer,
  "debt_account_id"     uuid,
  "quoted_total"        numeric(20,4),
  "components_resolved" boolean                  NOT NULL DEFAULT true,
  "canceled_at"         timestamp with time zone,
  "canceled_by_user_id" uuid,
  CONSTRAINT "planned_items_check1" CHECK ((((rule_id IS NULL) AND (rule_version IS NULL)) OR ((rule_id IS NOT NULL) AND (rule_version IS NOT NULL)))),
  CONSTRAINT "planned_items_check2" CHECK (((canceled_at IS NOT NULL) OR (canceled_by_user_id IS NULL))),
  CONSTRAINT "planned_items_check" CHECK ((components_resolved OR (quoted_total IS NOT NULL))),
  CONSTRAINT "planned_items_due_on_check" CHECK (((due_on >= '0001-01-01'::date) AND (due_on <= '9999-12-31'::date))),
  CONSTRAINT "planned_items_name_check" CHECK (((char_length(btrim(name)) > 0) AND (char_length(name) <= 200))),
  CONSTRAINT "planned_items_period_start_check"
    CHECK ((((period_start >= '0001-01-01'::date) AND (period_start <= '9999-12-31'::date)) AND (date_trunc('month', period_start::timestamp)::date = period_start))),
  CONSTRAINT "planned_items_pkey" PRIMARY KEY (id),
  CONSTRAINT "planned_items_quoted_total_check" CHECK (((quoted_total > (0)::numeric) AND (quoted_total < 'Infinity'::numeric))),
  CONSTRAINT "planned_items_rule_version_check" CHECK ((rule_version > 0)),
  CONSTRAINT "planned_items_version_check" CHECK ((version > 0)),
  CONSTRAINT "planned_items_workspace_id_book_id_id_currency_key" UNIQUE (workspace_id, book_id, id, currency),
  CONSTRAINT "planned_items_workspace_id_book_id_rule_id_period_start_key" UNIQUE (workspace_id, book_id, rule_id, period_start)
);

ALTER TABLE "finance"."planned_items"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "finance"."recurring_rule_lines" (
  "id"                     uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id"           uuid                     NOT NULL,
  "book_id"                uuid                     NOT NULL,
  "currency"               text                     NOT NULL,
  "created_at"             timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"             timestamp with time zone NOT NULL DEFAULT now(),
  "created_by_user_id"     uuid,
  "updated_by_user_id"     uuid,
  "version"                integer                  NOT NULL DEFAULT 1,
  "rule_id"                uuid                     NOT NULL,
  "line_number"            smallint                 NOT NULL,
  "kind"                   text                     NOT NULL,
  "amount"                 numeric(20,4)            NOT NULL,
  "category_id"            uuid,
  "source_account_id"      uuid,
  "destination_account_id" uuid,
  "beneficiary_person_id"  uuid,
  "retired_at"             timestamp with time zone,
  "retired_by_user_id"     uuid,
  CONSTRAINT "recurring_rule_lines_amount_check" CHECK (((amount > (0)::numeric) AND (amount < 'Infinity'::numeric))),
  CONSTRAINT "recurring_rule_lines_check1" CHECK ((((kind <> 'income'::text) OR (source_account_id IS NULL)) AND ((kind <> 'expense'::text) OR (destination_account_id IS NULL)))),
  CONSTRAINT "recurring_rule_lines_check2" CHECK (((source_account_id IS NULL) OR (destination_account_id IS NULL) OR (source_account_id <> destination_account_id))),
  CONSTRAINT "recurring_rule_lines_check3" CHECK (((retired_at IS NOT NULL) OR (retired_by_user_id IS NULL))),
  CONSTRAINT "recurring_rule_lines_check" CHECK (((kind <> 'transfer'::text) OR (category_id IS NULL))),
  CONSTRAINT "recurring_rule_lines_kind_check" CHECK ((kind = ANY (ARRAY['income'::text, 'expense'::text, 'transfer'::text]))),
  CONSTRAINT "recurring_rule_lines_line_number_check" CHECK (((line_number >= 1) AND (line_number <= 10))),
  CONSTRAINT "recurring_rule_lines_pkey" PRIMARY KEY (id),
  CONSTRAINT "recurring_rule_lines_version_check" CHECK ((version > 0)),
  CONSTRAINT "recurring_rule_lines_workspace_id_book_id_id_currency_key" UNIQUE (workspace_id, book_id, id, currency)
);

ALTER TABLE "finance"."recurring_rule_lines"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "finance"."recurring_rules" (
  "id"                  uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id"        uuid                     NOT NULL,
  "book_id"             uuid                     NOT NULL,
  "currency"            text                     NOT NULL,
  "created_at"          timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"          timestamp with time zone NOT NULL DEFAULT now(),
  "created_by_user_id"  uuid,
  "updated_by_user_id"  uuid,
  "version"             integer                  NOT NULL DEFAULT 1,
  "name"                text                     NOT NULL,
  "interval"            text                     NOT NULL,
  "start_period"        date                     NOT NULL,
  "end_period"          date,
  "due_day"             smallint,
  "short_month_policy"  text,
  "canceled_at"         timestamp with time zone,
  "canceled_by_user_id" uuid,
  CONSTRAINT "recurring_rules_check1" CHECK ((((due_day IS NULL) AND (short_month_policy IS NULL)) OR ((due_day IS NOT NULL) AND (short_month_policy IS NOT NULL)))),
  CONSTRAINT "recurring_rules_check2" CHECK (((canceled_at IS NOT NULL) OR (canceled_by_user_id IS NULL))),
  CONSTRAINT "recurring_rules_check" CHECK (((end_period IS NULL) OR (end_period >= start_period))),
  CONSTRAINT "recurring_rules_due_day_check" CHECK (((due_day >= 1) AND (due_day <= 31))),
  CONSTRAINT "recurring_rules_end_period_check"
    CHECK ((((end_period >= '0001-01-01'::date) AND (end_period <= '9999-12-31'::date)) AND (date_trunc('month', end_period::timestamp)::date = end_period))),
  CONSTRAINT "recurring_rules_interval_check" CHECK (("interval" = ANY (ARRAY['monthly'::text, 'annual'::text]))),
  CONSTRAINT "recurring_rules_name_check" CHECK (((char_length(btrim(name)) > 0) AND (char_length(name) <= 200))),
  CONSTRAINT "recurring_rules_pkey" PRIMARY KEY (id),
  CONSTRAINT "recurring_rules_short_month_policy_check" CHECK ((short_month_policy = ANY (ARRAY['last_day'::text, 'reject'::text]))),
  CONSTRAINT "recurring_rules_start_period_check"
    CHECK ((((start_period >= '0001-01-01'::date) AND (start_period <= '9999-12-31'::date)) AND (date_trunc('month', start_period::timestamp)::date = start_period))),
  CONSTRAINT "recurring_rules_version_check" CHECK ((version > 0)),
  CONSTRAINT "recurring_rules_workspace_id_book_id_id_currency_key" UNIQUE (workspace_id, book_id, id, currency)
);

ALTER TABLE "finance"."recurring_rules"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "finance"."savings_goals" (
  "id"                  uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id"        uuid                     NOT NULL,
  "book_id"             uuid                     NOT NULL,
  "currency"            text                     NOT NULL,
  "created_at"          timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"          timestamp with time zone NOT NULL DEFAULT now(),
  "created_by_user_id"  uuid,
  "updated_by_user_id"  uuid,
  "version"             integer                  NOT NULL DEFAULT 1,
  "name"                text                     NOT NULL,
  "target_amount"       numeric(20,4)            NOT NULL,
  "target_on"           date,
  "person_id"           uuid,
  "canceled_at"         timestamp with time zone,
  "canceled_by_user_id" uuid,
  CONSTRAINT "savings_goals_check" CHECK (((canceled_at IS NOT NULL) OR (canceled_by_user_id IS NULL))),
  CONSTRAINT "savings_goals_name_check" CHECK (((char_length(btrim(name)) > 0) AND (char_length(name) <= 200))),
  CONSTRAINT "savings_goals_pkey" PRIMARY KEY (id),
  CONSTRAINT "savings_goals_target_amount_check" CHECK (((target_amount > (0)::numeric) AND (target_amount < 'Infinity'::numeric))),
  CONSTRAINT "savings_goals_target_on_check" CHECK (((target_on >= '0001-01-01'::date) AND (target_on <= '9999-12-31'::date))),
  CONSTRAINT "savings_goals_version_check" CHECK ((version > 0)),
  CONSTRAINT "savings_goals_workspace_id_book_id_id_currency_key" UNIQUE (workspace_id, book_id, id, currency)
);

ALTER TABLE "finance"."savings_goals"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE "finance"."budgets"
  ADD COLUMN "category_id" uuid;

ALTER TABLE "finance"."budgets"
  ADD COLUMN "category_kind" text NOT NULL DEFAULT 'expense'::text;

ALTER TABLE "audit"."events"
  ADD CONSTRAINT "events_check"
    CHECK
    ((((module = 'core'::text) AND (resource_type = ANY (ARRAY['workspace'::text, 'workspace_member'::text, 'person'::text, 'person_user_link'::text, 'person_access'::text,
    'person_alias'::text,
    'identity_link_request'::text,
    'ownership_transfer_request'::text,
    'purge_request'::text]))) OR
    ((module = 'finance'::text) AND (resource_type = ANY (ARRAY['book'::text, 'book_access'::text, 'account'::text, 'category'::text, 'transaction'::text,
    'transaction_group'::text,
    'budget'::text,
    'recurring_rule'::text,
    'planned_item'::text,
    'planned_item_allocation'::text,
    'debt_detail'::text,
    'savings_goal'::text,
    'goal_allocation'::text,
    'asset'::text,
    'asset_valuation'::text,
    'file'::text,
    'purge_request'::text]))) OR
    ((module = 'health'::text) AND (resource_type = ANY (ARRAY['person_access'::text, 'record'::text, 'medication'::text, 'appointment'::text, 'lab_result'::text, 'file'::text,
    'purge_request'::text]))) OR ((module = 'auth'::text) AND (resource_type = ANY (ARRAY['account'::text, 'session'::text])))));

ALTER TABLE "finance"."asset_valuations"
  ADD CONSTRAINT "asset_valuations_created_by_user_id_fkey" FOREIGN KEY (created_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE "finance"."asset_valuations"
  ADD CONSTRAINT "asset_valuations_retired_by_user_id_fkey" FOREIGN KEY (retired_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE "finance"."asset_valuations"
  ADD CONSTRAINT "asset_valuations_updated_by_user_id_fkey" FOREIGN KEY (updated_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE "finance"."asset_valuations"
  ADD CONSTRAINT "asset_valuations_workspace_id_book_id_account_id_currency_fkey" FOREIGN KEY (workspace_id, book_id, account_id, currency)
    REFERENCES finance.accounts(workspace_id, book_id, id, currency) ON DELETE RESTRICT;

ALTER TABLE "finance"."asset_valuations"
  ADD CONSTRAINT "asset_valuations_workspace_id_book_id_currency_fkey" FOREIGN KEY (workspace_id, book_id, currency) REFERENCES finance.books(workspace_id, id, currency)
    ON DELETE RESTRICT;

ALTER TABLE "finance"."asset_valuations"
  ADD CONSTRAINT "asset_valuations_workspace_id_book_id_replaces_valuation_i_fkey" FOREIGN KEY (workspace_id, book_id, replaces_valuation_id, currency)
    REFERENCES finance.asset_valuations(workspace_id, book_id, id, currency) ON DELETE RESTRICT;

ALTER TABLE "finance"."asset_valuations"
  ADD CONSTRAINT "asset_valuations_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES core.workspaces(id) ON DELETE RESTRICT;

ALTER TABLE "finance"."assets"
  ADD CONSTRAINT "assets_archived_by_user_id_fkey" FOREIGN KEY (archived_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE "finance"."assets"
  ADD CONSTRAINT "assets_created_by_user_id_fkey" FOREIGN KEY (created_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE "finance"."assets"
  ADD CONSTRAINT "assets_updated_by_user_id_fkey" FOREIGN KEY (updated_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE "finance"."assets"
  ADD CONSTRAINT "assets_workspace_id_book_id_currency_fkey" FOREIGN KEY (workspace_id, book_id, currency) REFERENCES finance.books(workspace_id, id, currency) ON DELETE RESTRICT;

ALTER TABLE "finance"."asset_valuations"
  ADD CONSTRAINT "asset_valuations_workspace_id_book_id_asset_id_currency_fkey" FOREIGN KEY (workspace_id, book_id, asset_id, currency)
    REFERENCES finance.assets(workspace_id, book_id, id, currency) ON DELETE RESTRICT;

ALTER TABLE "finance"."assets"
  ADD CONSTRAINT "assets_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES core.workspaces(id) ON DELETE RESTRICT;

ALTER TABLE "finance"."assets"
  ADD CONSTRAINT "assets_workspace_id_person_id_fkey" FOREIGN KEY (workspace_id, person_id) REFERENCES core.people(workspace_id, id) ON DELETE RESTRICT;

ALTER TABLE "finance"."budgets"
  ADD CONSTRAINT "budgets_category_kind_check" CHECK ((category_kind = 'expense'::text));

ALTER TABLE "finance"."budgets"
  ADD CONSTRAINT "budgets_workspace_id_book_id_category_id_currency_category_fkey" FOREIGN KEY (workspace_id, book_id, category_id, currency, category_kind)
    REFERENCES finance.categories(workspace_id, book_id, id, currency, kind) ON DELETE RESTRICT;

ALTER TABLE "finance"."budgets"
  ADD CONSTRAINT "budgets_workspace_id_book_id_person_id_category_id_starts_o_key" UNIQUE NULLS NOT DISTINCT (workspace_id, book_id, person_id, category_id, starts_on, ends_on);

ALTER TABLE "finance"."debt_details"
  ADD CONSTRAINT "debt_details_archived_by_user_id_fkey" FOREIGN KEY (archived_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE "finance"."debt_details"
  ADD CONSTRAINT "debt_details_created_by_user_id_fkey" FOREIGN KEY (created_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE "finance"."debt_details"
  ADD CONSTRAINT "debt_details_updated_by_user_id_fkey" FOREIGN KEY (updated_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE "finance"."debt_details"
  ADD CONSTRAINT "debt_details_workspace_id_book_id_account_id_currency_fkey" FOREIGN KEY (workspace_id, book_id, account_id, currency)
    REFERENCES finance.accounts(workspace_id, book_id, id, currency) ON DELETE RESTRICT;

ALTER TABLE "finance"."debt_details"
  ADD CONSTRAINT "debt_details_workspace_id_book_id_currency_fkey" FOREIGN KEY (workspace_id, book_id, currency) REFERENCES finance.books(workspace_id, id, currency)
    ON DELETE RESTRICT;

ALTER TABLE "finance"."debt_details"
  ADD CONSTRAINT "debt_details_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES core.workspaces(id) ON DELETE RESTRICT;

ALTER TABLE "finance"."goal_allocations"
  ADD CONSTRAINT "goal_allocations_created_by_user_id_fkey" FOREIGN KEY (created_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE "finance"."goal_allocations"
  ADD CONSTRAINT "goal_allocations_revoked_by_user_id_fkey" FOREIGN KEY (revoked_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE "finance"."goal_allocations"
  ADD CONSTRAINT "goal_allocations_updated_by_user_id_fkey" FOREIGN KEY (updated_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE "finance"."goal_allocations"
  ADD CONSTRAINT "goal_allocations_workspace_id_book_id_account_id_currency_fkey" FOREIGN KEY (workspace_id, book_id, account_id, currency)
    REFERENCES finance.accounts(workspace_id, book_id, id, currency) ON DELETE RESTRICT;

ALTER TABLE "finance"."goal_allocations"
  ADD CONSTRAINT "goal_allocations_workspace_id_book_id_currency_fkey" FOREIGN KEY (workspace_id, book_id, currency) REFERENCES finance.books(workspace_id, id, currency)
    ON DELETE RESTRICT;

ALTER TABLE "finance"."goal_allocations"
  ADD CONSTRAINT "goal_allocations_workspace_id_book_id_valuation_id_account_fkey" FOREIGN KEY (workspace_id, book_id, valuation_id, account_id, currency)
    REFERENCES finance.asset_valuations(workspace_id, book_id, id, account_id, currency) ON DELETE RESTRICT;

ALTER TABLE "finance"."goal_allocations"
  ADD CONSTRAINT "goal_allocations_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES core.workspaces(id) ON DELETE RESTRICT;

ALTER TABLE "finance"."planned_item_allocations"
  ADD CONSTRAINT "planned_item_allocations_created_by_user_id_fkey" FOREIGN KEY (created_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE "finance"."planned_item_allocations"
  ADD CONSTRAINT "planned_item_allocations_revoked_by_user_id_fkey" FOREIGN KEY (revoked_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE "finance"."planned_item_allocations"
  ADD CONSTRAINT "planned_item_allocations_updated_by_user_id_fkey" FOREIGN KEY (updated_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE "finance"."planned_item_allocations"
  ADD CONSTRAINT "planned_item_allocations_workspace_id_book_id_currency_fkey" FOREIGN KEY (workspace_id, book_id, currency) REFERENCES finance.books(workspace_id, id, currency)
    ON DELETE RESTRICT;

ALTER TABLE "finance"."planned_item_allocations"
  ADD CONSTRAINT "planned_item_allocations_workspace_id_book_id_transaction__fkey" FOREIGN KEY (workspace_id, book_id, transaction_id, currency, kind)
    REFERENCES finance.transactions(workspace_id, book_id, id, currency, kind) ON DELETE RESTRICT;

ALTER TABLE "finance"."planned_item_allocations"
  ADD CONSTRAINT "planned_item_allocations_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES core.workspaces(id) ON DELETE RESTRICT;

ALTER TABLE "finance"."planned_item_lines"
  ADD CONSTRAINT "planned_item_lines_created_by_user_id_fkey" FOREIGN KEY (created_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE "finance"."planned_item_lines"
  ADD CONSTRAINT "planned_item_lines_retired_by_user_id_fkey" FOREIGN KEY (retired_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE "finance"."planned_item_lines"
  ADD CONSTRAINT "planned_item_lines_updated_by_user_id_fkey" FOREIGN KEY (updated_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE "finance"."planned_item_lines"
  ADD CONSTRAINT "planned_item_lines_workspace_id_beneficiary_person_id_fkey" FOREIGN KEY (workspace_id, beneficiary_person_id) REFERENCES core.people(workspace_id, id)
    ON DELETE RESTRICT;

ALTER TABLE "finance"."planned_item_lines"
  ADD CONSTRAINT "planned_item_lines_workspace_id_book_id_category_id_curren_fkey" FOREIGN KEY (workspace_id, book_id, category_id, currency, kind)
    REFERENCES finance.categories(workspace_id, book_id, id, currency, kind) ON DELETE RESTRICT;

ALTER TABLE "finance"."planned_item_lines"
  ADD CONSTRAINT "planned_item_lines_workspace_id_book_id_currency_fkey" FOREIGN KEY (workspace_id, book_id, currency) REFERENCES finance.books(workspace_id, id, currency)
    ON DELETE RESTRICT;

ALTER TABLE "finance"."planned_item_lines"
  ADD CONSTRAINT "planned_item_lines_workspace_id_book_id_destination_accoun_fkey" FOREIGN KEY (workspace_id, book_id, destination_account_id, currency)
    REFERENCES finance.accounts(workspace_id, book_id, id, currency) ON DELETE RESTRICT;

ALTER TABLE "finance"."planned_item_allocations"
  ADD CONSTRAINT "planned_item_allocations_workspace_id_book_id_planned_item_fkey" FOREIGN KEY (workspace_id, book_id, planned_item_id, planned_item_line_id, currency, kind)
    REFERENCES finance.planned_item_lines(workspace_id, book_id, planned_item_id, id, currency, kind) ON DELETE RESTRICT;

ALTER TABLE "finance"."planned_item_lines"
  ADD CONSTRAINT "planned_item_lines_workspace_id_book_id_source_account_id__fkey" FOREIGN KEY (workspace_id, book_id, source_account_id, currency)
    REFERENCES finance.accounts(workspace_id, book_id, id, currency) ON DELETE RESTRICT;

ALTER TABLE "finance"."planned_item_lines"
  ADD CONSTRAINT "planned_item_lines_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES core.workspaces(id) ON DELETE RESTRICT;

ALTER TABLE "finance"."planned_items"
  ADD CONSTRAINT "planned_items_canceled_by_user_id_fkey" FOREIGN KEY (canceled_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE "finance"."planned_items"
  ADD CONSTRAINT "planned_items_created_by_user_id_fkey" FOREIGN KEY (created_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE "finance"."planned_items"
  ADD CONSTRAINT "planned_items_updated_by_user_id_fkey" FOREIGN KEY (updated_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE "finance"."planned_items"
  ADD CONSTRAINT "planned_items_workspace_id_book_id_currency_fkey" FOREIGN KEY (workspace_id, book_id, currency) REFERENCES finance.books(workspace_id, id, currency)
    ON DELETE RESTRICT;

ALTER TABLE "finance"."planned_items"
  ADD CONSTRAINT "planned_items_workspace_id_book_id_debt_account_id_currenc_fkey" FOREIGN KEY (workspace_id, book_id, debt_account_id, currency)
    REFERENCES finance.debt_details(workspace_id, book_id, account_id, currency) ON DELETE RESTRICT;

ALTER TABLE "finance"."planned_item_lines"
  ADD CONSTRAINT "planned_item_lines_workspace_id_book_id_planned_item_id_cu_fkey" FOREIGN KEY (workspace_id, book_id, planned_item_id, currency)
    REFERENCES finance.planned_items(workspace_id, book_id, id, currency) ON DELETE RESTRICT;

ALTER TABLE "finance"."planned_items"
  ADD CONSTRAINT "planned_items_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES core.workspaces(id) ON DELETE RESTRICT;

ALTER TABLE "finance"."recurring_rule_lines"
  ADD CONSTRAINT "recurring_rule_lines_created_by_user_id_fkey" FOREIGN KEY (created_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE "finance"."recurring_rule_lines"
  ADD CONSTRAINT "recurring_rule_lines_retired_by_user_id_fkey" FOREIGN KEY (retired_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE "finance"."recurring_rule_lines"
  ADD CONSTRAINT "recurring_rule_lines_updated_by_user_id_fkey" FOREIGN KEY (updated_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE "finance"."recurring_rule_lines"
  ADD CONSTRAINT "recurring_rule_lines_workspace_id_beneficiary_person_id_fkey" FOREIGN KEY (workspace_id, beneficiary_person_id) REFERENCES core.people(workspace_id, id)
    ON DELETE RESTRICT;

ALTER TABLE "finance"."recurring_rule_lines"
  ADD CONSTRAINT "recurring_rule_lines_workspace_id_book_id_category_id_curr_fkey" FOREIGN KEY (workspace_id, book_id, category_id, currency, kind)
    REFERENCES finance.categories(workspace_id, book_id, id, currency, kind) ON DELETE RESTRICT;

ALTER TABLE "finance"."recurring_rule_lines"
  ADD CONSTRAINT "recurring_rule_lines_workspace_id_book_id_currency_fkey" FOREIGN KEY (workspace_id, book_id, currency) REFERENCES finance.books(workspace_id, id, currency)
    ON DELETE RESTRICT;

ALTER TABLE "finance"."recurring_rule_lines"
  ADD CONSTRAINT "recurring_rule_lines_workspace_id_book_id_destination_acco_fkey" FOREIGN KEY (workspace_id, book_id, destination_account_id, currency)
    REFERENCES finance.accounts(workspace_id, book_id, id, currency) ON DELETE RESTRICT;

ALTER TABLE "finance"."recurring_rule_lines"
  ADD CONSTRAINT "recurring_rule_lines_workspace_id_book_id_source_account_i_fkey" FOREIGN KEY (workspace_id, book_id, source_account_id, currency)
    REFERENCES finance.accounts(workspace_id, book_id, id, currency) ON DELETE RESTRICT;

ALTER TABLE "finance"."recurring_rule_lines"
  ADD CONSTRAINT "recurring_rule_lines_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES core.workspaces(id) ON DELETE RESTRICT;

ALTER TABLE "finance"."recurring_rules"
  ADD CONSTRAINT "recurring_rules_canceled_by_user_id_fkey" FOREIGN KEY (canceled_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE "finance"."recurring_rules"
  ADD CONSTRAINT "recurring_rules_created_by_user_id_fkey" FOREIGN KEY (created_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE "finance"."recurring_rules"
  ADD CONSTRAINT "recurring_rules_updated_by_user_id_fkey" FOREIGN KEY (updated_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE "finance"."recurring_rules"
  ADD CONSTRAINT "recurring_rules_workspace_id_book_id_currency_fkey" FOREIGN KEY (workspace_id, book_id, currency) REFERENCES finance.books(workspace_id, id, currency)
    ON DELETE RESTRICT;

ALTER TABLE "finance"."planned_items"
  ADD CONSTRAINT "planned_items_workspace_id_book_id_rule_id_currency_fkey" FOREIGN KEY (workspace_id, book_id, rule_id, currency)
    REFERENCES finance.recurring_rules(workspace_id, book_id, id, currency) ON DELETE RESTRICT;

ALTER TABLE "finance"."recurring_rule_lines"
  ADD CONSTRAINT "recurring_rule_lines_workspace_id_book_id_rule_id_currency_fkey" FOREIGN KEY (workspace_id, book_id, rule_id, currency)
    REFERENCES finance.recurring_rules(workspace_id, book_id, id, currency) ON DELETE RESTRICT;

ALTER TABLE "finance"."recurring_rules"
  ADD CONSTRAINT "recurring_rules_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES core.workspaces(id) ON DELETE RESTRICT;

ALTER TABLE "finance"."savings_goals"
  ADD CONSTRAINT "savings_goals_canceled_by_user_id_fkey" FOREIGN KEY (canceled_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE "finance"."savings_goals"
  ADD CONSTRAINT "savings_goals_created_by_user_id_fkey" FOREIGN KEY (created_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE "finance"."savings_goals"
  ADD CONSTRAINT "savings_goals_updated_by_user_id_fkey" FOREIGN KEY (updated_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE "finance"."savings_goals"
  ADD CONSTRAINT "savings_goals_workspace_id_book_id_currency_fkey" FOREIGN KEY (workspace_id, book_id, currency) REFERENCES finance.books(workspace_id, id, currency)
    ON DELETE RESTRICT;

ALTER TABLE "finance"."goal_allocations"
  ADD CONSTRAINT "goal_allocations_workspace_id_book_id_goal_id_currency_fkey" FOREIGN KEY (workspace_id, book_id, goal_id, currency)
    REFERENCES finance.savings_goals(workspace_id, book_id, id, currency) ON DELETE RESTRICT;

ALTER TABLE "finance"."savings_goals"
  ADD CONSTRAINT "savings_goals_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES core.workspaces(id) ON DELETE RESTRICT;

ALTER TABLE "finance"."savings_goals"
  ADD CONSTRAINT "savings_goals_workspace_id_person_id_fkey" FOREIGN KEY (workspace_id, person_id) REFERENCES core.people(workspace_id, id) ON DELETE RESTRICT;

ALTER TABLE "private"."operation_receipts"
  ADD CONSTRAINT "operation_receipts_operation_check"
    CHECK
    ((operation = ANY (ARRAY['onboard'::text, 'create_person'::text, 'set_alias'::text, 'update_person'::text, 'archive_person'::text, 'restore_person'::text,
    'invite_member'::text,
    'accept_invitation'::text,
    'revoke_member'::text,
    'request_identity_link'::text,
    'answer_identity_link'::text,
    'offer_ownership_transfer'::text,
    'answer_ownership_transfer'::text,
    'create_book'::text,
    'update_book'::text,
    'archive_book'::text,
    'restore_book'::text,
    'create_account'::text,
    'update_account'::text,
    'archive_account'::text,
    'restore_account'::text,
    'create_transaction'::text,
    'configure_account'::text,
    'create_category'::text,
    'rename_category'::text,
    'archive_category'::text,
    'classify_transaction'::text,
    'record_transaction'::text,
    'record_transaction_group'::text,
    'replace_transaction'::text,
    'manage_budget'::text,
    'manage_plan'::text,
    'manage_debt'::text,
    'manage_goal'::text,
    'manage_asset'::text,
    'correct_transaction'::text,
    'void_transaction'::text,
    'create_budget'::text,
    'update_budget'::text,
    'archive_budget'::text,
    'restore_budget'::text,
    'enable_health'::text,
    'create_health_record'::text,
    'update_health_record'::text,
    'archive_health_record'::text,
    'restore_health_record'::text, 'grant_access'::text, 'revoke_access'::text, 'begin_upload'::text, 'finalize_upload'::text, 'archive_file'::text, 'restore_file'::text])));

CREATE UNIQUE INDEX asset_valuations_active_account_date_idx ON finance.asset_valuations USING btree (workspace_id, book_id, account_id, valued_on)
  WHERE ((retired_at IS NULL) AND (account_id IS NOT NULL));

CREATE UNIQUE INDEX asset_valuations_active_asset_date_idx ON finance.asset_valuations USING btree (workspace_id, book_id, asset_id, valued_on)
  WHERE ((retired_at IS NULL) AND (asset_id IS NOT NULL));

CREATE INDEX asset_valuations_book_created_at_idx ON finance.asset_valuations USING btree (workspace_id, book_id, created_at, id);

CREATE INDEX asset_valuations_created_by_user_id_idx ON finance.asset_valuations USING btree (created_by_user_id);

CREATE UNIQUE INDEX asset_valuations_one_replacement_idx ON finance.asset_valuations USING btree (workspace_id, book_id, replaces_valuation_id)
  WHERE (replaces_valuation_id IS NOT NULL);

CREATE INDEX asset_valuations_resource_1_fk_idx ON finance.asset_valuations USING btree (workspace_id, book_id, asset_id, currency);

CREATE INDEX asset_valuations_resource_2_fk_idx ON finance.asset_valuations USING btree (workspace_id, book_id, account_id, currency);

CREATE INDEX asset_valuations_resource_3_fk_idx ON finance.asset_valuations USING btree (workspace_id, book_id, replaces_valuation_id, currency);

CREATE INDEX asset_valuations_retired_by_user_id_idx ON finance.asset_valuations USING btree (retired_by_user_id);

CREATE INDEX asset_valuations_updated_by_user_id_idx ON finance.asset_valuations USING btree (updated_by_user_id);

CREATE INDEX assets_archived_by_user_id_idx ON finance.assets USING btree (archived_by_user_id);

CREATE INDEX assets_book_created_at_idx ON finance.assets USING btree (workspace_id, book_id, created_at, id);

CREATE INDEX assets_created_by_user_id_idx ON finance.assets USING btree (created_by_user_id);

CREATE INDEX assets_person_fk_idx ON finance.assets USING btree (workspace_id, person_id);

CREATE INDEX assets_updated_by_user_id_idx ON finance.assets USING btree (updated_by_user_id);

CREATE INDEX budgets_category_fk_idx ON finance.budgets USING btree (workspace_id, book_id, category_id, currency, category_kind);

CREATE INDEX debt_details_archived_by_user_id_idx ON finance.debt_details USING btree (archived_by_user_id);

CREATE INDEX debt_details_book_created_at_idx ON finance.debt_details USING btree (workspace_id, book_id, created_at, id);

CREATE INDEX debt_details_created_by_user_id_idx ON finance.debt_details USING btree (created_by_user_id);

CREATE INDEX debt_details_resource_1_fk_idx ON finance.debt_details USING btree (workspace_id, book_id, account_id, currency);

CREATE INDEX debt_details_updated_by_user_id_idx ON finance.debt_details USING btree (updated_by_user_id);

CREATE UNIQUE INDEX goal_allocations_active_match_idx ON finance.goal_allocations USING btree (workspace_id, book_id, goal_id, account_id)
  WHERE (revoked_at IS NULL);

CREATE INDEX goal_allocations_book_created_at_idx ON finance.goal_allocations USING btree (workspace_id, book_id, created_at, id);

CREATE INDEX goal_allocations_created_by_user_id_idx ON finance.goal_allocations USING btree (created_by_user_id);

CREATE INDEX goal_allocations_resource_1_fk_idx ON finance.goal_allocations USING btree (workspace_id, book_id, goal_id, currency);

CREATE INDEX goal_allocations_resource_2_fk_idx ON finance.goal_allocations USING btree (workspace_id, book_id, account_id, currency);

CREATE INDEX goal_allocations_resource_3_fk_idx ON finance.goal_allocations USING btree (workspace_id, book_id, valuation_id, account_id, currency);

CREATE INDEX goal_allocations_revoked_by_user_id_idx ON finance.goal_allocations USING btree (revoked_by_user_id);

CREATE INDEX goal_allocations_updated_by_user_id_idx ON finance.goal_allocations USING btree (updated_by_user_id);

CREATE UNIQUE INDEX planned_item_allocations_active_match_idx ON finance.planned_item_allocations USING btree (workspace_id, book_id, planned_item_line_id, transaction_id)
  WHERE (revoked_at IS NULL);

CREATE INDEX planned_item_allocations_book_created_at_idx ON finance.planned_item_allocations USING btree (workspace_id, book_id, created_at, id);

CREATE INDEX planned_item_allocations_created_by_user_id_idx ON finance.planned_item_allocations USING btree (created_by_user_id);

CREATE INDEX planned_item_allocations_resource_1_fk_idx ON finance.planned_item_allocations
  USING btree (workspace_id, book_id, planned_item_id, planned_item_line_id, currency, kind);

CREATE INDEX planned_item_allocations_resource_2_fk_idx ON finance.planned_item_allocations USING btree (workspace_id, book_id, transaction_id, currency, kind);

CREATE INDEX planned_item_allocations_revoked_by_user_id_idx ON finance.planned_item_allocations USING btree (revoked_by_user_id);

CREATE INDEX planned_item_allocations_updated_by_user_id_idx ON finance.planned_item_allocations USING btree (updated_by_user_id);

CREATE UNIQUE INDEX planned_item_lines_active_position_idx ON finance.planned_item_lines USING btree (workspace_id, book_id, planned_item_id, line_number)
  WHERE (retired_at IS NULL);

CREATE INDEX planned_item_lines_book_created_at_idx ON finance.planned_item_lines USING btree (workspace_id, book_id, created_at, id);

CREATE INDEX planned_item_lines_created_by_user_id_idx ON finance.planned_item_lines USING btree (created_by_user_id);

CREATE INDEX planned_item_lines_person_fk_idx ON finance.planned_item_lines USING btree (workspace_id, beneficiary_person_id);

CREATE INDEX planned_item_lines_resource_1_fk_idx ON finance.planned_item_lines USING btree (workspace_id, book_id, category_id, currency, kind);

CREATE INDEX planned_item_lines_resource_2_fk_idx ON finance.planned_item_lines USING btree (workspace_id, book_id, source_account_id, currency);

CREATE INDEX planned_item_lines_resource_3_fk_idx ON finance.planned_item_lines USING btree (workspace_id, book_id, destination_account_id, currency);

CREATE INDEX planned_item_lines_resource_4_fk_idx ON finance.planned_item_lines USING btree (workspace_id, book_id, planned_item_id, currency);

CREATE INDEX planned_item_lines_retired_by_user_id_idx ON finance.planned_item_lines USING btree (retired_by_user_id);

CREATE INDEX planned_item_lines_updated_by_user_id_idx ON finance.planned_item_lines USING btree (updated_by_user_id);

CREATE INDEX planned_items_book_created_at_idx ON finance.planned_items USING btree (workspace_id, book_id, created_at, id);

CREATE INDEX planned_items_canceled_by_user_id_idx ON finance.planned_items USING btree (canceled_by_user_id);

CREATE INDEX planned_items_created_by_user_id_idx ON finance.planned_items USING btree (created_by_user_id);

CREATE INDEX planned_items_due_idx ON finance.planned_items USING btree (workspace_id, book_id, period_start, due_on, id);

CREATE INDEX planned_items_resource_1_fk_idx ON finance.planned_items USING btree (workspace_id, book_id, rule_id, currency);

CREATE INDEX planned_items_resource_2_fk_idx ON finance.planned_items USING btree (workspace_id, book_id, debt_account_id, currency);

CREATE INDEX planned_items_updated_by_user_id_idx ON finance.planned_items USING btree (updated_by_user_id);

CREATE UNIQUE INDEX recurring_rule_lines_active_position_idx ON finance.recurring_rule_lines USING btree (workspace_id, book_id, rule_id, line_number)
  WHERE (retired_at IS NULL);

CREATE INDEX recurring_rule_lines_book_created_at_idx ON finance.recurring_rule_lines USING btree (workspace_id, book_id, created_at, id);

CREATE INDEX recurring_rule_lines_created_by_user_id_idx ON finance.recurring_rule_lines USING btree (created_by_user_id);

CREATE INDEX recurring_rule_lines_person_fk_idx ON finance.recurring_rule_lines USING btree (workspace_id, beneficiary_person_id);

CREATE INDEX recurring_rule_lines_resource_1_fk_idx ON finance.recurring_rule_lines USING btree (workspace_id, book_id, category_id, currency, kind);

CREATE INDEX recurring_rule_lines_resource_2_fk_idx ON finance.recurring_rule_lines USING btree (workspace_id, book_id, source_account_id, currency);

CREATE INDEX recurring_rule_lines_resource_3_fk_idx ON finance.recurring_rule_lines USING btree (workspace_id, book_id, destination_account_id, currency);

CREATE INDEX recurring_rule_lines_resource_4_fk_idx ON finance.recurring_rule_lines USING btree (workspace_id, book_id, rule_id, currency);

CREATE INDEX recurring_rule_lines_retired_by_user_id_idx ON finance.recurring_rule_lines USING btree (retired_by_user_id);

CREATE INDEX recurring_rule_lines_updated_by_user_id_idx ON finance.recurring_rule_lines USING btree (updated_by_user_id);

CREATE INDEX recurring_rules_book_created_at_idx ON finance.recurring_rules USING btree (workspace_id, book_id, created_at, id);

CREATE INDEX recurring_rules_canceled_by_user_id_idx ON finance.recurring_rules USING btree (canceled_by_user_id);

CREATE INDEX recurring_rules_created_by_user_id_idx ON finance.recurring_rules USING btree (created_by_user_id);

CREATE INDEX recurring_rules_updated_by_user_id_idx ON finance.recurring_rules USING btree (updated_by_user_id);

CREATE INDEX savings_goals_book_created_at_idx ON finance.savings_goals USING btree (workspace_id, book_id, created_at, id);

CREATE INDEX savings_goals_canceled_by_user_id_idx ON finance.savings_goals USING btree (canceled_by_user_id);

CREATE INDEX savings_goals_created_by_user_id_idx ON finance.savings_goals USING btree (created_by_user_id);

CREATE INDEX savings_goals_person_fk_idx ON finance.savings_goals USING btree (workspace_id, person_id);

CREATE INDEX savings_goals_updated_by_user_id_idx ON finance.savings_goals USING btree (updated_by_user_id);

GRANT UPDATE ("retired_at") ON TABLE "finance"."asset_valuations" TO "impulso_backend";

GRANT UPDATE ("retired_by_user_id") ON TABLE "finance"."asset_valuations" TO "impulso_backend";

GRANT UPDATE ("updated_at") ON TABLE "finance"."asset_valuations" TO "impulso_backend";

GRANT UPDATE ("updated_by_user_id") ON TABLE "finance"."asset_valuations" TO "impulso_backend";

GRANT UPDATE ("version") ON TABLE "finance"."asset_valuations" TO "impulso_backend";

GRANT INSERT, SELECT ON TABLE "finance"."asset_valuations" TO "impulso_backend";

GRANT UPDATE ("archived_at") ON TABLE "finance"."assets" TO "impulso_backend";

GRANT UPDATE ("archived_by_user_id") ON TABLE "finance"."assets" TO "impulso_backend";

GRANT UPDATE ("identity_text") ON TABLE "finance"."assets" TO "impulso_backend";

GRANT UPDATE ("name") ON TABLE "finance"."assets" TO "impulso_backend";

GRANT UPDATE ("ownership_text") ON TABLE "finance"."assets" TO "impulso_backend";

GRANT UPDATE ("person_id") ON TABLE "finance"."assets" TO "impulso_backend";

GRANT UPDATE ("updated_at") ON TABLE "finance"."assets" TO "impulso_backend";

GRANT UPDATE ("updated_by_user_id") ON TABLE "finance"."assets" TO "impulso_backend";

GRANT UPDATE ("version") ON TABLE "finance"."assets" TO "impulso_backend";

GRANT INSERT, SELECT ON TABLE "finance"."assets" TO "impulso_backend";

REVOKE ALL ON TABLE "finance"."budgets" FROM "impulso_backend";

REVOKE ALL ("amount") ON TABLE "finance"."budgets" FROM "impulso_backend";

GRANT UPDATE ("amount") ON TABLE "finance"."budgets" TO "impulso_backend";

REVOKE ALL ("archived_at") ON TABLE "finance"."budgets" FROM "impulso_backend";

GRANT UPDATE ("archived_at") ON TABLE "finance"."budgets" TO "impulso_backend";

REVOKE ALL ("archived_by_user_id") ON TABLE "finance"."budgets" FROM "impulso_backend";

GRANT UPDATE ("archived_by_user_id") ON TABLE "finance"."budgets" TO "impulso_backend";

REVOKE ALL ("category_id") ON TABLE "finance"."budgets" FROM "impulso_backend";

GRANT UPDATE ("category_id") ON TABLE "finance"."budgets" TO "impulso_backend";

REVOKE ALL ("ends_on") ON TABLE "finance"."budgets" FROM "impulso_backend";

GRANT UPDATE ("ends_on") ON TABLE "finance"."budgets" TO "impulso_backend";

REVOKE ALL ("name") ON TABLE "finance"."budgets" FROM "impulso_backend";

GRANT UPDATE ("name") ON TABLE "finance"."budgets" TO "impulso_backend";

REVOKE ALL ("person_id") ON TABLE "finance"."budgets" FROM "impulso_backend";

GRANT UPDATE ("person_id") ON TABLE "finance"."budgets" TO "impulso_backend";

REVOKE ALL ("starts_on") ON TABLE "finance"."budgets" FROM "impulso_backend";

GRANT UPDATE ("starts_on") ON TABLE "finance"."budgets" TO "impulso_backend";

REVOKE ALL ("updated_at") ON TABLE "finance"."budgets" FROM "impulso_backend";

GRANT UPDATE ("updated_at") ON TABLE "finance"."budgets" TO "impulso_backend";

REVOKE ALL ("updated_by_user_id") ON TABLE "finance"."budgets" FROM "impulso_backend";

GRANT UPDATE ("updated_by_user_id") ON TABLE "finance"."budgets" TO "impulso_backend";

REVOKE ALL ("version") ON TABLE "finance"."budgets" FROM "impulso_backend";

GRANT UPDATE ("version") ON TABLE "finance"."budgets" TO "impulso_backend";

GRANT INSERT, SELECT ON TABLE "finance"."budgets" TO "impulso_backend";

GRANT UPDATE ("annual_rate") ON TABLE "finance"."debt_details" TO "impulso_backend";

GRANT UPDATE ("archived_at") ON TABLE "finance"."debt_details" TO "impulso_backend";

GRANT UPDATE ("archived_by_user_id") ON TABLE "finance"."debt_details" TO "impulso_backend";

GRANT UPDATE ("credit_limit") ON TABLE "finance"."debt_details" TO "impulso_backend";

GRANT UPDATE ("creditor") ON TABLE "finance"."debt_details" TO "impulso_backend";

GRANT UPDATE ("due_day") ON TABLE "finance"."debt_details" TO "impulso_backend";

GRANT UPDATE ("minimum_payment") ON TABLE "finance"."debt_details" TO "impulso_backend";

GRANT UPDATE ("payment_terms") ON TABLE "finance"."debt_details" TO "impulso_backend";

GRANT UPDATE ("statement_day") ON TABLE "finance"."debt_details" TO "impulso_backend";

GRANT UPDATE ("updated_at") ON TABLE "finance"."debt_details" TO "impulso_backend";

GRANT UPDATE ("updated_by_user_id") ON TABLE "finance"."debt_details" TO "impulso_backend";

GRANT UPDATE ("version") ON TABLE "finance"."debt_details" TO "impulso_backend";

GRANT INSERT, SELECT ON TABLE "finance"."debt_details" TO "impulso_backend";

GRANT UPDATE ("revoked_at") ON TABLE "finance"."goal_allocations" TO "impulso_backend";

GRANT UPDATE ("revoked_by_user_id") ON TABLE "finance"."goal_allocations" TO "impulso_backend";

GRANT UPDATE ("updated_at") ON TABLE "finance"."goal_allocations" TO "impulso_backend";

GRANT UPDATE ("updated_by_user_id") ON TABLE "finance"."goal_allocations" TO "impulso_backend";

GRANT UPDATE ("version") ON TABLE "finance"."goal_allocations" TO "impulso_backend";

GRANT INSERT, SELECT ON TABLE "finance"."goal_allocations" TO "impulso_backend";

GRANT UPDATE ("revoked_at") ON TABLE "finance"."planned_item_allocations" TO "impulso_backend";

GRANT UPDATE ("revoked_by_user_id") ON TABLE "finance"."planned_item_allocations" TO "impulso_backend";

GRANT UPDATE ("updated_at") ON TABLE "finance"."planned_item_allocations" TO "impulso_backend";

GRANT UPDATE ("updated_by_user_id") ON TABLE "finance"."planned_item_allocations" TO "impulso_backend";

GRANT UPDATE ("version") ON TABLE "finance"."planned_item_allocations" TO "impulso_backend";

GRANT INSERT, SELECT ON TABLE "finance"."planned_item_allocations" TO "impulso_backend";

GRANT UPDATE ("retired_at") ON TABLE "finance"."planned_item_lines" TO "impulso_backend";

GRANT UPDATE ("retired_by_user_id") ON TABLE "finance"."planned_item_lines" TO "impulso_backend";

GRANT UPDATE ("updated_at") ON TABLE "finance"."planned_item_lines" TO "impulso_backend";

GRANT UPDATE ("updated_by_user_id") ON TABLE "finance"."planned_item_lines" TO "impulso_backend";

GRANT UPDATE ("version") ON TABLE "finance"."planned_item_lines" TO "impulso_backend";

GRANT INSERT, SELECT ON TABLE "finance"."planned_item_lines" TO "impulso_backend";

GRANT UPDATE ("canceled_at") ON TABLE "finance"."planned_items" TO "impulso_backend";

GRANT UPDATE ("canceled_by_user_id") ON TABLE "finance"."planned_items" TO "impulso_backend";

GRANT UPDATE ("components_resolved") ON TABLE "finance"."planned_items" TO "impulso_backend";

GRANT UPDATE ("debt_account_id") ON TABLE "finance"."planned_items" TO "impulso_backend";

GRANT UPDATE ("due_on") ON TABLE "finance"."planned_items" TO "impulso_backend";

GRANT UPDATE ("name") ON TABLE "finance"."planned_items" TO "impulso_backend";

GRANT UPDATE ("period_start") ON TABLE "finance"."planned_items" TO "impulso_backend";

GRANT UPDATE ("quoted_total") ON TABLE "finance"."planned_items" TO "impulso_backend";

GRANT UPDATE ("updated_at") ON TABLE "finance"."planned_items" TO "impulso_backend";

GRANT UPDATE ("updated_by_user_id") ON TABLE "finance"."planned_items" TO "impulso_backend";

GRANT UPDATE ("version") ON TABLE "finance"."planned_items" TO "impulso_backend";

GRANT INSERT, SELECT ON TABLE "finance"."planned_items" TO "impulso_backend";

GRANT UPDATE ("retired_at") ON TABLE "finance"."recurring_rule_lines" TO "impulso_backend";

GRANT UPDATE ("retired_by_user_id") ON TABLE "finance"."recurring_rule_lines" TO "impulso_backend";

GRANT UPDATE ("updated_at") ON TABLE "finance"."recurring_rule_lines" TO "impulso_backend";

GRANT UPDATE ("updated_by_user_id") ON TABLE "finance"."recurring_rule_lines" TO "impulso_backend";

GRANT UPDATE ("version") ON TABLE "finance"."recurring_rule_lines" TO "impulso_backend";

GRANT INSERT, SELECT ON TABLE "finance"."recurring_rule_lines" TO "impulso_backend";

GRANT UPDATE ("canceled_at") ON TABLE "finance"."recurring_rules" TO "impulso_backend";

GRANT UPDATE ("canceled_by_user_id") ON TABLE "finance"."recurring_rules" TO "impulso_backend";

GRANT UPDATE ("due_day") ON TABLE "finance"."recurring_rules" TO "impulso_backend";

GRANT UPDATE ("end_period") ON TABLE "finance"."recurring_rules" TO "impulso_backend";

GRANT UPDATE ("interval") ON TABLE "finance"."recurring_rules" TO "impulso_backend";

GRANT UPDATE ("name") ON TABLE "finance"."recurring_rules" TO "impulso_backend";

GRANT UPDATE ("short_month_policy") ON TABLE "finance"."recurring_rules" TO "impulso_backend";

GRANT UPDATE ("start_period") ON TABLE "finance"."recurring_rules" TO "impulso_backend";

GRANT UPDATE ("updated_at") ON TABLE "finance"."recurring_rules" TO "impulso_backend";

GRANT UPDATE ("updated_by_user_id") ON TABLE "finance"."recurring_rules" TO "impulso_backend";

GRANT UPDATE ("version") ON TABLE "finance"."recurring_rules" TO "impulso_backend";

GRANT INSERT, SELECT ON TABLE "finance"."recurring_rules" TO "impulso_backend";

GRANT UPDATE ("canceled_at") ON TABLE "finance"."savings_goals" TO "impulso_backend";

GRANT UPDATE ("canceled_by_user_id") ON TABLE "finance"."savings_goals" TO "impulso_backend";

GRANT UPDATE ("name") ON TABLE "finance"."savings_goals" TO "impulso_backend";

GRANT UPDATE ("person_id") ON TABLE "finance"."savings_goals" TO "impulso_backend";

GRANT UPDATE ("target_amount") ON TABLE "finance"."savings_goals" TO "impulso_backend";

GRANT UPDATE ("target_on") ON TABLE "finance"."savings_goals" TO "impulso_backend";

GRANT UPDATE ("updated_at") ON TABLE "finance"."savings_goals" TO "impulso_backend";

GRANT UPDATE ("updated_by_user_id") ON TABLE "finance"."savings_goals" TO "impulso_backend";

GRANT UPDATE ("version") ON TABLE "finance"."savings_goals" TO "impulso_backend";

GRANT INSERT, SELECT ON TABLE "finance"."savings_goals" TO "impulso_backend";

COMMIT;
