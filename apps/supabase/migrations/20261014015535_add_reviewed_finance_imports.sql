BEGIN;

ALTER TABLE "audit"."events"
  DROP CONSTRAINT "events_check";

ALTER TABLE "finance"."planned_items"
  DROP CONSTRAINT "planned_items_period_start_check";

ALTER TABLE "finance"."recurring_rules"
  DROP CONSTRAINT "recurring_rules_end_period_check";

ALTER TABLE "finance"."recurring_rules"
  DROP CONSTRAINT "recurring_rules_start_period_check";

ALTER TABLE "private"."operation_receipts"
  DROP CONSTRAINT "operation_receipts_operation_check";

CREATE TABLE "finance"."import_batches" (
  "id"                 uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id"       uuid                     NOT NULL,
  "book_id"            uuid                     NOT NULL,
  "currency"           text                     NOT NULL,
  "created_at"         timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"         timestamp with time zone NOT NULL DEFAULT now(),
  "created_by_user_id" uuid,
  "updated_by_user_id" uuid,
  "version"            integer                  NOT NULL DEFAULT 1,
  "actor_user_id"      uuid                     NOT NULL,
  "workbook_id"        text                     NOT NULL,
  "source_version"     text                     NOT NULL,
  "captured_at"        timestamp with time zone NOT NULL,
  "manifest"           jsonb                    NOT NULL,
  "review_digest"      bytea                    NOT NULL,
  "status"             text                     NOT NULL DEFAULT 'draft'::text,
  "blockers"           text[]                   NOT NULL DEFAULT '{}'::text[],
  "reconciliation"     jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "committed_at"       timestamp with time zone,
  CONSTRAINT "import_batches_blockers_check" CHECK ((cardinality(blockers) <= 1000)),
  CONSTRAINT "import_batches_check" CHECK ((((status = 'committed'::text) AND (committed_at IS NOT NULL)) OR (status <> 'committed'::text))),
  CONSTRAINT "import_batches_manifest_check" CHECK (((jsonb_typeof(manifest) = 'object'::text) AND (octet_length((manifest)::text) <= 32768))),
  CONSTRAINT "import_batches_pkey" PRIMARY KEY (id),
  CONSTRAINT "import_batches_reconciliation_check" CHECK (((jsonb_typeof(reconciliation) = 'object'::text) AND (octet_length((reconciliation)::text) <= 32768))),
  CONSTRAINT "import_batches_review_digest_check" CHECK ((octet_length(review_digest) = 32)),
  CONSTRAINT "import_batches_source_version_check" CHECK (((char_length(btrim(source_version)) > 0) AND (char_length(source_version) <= 200))),
  CONSTRAINT "import_batches_status_check" CHECK ((status = ANY (ARRAY['draft'::text, 'ready'::text, 'committed'::text, 'retired'::text]))),
  CONSTRAINT "import_batches_version_check" CHECK ((version > 0)),
  CONSTRAINT "import_batches_workbook_id_check" CHECK (((char_length(btrim(workbook_id)) > 0) AND (char_length(workbook_id) <= 200))),
  CONSTRAINT "import_batches_workspace_id_book_id_id_currency_key" UNIQUE (workspace_id, book_id, id, currency),
  CONSTRAINT "import_batches_workspace_id_book_id_id_workbook_id_currency_key" UNIQUE (workspace_id, book_id, id, workbook_id, currency)
);

ALTER TABLE "finance"."import_batches"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "finance"."import_rows" (
  "id"                     uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id"           uuid                     NOT NULL,
  "book_id"                uuid                     NOT NULL,
  "currency"               text                     NOT NULL,
  "created_at"             timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"             timestamp with time zone NOT NULL DEFAULT now(),
  "created_by_user_id"     uuid,
  "updated_by_user_id"     uuid,
  "version"                integer                  NOT NULL DEFAULT 1,
  "batch_id"               uuid                     NOT NULL,
  "row_number"             smallint                 NOT NULL,
  "workbook_id"            text                     NOT NULL,
  "sheet_id"               bigint                   NOT NULL,
  "source_cell"            text                     NOT NULL,
  "period_start"           date,
  "source_key"             text                     NOT NULL,
  "source_digest"          bytea                    NOT NULL,
  "source_snapshot"        jsonb                    NOT NULL,
  "mapping"                jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "role"                   text                     NOT NULL DEFAULT 'unknown'::text,
  "amount"                 numeric(20,4),
  "kind"                   text,
  "category_id"            uuid,
  "account_id"             uuid,
  "destination_account_id" uuid,
  "person_id"              uuid,
  "accepted"               boolean                  NOT NULL DEFAULT false,
  "blockers"               text[]                   NOT NULL DEFAULT '{}'::text[],
  "result_transaction_id"  uuid,
  "result_planned_item_id" uuid,
  "result_summary_id"      uuid,
  "result_valuation_id"    uuid,
  "result_account_id"      uuid,
  "consumed_at"            timestamp with time zone,
  "replaces_row_id"        uuid,
  "retired_at"             timestamp with time zone,
  "retired_by_user_id"     uuid,
  CONSTRAINT "import_rows_amount_check" CHECK (((amount > '-Infinity'::numeric) AND (amount < 'Infinity'::numeric))),
  CONSTRAINT "import_rows_blockers_check" CHECK ((cardinality(blockers) <= 100)),
  CONSTRAINT "import_rows_check1" CHECK (((replaces_row_id IS NULL) OR (replaces_row_id <> id))),
  CONSTRAINT "import_rows_check2" CHECK (((consumed_at IS NULL) OR (accepted AND (role <> ALL (ARRAY['reference'::text, 'unknown'::text]))))),
  CONSTRAINT "import_rows_check3"
    CHECK
    (((consumed_at IS NULL) OR ((num_nonnulls(result_transaction_id, result_planned_item_id, result_summary_id, result_valuation_id, result_account_id) = 1) AND (((role =
    'actual_detail'::text) AND (result_transaction_id IS NOT NULL)) OR ((role = 'actual_summary'::text) AND (result_summary_id IS
    NOT NULL)) OR ((role = 'planned'::text) AND (result_planned_item_id IS NOT NULL)) OR ((role = 'valuation'::text) AND (result_valuation_id IS
    NOT NULL)) OR ((role = 'opening_balance'::text) AND (result_account_id IS NOT NULL)))))),
  CONSTRAINT "import_rows_check" CHECK (((retired_at IS NOT NULL) OR (retired_by_user_id IS NULL))),
  CONSTRAINT "import_rows_kind_check" CHECK ((kind = ANY (ARRAY['income'::text, 'expense'::text, 'transfer'::text]))),
  CONSTRAINT "import_rows_mapping_check" CHECK (((jsonb_typeof(mapping) = 'object'::text) AND (octet_length((mapping)::text) <= 32768))),
  CONSTRAINT "import_rows_period_start_check"
    CHECK ((((period_start >= '0001-01-01'::date) AND (period_start <= '9999-12-31'::date)) AND (date_trunc('month', period_start::timestamp)::date = period_start))),
  CONSTRAINT "import_rows_pkey" PRIMARY KEY (id),
  CONSTRAINT "import_rows_role_check"
    CHECK ((role = ANY (ARRAY['actual_detail'::text, 'actual_summary'::text, 'planned'::text, 'opening_balance'::text, 'valuation'::text, 'reference'::text, 'unknown'::text]))),
  CONSTRAINT "import_rows_row_number_check" CHECK (((row_number >= 1) AND (row_number <= 100))),
  CONSTRAINT "import_rows_sheet_id_check" CHECK ((sheet_id >= 0)),
  CONSTRAINT "import_rows_source_cell_check" CHECK ((source_cell ~ '^[A-Z]{1,4}[1-9][0-9]{0,6}$'::text)),
  CONSTRAINT "import_rows_source_digest_check" CHECK ((octet_length(source_digest) = 32)),
  CONSTRAINT "import_rows_source_key_check" CHECK (((char_length(source_key) >= 1) AND (char_length(source_key) <= 1000))),
  CONSTRAINT "import_rows_source_snapshot_check" CHECK (((jsonb_typeof(source_snapshot) = 'object'::text) AND (octet_length((source_snapshot)::text) <= 32768))),
  CONSTRAINT "import_rows_version_check" CHECK ((version > 0)),
  CONSTRAINT "import_rows_workbook_id_check" CHECK (((char_length(btrim(workbook_id)) > 0) AND (char_length(workbook_id) <= 200))),
  CONSTRAINT "import_rows_workspace_id_book_id_batch_id_row_number_key" UNIQUE (workspace_id, book_id, batch_id, row_number),
  CONSTRAINT "import_rows_workspace_id_book_id_id_currency_key" UNIQUE (workspace_id, book_id, id, currency)
);

ALTER TABLE "finance"."import_rows"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "finance"."monthly_summaries" (
  "id"                  uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id"        uuid                     NOT NULL,
  "book_id"             uuid                     NOT NULL,
  "currency"            text                     NOT NULL,
  "created_at"          timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"          timestamp with time zone NOT NULL DEFAULT now(),
  "created_by_user_id"  uuid,
  "updated_by_user_id"  uuid,
  "version"             integer                  NOT NULL DEFAULT 1,
  "period_start"        date                     NOT NULL,
  "kind"                text                     NOT NULL,
  "amount"              numeric(20,4)            NOT NULL,
  "category_id"         uuid,
  "import_row_id"       uuid                     NOT NULL,
  "replaces_summary_id" uuid,
  "retired_at"          timestamp with time zone,
  "retired_by_user_id"  uuid,
  CONSTRAINT "monthly_summaries_amount_check" CHECK (((amount >= (0)::numeric) AND (amount < 'Infinity'::numeric))),
  CONSTRAINT "monthly_summaries_check1" CHECK (((replaces_summary_id IS NULL) OR (replaces_summary_id <> id))),
  CONSTRAINT "monthly_summaries_check" CHECK (((retired_at IS NOT NULL) OR (retired_by_user_id IS NULL))),
  CONSTRAINT "monthly_summaries_kind_check" CHECK ((kind = ANY (ARRAY['income'::text, 'expense'::text]))),
  CONSTRAINT "monthly_summaries_period_start_check"
    CHECK ((((period_start >= '0001-01-01'::date) AND (period_start <= '9999-12-31'::date)) AND (date_trunc('month', period_start::timestamp)::date = period_start))),
  CONSTRAINT "monthly_summaries_pkey" PRIMARY KEY (id),
  CONSTRAINT "monthly_summaries_version_check" CHECK ((version > 0)),
  CONSTRAINT "monthly_summaries_workspace_id_book_id_id_currency_key" UNIQUE (workspace_id, book_id, id, currency),
  CONSTRAINT "monthly_summaries_workspace_id_book_id_import_row_id_key" UNIQUE (workspace_id, book_id, import_row_id)
);

ALTER TABLE "finance"."monthly_summaries"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "finance"."report_coverage" (
  "id"                     uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id"           uuid                     NOT NULL,
  "book_id"                uuid                     NOT NULL,
  "currency"               text                     NOT NULL,
  "created_at"             timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"             timestamp with time zone NOT NULL DEFAULT now(),
  "created_by_user_id"     uuid,
  "updated_by_user_id"     uuid,
  "version"                integer                  NOT NULL DEFAULT 1,
  "period_start"           date                     NOT NULL,
  "kind"                   text                     NOT NULL,
  "category_id"            uuid,
  "authority"              text                     NOT NULL,
  "reviewed_detail_count"  bigint                   NOT NULL,
  "reviewed_detail_digest" bytea,
  CONSTRAINT "report_coverage_authority_check" CHECK ((authority = ANY (ARRAY['detail'::text, 'summary'::text]))),
  CONSTRAINT "report_coverage_kind_check" CHECK ((kind = ANY (ARRAY['income'::text, 'expense'::text]))),
  CONSTRAINT "report_coverage_period_start_check"
    CHECK ((((period_start >= '0001-01-01'::date) AND (period_start <= '9999-12-31'::date)) AND (date_trunc('month', period_start::timestamp)::date = period_start))),
  CONSTRAINT "report_coverage_pkey" PRIMARY KEY (id),
  CONSTRAINT "report_coverage_reviewed_detail_count_check" CHECK ((reviewed_detail_count >= 0)),
  CONSTRAINT "report_coverage_reviewed_detail_digest_check" CHECK ((octet_length(reviewed_detail_digest) = 32)),
  CONSTRAINT "report_coverage_version_check" CHECK ((version > 0)),
  CONSTRAINT "report_coverage_workspace_id_book_id_currency_period_start__key" UNIQUE NULLS NOT DISTINCT (workspace_id, book_id, currency, period_start, kind, category_id),
  CONSTRAINT "report_coverage_workspace_id_book_id_id_currency_key" UNIQUE (workspace_id, book_id, id, currency)
);

ALTER TABLE "finance"."report_coverage"
  ENABLE ROW LEVEL SECURITY;

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
    'import_batch'::text,
    'import_row'::text,
    'monthly_summary'::text,
    'report_coverage'::text,
    'file'::text,
    'purge_request'::text]))) OR
    ((module = 'health'::text) AND (resource_type = ANY (ARRAY['person_access'::text, 'record'::text, 'medication'::text, 'appointment'::text, 'lab_result'::text, 'file'::text,
    'purge_request'::text]))) OR ((module = 'auth'::text) AND (resource_type = ANY (ARRAY['account'::text, 'session'::text])))));

ALTER TABLE "finance"."import_batches"
  ADD CONSTRAINT "import_batches_created_by_user_id_fkey" FOREIGN KEY (created_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE "finance"."import_batches"
  ADD CONSTRAINT "import_batches_updated_by_user_id_fkey" FOREIGN KEY (updated_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE "finance"."import_batches"
  ADD CONSTRAINT "import_batches_workspace_id_book_id_currency_fkey" FOREIGN KEY (workspace_id, book_id, currency) REFERENCES finance.books(workspace_id, id, currency)
    ON DELETE RESTRICT;

ALTER TABLE "finance"."import_batches"
  ADD CONSTRAINT "import_batches_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES core.workspaces(id) ON DELETE RESTRICT;

ALTER TABLE "finance"."import_rows"
  ADD CONSTRAINT "import_rows_created_by_user_id_fkey" FOREIGN KEY (created_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE "finance"."import_rows"
  ADD CONSTRAINT "import_rows_retired_by_user_id_fkey" FOREIGN KEY (retired_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE "finance"."import_rows"
  ADD CONSTRAINT "import_rows_updated_by_user_id_fkey" FOREIGN KEY (updated_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE "finance"."import_rows"
  ADD CONSTRAINT "import_rows_workspace_id_book_id_account_id_currency_fkey" FOREIGN KEY (workspace_id, book_id, account_id, currency)
    REFERENCES finance.accounts(workspace_id, book_id, id, currency) ON DELETE RESTRICT;

ALTER TABLE "finance"."import_rows"
  ADD CONSTRAINT "import_rows_workspace_id_book_id_batch_id_workbook_id_curr_fkey" FOREIGN KEY (workspace_id, book_id, batch_id, workbook_id, currency)
    REFERENCES finance.import_batches(workspace_id, book_id, id, workbook_id, currency) ON DELETE RESTRICT;

ALTER TABLE "finance"."import_rows"
  ADD CONSTRAINT "import_rows_workspace_id_book_id_category_id_currency_fkey" FOREIGN KEY (workspace_id, book_id, category_id, currency)
    REFERENCES finance.categories(workspace_id, book_id, id, currency) ON DELETE RESTRICT;

ALTER TABLE "finance"."import_rows"
  ADD CONSTRAINT "import_rows_workspace_id_book_id_currency_fkey" FOREIGN KEY (workspace_id, book_id, currency) REFERENCES finance.books(workspace_id, id, currency)
    ON DELETE RESTRICT;

ALTER TABLE "finance"."import_rows"
  ADD CONSTRAINT "import_rows_workspace_id_book_id_destination_account_id_cu_fkey" FOREIGN KEY (workspace_id, book_id, destination_account_id, currency)
    REFERENCES finance.accounts(workspace_id, book_id, id, currency) ON DELETE RESTRICT;

ALTER TABLE "finance"."import_rows"
  ADD CONSTRAINT "import_rows_workspace_id_book_id_replaces_row_id_currency_fkey" FOREIGN KEY (workspace_id, book_id, replaces_row_id, currency)
    REFERENCES finance.import_rows(workspace_id, book_id, id, currency) ON DELETE RESTRICT;

ALTER TABLE "finance"."import_rows"
  ADD CONSTRAINT "import_rows_workspace_id_book_id_result_account_id_currenc_fkey" FOREIGN KEY (workspace_id, book_id, result_account_id, currency)
    REFERENCES finance.accounts(workspace_id, book_id, id, currency) ON DELETE RESTRICT;

ALTER TABLE "finance"."import_rows"
  ADD CONSTRAINT "import_rows_workspace_id_book_id_result_planned_item_id_cu_fkey" FOREIGN KEY (workspace_id, book_id, result_planned_item_id, currency)
    REFERENCES finance.planned_items(workspace_id, book_id, id, currency) ON DELETE RESTRICT;

ALTER TABLE "finance"."import_rows"
  ADD CONSTRAINT "import_rows_workspace_id_book_id_result_transaction_id_cur_fkey" FOREIGN KEY (workspace_id, book_id, result_transaction_id, currency)
    REFERENCES finance.transactions(workspace_id, book_id, id, currency) ON DELETE RESTRICT;

ALTER TABLE "finance"."import_rows"
  ADD CONSTRAINT "import_rows_workspace_id_book_id_result_valuation_id_curre_fkey" FOREIGN KEY (workspace_id, book_id, result_valuation_id, currency)
    REFERENCES finance.asset_valuations(workspace_id, book_id, id, currency) ON DELETE RESTRICT;

ALTER TABLE "finance"."import_rows"
  ADD CONSTRAINT "import_rows_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES core.workspaces(id) ON DELETE RESTRICT;

ALTER TABLE "finance"."import_rows"
  ADD CONSTRAINT "import_rows_workspace_id_person_id_fkey" FOREIGN KEY (workspace_id, person_id) REFERENCES core.people(workspace_id, id) ON DELETE RESTRICT;

ALTER TABLE "finance"."monthly_summaries"
  ADD CONSTRAINT "monthly_summaries_created_by_user_id_fkey" FOREIGN KEY (created_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE "finance"."monthly_summaries"
  ADD CONSTRAINT "monthly_summaries_retired_by_user_id_fkey" FOREIGN KEY (retired_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE "finance"."monthly_summaries"
  ADD CONSTRAINT "monthly_summaries_updated_by_user_id_fkey" FOREIGN KEY (updated_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE "finance"."monthly_summaries"
  ADD CONSTRAINT "monthly_summaries_workspace_id_book_id_category_id_currenc_fkey" FOREIGN KEY (workspace_id, book_id, category_id, currency, kind)
    REFERENCES finance.categories(workspace_id, book_id, id, currency, kind) ON DELETE RESTRICT;

ALTER TABLE "finance"."monthly_summaries"
  ADD CONSTRAINT "monthly_summaries_workspace_id_book_id_currency_fkey" FOREIGN KEY (workspace_id, book_id, currency) REFERENCES finance.books(workspace_id, id, currency)
    ON DELETE RESTRICT;

ALTER TABLE "finance"."import_rows"
  ADD CONSTRAINT "import_rows_result_summary_fk" FOREIGN KEY (workspace_id, book_id, result_summary_id, currency)
    REFERENCES finance.monthly_summaries(workspace_id, book_id, id, currency) ON DELETE RESTRICT;

ALTER TABLE "finance"."monthly_summaries"
  ADD CONSTRAINT "monthly_summaries_workspace_id_book_id_import_row_id_curre_fkey" FOREIGN KEY (workspace_id, book_id, import_row_id, currency)
    REFERENCES finance.import_rows(workspace_id, book_id, id, currency) ON DELETE RESTRICT;

ALTER TABLE "finance"."monthly_summaries"
  ADD CONSTRAINT "monthly_summaries_workspace_id_book_id_replaces_summary_id_fkey" FOREIGN KEY (workspace_id, book_id, replaces_summary_id, currency)
    REFERENCES finance.monthly_summaries(workspace_id, book_id, id, currency) ON DELETE RESTRICT;

ALTER TABLE "finance"."monthly_summaries"
  ADD CONSTRAINT "monthly_summaries_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES core.workspaces(id) ON DELETE RESTRICT;

ALTER TABLE "finance"."planned_items"
  ADD CONSTRAINT "planned_items_period_start_check"
    CHECK ((((period_start >= '0001-01-01'::date) AND (period_start <= '9999-12-31'::date)) AND (date_trunc('month', period_start::timestamp)::date = period_start)));

ALTER TABLE "finance"."recurring_rules"
  ADD CONSTRAINT "recurring_rules_end_period_check"
    CHECK ((((end_period >= '0001-01-01'::date) AND (end_period <= '9999-12-31'::date)) AND (date_trunc('month', end_period::timestamp)::date = end_period)));

ALTER TABLE "finance"."recurring_rules"
  ADD CONSTRAINT "recurring_rules_start_period_check"
    CHECK ((((start_period >= '0001-01-01'::date) AND (start_period <= '9999-12-31'::date)) AND (date_trunc('month', start_period::timestamp)::date = start_period)));

ALTER TABLE "finance"."report_coverage"
  ADD CONSTRAINT "report_coverage_created_by_user_id_fkey" FOREIGN KEY (created_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE "finance"."report_coverage"
  ADD CONSTRAINT "report_coverage_updated_by_user_id_fkey" FOREIGN KEY (updated_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE "finance"."report_coverage"
  ADD CONSTRAINT "report_coverage_workspace_id_book_id_category_id_currency__fkey" FOREIGN KEY (workspace_id, book_id, category_id, currency, kind)
    REFERENCES finance.categories(workspace_id, book_id, id, currency, kind) ON DELETE RESTRICT;

ALTER TABLE "finance"."report_coverage"
  ADD CONSTRAINT "report_coverage_workspace_id_book_id_currency_fkey" FOREIGN KEY (workspace_id, book_id, currency) REFERENCES finance.books(workspace_id, id, currency)
    ON DELETE RESTRICT;

ALTER TABLE "finance"."report_coverage"
  ADD CONSTRAINT "report_coverage_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES core.workspaces(id) ON DELETE RESTRICT;

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
    'preview_finance_import'::text,
    'commit_finance_import'::text,
    'replace_finance_import'::text,
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

CREATE INDEX import_batches_actor_status_idx ON finance.import_batches USING btree (actor_user_id, workspace_id, book_id, status, created_at, id);

CREATE INDEX import_batches_book_created_at_idx ON finance.import_batches USING btree (workspace_id, book_id, created_at, id);

CREATE INDEX import_batches_created_by_user_id_idx ON finance.import_batches USING btree (created_by_user_id);

CREATE INDEX import_batches_updated_by_user_id_idx ON finance.import_batches USING btree (updated_by_user_id);

CREATE INDEX import_rows_book_created_at_idx ON finance.import_rows USING btree (workspace_id, book_id, created_at, id);

CREATE UNIQUE INDEX import_rows_consumed_source_idx ON finance.import_rows USING btree (workspace_id, book_id, workbook_id, sheet_id, source_cell, period_start) NULLS NOT DISTINCT
  WHERE ((consumed_at IS NOT NULL) AND (retired_at IS NULL));

CREATE INDEX import_rows_created_by_user_id_idx ON finance.import_rows USING btree (created_by_user_id);

CREATE UNIQUE INDEX import_rows_one_replacement_idx ON finance.import_rows USING btree (workspace_id, book_id, replaces_row_id)
  WHERE (replaces_row_id IS NOT NULL);

CREATE INDEX import_rows_person_fk_idx ON finance.import_rows USING btree (workspace_id, person_id);

CREATE INDEX import_rows_resource_10_fk_idx ON finance.import_rows USING btree (workspace_id, book_id, replaces_row_id, currency);

CREATE INDEX import_rows_resource_1_fk_idx ON finance.import_rows USING btree (workspace_id, book_id, batch_id, workbook_id, currency);

CREATE INDEX import_rows_resource_2_fk_idx ON finance.import_rows USING btree (workspace_id, book_id, category_id, currency);

CREATE INDEX import_rows_resource_3_fk_idx ON finance.import_rows USING btree (workspace_id, book_id, account_id, currency);

CREATE INDEX import_rows_resource_4_fk_idx ON finance.import_rows USING btree (workspace_id, book_id, destination_account_id, currency);

CREATE INDEX import_rows_resource_5_fk_idx ON finance.import_rows USING btree (workspace_id, book_id, result_transaction_id, currency);

CREATE INDEX import_rows_resource_6_fk_idx ON finance.import_rows USING btree (workspace_id, book_id, result_planned_item_id, currency);

CREATE INDEX import_rows_resource_7_fk_idx ON finance.import_rows USING btree (workspace_id, book_id, result_summary_id, currency);

CREATE INDEX import_rows_resource_8_fk_idx ON finance.import_rows USING btree (workspace_id, book_id, result_valuation_id, currency);

CREATE INDEX import_rows_resource_9_fk_idx ON finance.import_rows USING btree (workspace_id, book_id, result_account_id, currency);

CREATE INDEX import_rows_retired_by_user_id_idx ON finance.import_rows USING btree (retired_by_user_id);

CREATE INDEX import_rows_source_history_idx ON finance.import_rows USING btree (workspace_id, book_id, workbook_id, sheet_id, source_cell, period_start, created_at, id);

CREATE INDEX import_rows_updated_by_user_id_idx ON finance.import_rows USING btree (updated_by_user_id);

CREATE INDEX monthly_summaries_book_created_at_idx ON finance.monthly_summaries USING btree (workspace_id, book_id, created_at, id);

CREATE INDEX monthly_summaries_created_by_user_id_idx ON finance.monthly_summaries USING btree (created_by_user_id);

CREATE UNIQUE INDEX monthly_summaries_one_replacement_idx ON finance.monthly_summaries USING btree (workspace_id, book_id, replaces_summary_id)
  WHERE (replaces_summary_id IS NOT NULL);

CREATE INDEX monthly_summaries_period_kind_idx ON finance.monthly_summaries USING btree (workspace_id, book_id, period_start, kind, category_id);

CREATE INDEX monthly_summaries_resource_1_fk_idx ON finance.monthly_summaries USING btree (workspace_id, book_id, category_id, currency, kind);

CREATE INDEX monthly_summaries_resource_2_fk_idx ON finance.monthly_summaries USING btree (workspace_id, book_id, import_row_id, currency);

CREATE INDEX monthly_summaries_resource_3_fk_idx ON finance.monthly_summaries USING btree (workspace_id, book_id, replaces_summary_id, currency);

CREATE INDEX monthly_summaries_retired_by_user_id_idx ON finance.monthly_summaries USING btree (retired_by_user_id);

CREATE INDEX monthly_summaries_updated_by_user_id_idx ON finance.monthly_summaries USING btree (updated_by_user_id);

CREATE INDEX report_coverage_book_created_at_idx ON finance.report_coverage USING btree (workspace_id, book_id, created_at, id);

CREATE INDEX report_coverage_created_by_user_id_idx ON finance.report_coverage USING btree (created_by_user_id);

CREATE INDEX report_coverage_resource_1_fk_idx ON finance.report_coverage USING btree (workspace_id, book_id, category_id, currency, kind);

CREATE INDEX report_coverage_updated_by_user_id_idx ON finance.report_coverage USING btree (updated_by_user_id);

GRANT UPDATE ("blockers") ON TABLE "finance"."import_batches" TO "impulso_backend";

GRANT UPDATE ("committed_at") ON TABLE "finance"."import_batches" TO "impulso_backend";

GRANT UPDATE ("reconciliation") ON TABLE "finance"."import_batches" TO "impulso_backend";

GRANT UPDATE ("status") ON TABLE "finance"."import_batches" TO "impulso_backend";

GRANT UPDATE ("updated_at") ON TABLE "finance"."import_batches" TO "impulso_backend";

GRANT UPDATE ("updated_by_user_id") ON TABLE "finance"."import_batches" TO "impulso_backend";

GRANT UPDATE ("version") ON TABLE "finance"."import_batches" TO "impulso_backend";

GRANT INSERT, SELECT ON TABLE "finance"."import_batches" TO "impulso_backend";

GRANT UPDATE ("blockers") ON TABLE "finance"."import_rows" TO "impulso_backend";

GRANT UPDATE ("consumed_at") ON TABLE "finance"."import_rows" TO "impulso_backend";

GRANT UPDATE ("result_account_id") ON TABLE "finance"."import_rows" TO "impulso_backend";

GRANT UPDATE ("result_planned_item_id") ON TABLE "finance"."import_rows" TO "impulso_backend";

GRANT UPDATE ("result_summary_id") ON TABLE "finance"."import_rows" TO "impulso_backend";

GRANT UPDATE ("result_transaction_id") ON TABLE "finance"."import_rows" TO "impulso_backend";

GRANT UPDATE ("result_valuation_id") ON TABLE "finance"."import_rows" TO "impulso_backend";

GRANT UPDATE ("retired_at") ON TABLE "finance"."import_rows" TO "impulso_backend";

GRANT UPDATE ("retired_by_user_id") ON TABLE "finance"."import_rows" TO "impulso_backend";

GRANT UPDATE ("updated_at") ON TABLE "finance"."import_rows" TO "impulso_backend";

GRANT UPDATE ("updated_by_user_id") ON TABLE "finance"."import_rows" TO "impulso_backend";

GRANT UPDATE ("version") ON TABLE "finance"."import_rows" TO "impulso_backend";

GRANT INSERT, SELECT ON TABLE "finance"."import_rows" TO "impulso_backend";

GRANT UPDATE ("retired_at") ON TABLE "finance"."monthly_summaries" TO "impulso_backend";

GRANT UPDATE ("retired_by_user_id") ON TABLE "finance"."monthly_summaries" TO "impulso_backend";

GRANT UPDATE ("updated_at") ON TABLE "finance"."monthly_summaries" TO "impulso_backend";

GRANT UPDATE ("updated_by_user_id") ON TABLE "finance"."monthly_summaries" TO "impulso_backend";

GRANT UPDATE ("version") ON TABLE "finance"."monthly_summaries" TO "impulso_backend";

GRANT INSERT, SELECT ON TABLE "finance"."monthly_summaries" TO "impulso_backend";

GRANT UPDATE ("authority") ON TABLE "finance"."report_coverage" TO "impulso_backend";

GRANT UPDATE ("reviewed_detail_count") ON TABLE "finance"."report_coverage" TO "impulso_backend";

GRANT UPDATE ("reviewed_detail_digest") ON TABLE "finance"."report_coverage" TO "impulso_backend";

GRANT UPDATE ("updated_at") ON TABLE "finance"."report_coverage" TO "impulso_backend";

GRANT UPDATE ("updated_by_user_id") ON TABLE "finance"."report_coverage" TO "impulso_backend";

GRANT UPDATE ("version") ON TABLE "finance"."report_coverage" TO "impulso_backend";

GRANT INSERT, SELECT ON TABLE "finance"."report_coverage" TO "impulso_backend";

COMMIT;
