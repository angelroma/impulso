BEGIN;

ALTER TABLE "audit"."events"
  DROP CONSTRAINT "events_check";

ALTER TABLE "private"."operation_receipts"
  DROP CONSTRAINT "operation_receipts_operation_check";

CREATE TABLE "finance"."categories" (
  "id"                  uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id"        uuid                     NOT NULL,
  "book_id"             uuid                     NOT NULL,
  "currency"            text                     NOT NULL,
  "created_at"          timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"          timestamp with time zone NOT NULL DEFAULT now(),
  "created_by_user_id"  uuid,
  "updated_by_user_id"  uuid,
  "version"             integer                  NOT NULL DEFAULT 1,
  "kind"                text                     NOT NULL,
  "name"                text                     NOT NULL,
  "archived_at"         timestamp with time zone,
  "archived_by_user_id" uuid,
  CONSTRAINT "categories_check" CHECK (((archived_at IS NOT NULL) OR (archived_by_user_id IS NULL))),
  CONSTRAINT "categories_kind_check" CHECK ((kind = ANY (ARRAY['income'::text, 'expense'::text]))),
  CONSTRAINT "categories_name_check" CHECK (((char_length(btrim(name)) > 0) AND (char_length(name) <= 200))),
  CONSTRAINT "categories_pkey" PRIMARY KEY (id),
  CONSTRAINT "categories_version_check" CHECK ((version > 0)),
  CONSTRAINT "categories_workspace_id_book_id_id_currency_key" UNIQUE (workspace_id, book_id, id, currency),
  CONSTRAINT "categories_workspace_id_book_id_id_currency_kind_key" UNIQUE (workspace_id, book_id, id, currency, kind)
);

ALTER TABLE "finance"."categories"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "finance"."transaction_classifications" (
  "id"                 uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id"       uuid                     NOT NULL,
  "book_id"            uuid                     NOT NULL,
  "currency"           text                     NOT NULL,
  "created_at"         timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"         timestamp with time zone NOT NULL DEFAULT now(),
  "created_by_user_id" uuid,
  "updated_by_user_id" uuid,
  "version"            integer                  NOT NULL DEFAULT 1,
  "transaction_id"     uuid                     NOT NULL,
  "kind"               text                     NOT NULL,
  "category_id"        uuid,
  "group_id"           uuid,
  "group_position"     smallint,
  CONSTRAINT "transaction_classifications_check1" CHECK ((((group_id IS NULL) AND (group_position IS NULL)) OR ((group_id IS NOT NULL) AND (group_position IS
    NOT NULL) AND ((group_position >= 1) AND (group_position <= 10))))),
  CONSTRAINT "transaction_classifications_check" CHECK (((kind <> 'transfer'::text) OR (category_id IS NULL))),
  CONSTRAINT "transaction_classifications_kind_check" CHECK ((kind = ANY (ARRAY['income'::text, 'expense'::text, 'transfer'::text]))),
  CONSTRAINT "transaction_classifications_pkey" PRIMARY KEY (id),
  CONSTRAINT "transaction_classifications_version_check" CHECK ((version > 0)),
  CONSTRAINT "transaction_classifications_workspace_id_book_id_group_id_g_key" UNIQUE (workspace_id, book_id, group_id, group_position),
  CONSTRAINT "transaction_classifications_workspace_id_book_id_id_currenc_key" UNIQUE (workspace_id, book_id, id, currency),
  CONSTRAINT "transaction_classifications_workspace_id_book_id_transactio_key" UNIQUE (workspace_id, book_id, transaction_id)
);

ALTER TABLE "finance"."transaction_classifications"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "finance"."transaction_groups" (
  "id"                 uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id"       uuid                     NOT NULL,
  "book_id"            uuid                     NOT NULL,
  "currency"           text                     NOT NULL,
  "created_at"         timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"         timestamp with time zone NOT NULL DEFAULT now(),
  "created_by_user_id" uuid,
  "updated_by_user_id" uuid,
  "version"            integer                  NOT NULL DEFAULT 1,
  "request_id"         uuid                     NOT NULL,
  "description"        text                     NOT NULL,
  CONSTRAINT "transaction_groups_description_check" CHECK (((char_length(btrim(description)) > 0) AND (char_length(description) <= 2000))),
  CONSTRAINT "transaction_groups_pkey" PRIMARY KEY (id),
  CONSTRAINT "transaction_groups_version_check" CHECK ((version > 0)),
  CONSTRAINT "transaction_groups_workspace_id_book_id_id_currency_key" UNIQUE (workspace_id, book_id, id, currency),
  CONSTRAINT "transaction_groups_workspace_id_book_id_request_id_key" UNIQUE (workspace_id, book_id, request_id)
);

ALTER TABLE "finance"."transaction_groups"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE "finance"."accounts"
  ADD COLUMN "account_kind" text NOT NULL DEFAULT 'unknown'::text;

ALTER TABLE "finance"."accounts"
  ADD COLUMN "opening_balance_on" date;

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
    'file'::text,
    'purge_request'::text]))) OR
    ((module = 'health'::text) AND (resource_type = ANY (ARRAY['person_access'::text, 'record'::text, 'medication'::text, 'appointment'::text, 'lab_result'::text, 'file'::text,
    'purge_request'::text]))) OR ((module = 'auth'::text) AND (resource_type = ANY (ARRAY['account'::text, 'session'::text])))));

ALTER TABLE "finance"."accounts"
  ADD CONSTRAINT "accounts_account_kind_check"
    CHECK ((account_kind = ANY (ARRAY['unknown'::text, 'cash'::text, 'bank'::text, 'investment'::text, 'credit_card'::text, 'loan'::text])));

ALTER TABLE "finance"."accounts"
  ADD CONSTRAINT "accounts_opening_balance_on_check" CHECK (((opening_balance_on >= '0001-01-01'::date) AND (opening_balance_on <= '9999-12-31'::date)));

ALTER TABLE "finance"."categories"
  ADD CONSTRAINT "categories_archived_by_user_id_fkey" FOREIGN KEY (archived_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE "finance"."categories"
  ADD CONSTRAINT "categories_created_by_user_id_fkey" FOREIGN KEY (created_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE "finance"."categories"
  ADD CONSTRAINT "categories_updated_by_user_id_fkey" FOREIGN KEY (updated_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE "finance"."categories"
  ADD CONSTRAINT "categories_workspace_id_book_id_currency_fkey" FOREIGN KEY (workspace_id, book_id, currency) REFERENCES finance.books(workspace_id, id, currency)
    ON DELETE RESTRICT;

ALTER TABLE "finance"."categories"
  ADD CONSTRAINT "categories_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES core.workspaces(id) ON DELETE RESTRICT;

ALTER TABLE "finance"."transaction_classifications"
  ADD CONSTRAINT "transaction_classifications_created_by_user_id_fkey" FOREIGN KEY (created_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE "finance"."transaction_classifications"
  ADD CONSTRAINT "transaction_classifications_updated_by_user_id_fkey" FOREIGN KEY (updated_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE "finance"."transaction_classifications"
  ADD CONSTRAINT "transaction_classifications_workspace_id_book_id_category__fkey" FOREIGN KEY (workspace_id, book_id, category_id, currency, kind)
    REFERENCES finance.categories(workspace_id, book_id, id, currency, kind) ON DELETE RESTRICT;

ALTER TABLE "finance"."transaction_classifications"
  ADD CONSTRAINT "transaction_classifications_workspace_id_book_id_currency_fkey" FOREIGN KEY (workspace_id, book_id, currency) REFERENCES finance.books(workspace_id, id, currency)
    ON DELETE RESTRICT;

ALTER TABLE "finance"."transaction_classifications"
  ADD CONSTRAINT "transaction_classifications_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES core.workspaces(id) ON DELETE RESTRICT;

ALTER TABLE "finance"."transaction_groups"
  ADD CONSTRAINT "transaction_groups_created_by_user_id_fkey" FOREIGN KEY (created_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE "finance"."transaction_groups"
  ADD CONSTRAINT "transaction_groups_updated_by_user_id_fkey" FOREIGN KEY (updated_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE "finance"."transaction_groups"
  ADD CONSTRAINT "transaction_groups_workspace_id_book_id_currency_fkey" FOREIGN KEY (workspace_id, book_id, currency) REFERENCES finance.books(workspace_id, id, currency)
    ON DELETE RESTRICT;

ALTER TABLE "finance"."transaction_classifications"
  ADD CONSTRAINT "transaction_classifications_workspace_id_book_id_group_id__fkey" FOREIGN KEY (workspace_id, book_id, group_id, currency)
    REFERENCES finance.transaction_groups(workspace_id, book_id, id, currency) ON DELETE RESTRICT;

ALTER TABLE "finance"."transaction_groups"
  ADD CONSTRAINT "transaction_groups_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES core.workspaces(id) ON DELETE RESTRICT;

ALTER TABLE "finance"."transactions"
  ADD CONSTRAINT "transactions_workspace_id_book_id_id_currency_key" UNIQUE (workspace_id, book_id, id, currency);

ALTER TABLE "finance"."transactions"
  ADD CONSTRAINT "transactions_workspace_id_book_id_id_currency_kind_key" UNIQUE (workspace_id, book_id, id, currency, kind);

ALTER TABLE "finance"."transaction_classifications"
  ADD CONSTRAINT "transaction_classifications_workspace_id_book_id_transacti_fkey" FOREIGN KEY (workspace_id, book_id, transaction_id, currency, kind)
    REFERENCES finance.transactions(workspace_id, book_id, id, currency, kind) ON DELETE RESTRICT;

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

CREATE INDEX categories_archived_by_user_id_idx ON finance.categories USING btree (archived_by_user_id);

CREATE INDEX categories_book_created_at_idx ON finance.categories USING btree (workspace_id, book_id, created_at, id);

CREATE INDEX categories_created_by_user_id_idx ON finance.categories USING btree (created_by_user_id);

CREATE INDEX categories_updated_by_user_id_idx ON finance.categories USING btree (updated_by_user_id);

CREATE INDEX transaction_classifications_book_created_at_idx ON finance.transaction_classifications USING btree (workspace_id, book_id, created_at, id);

CREATE INDEX transaction_classifications_category_fk_idx ON finance.transaction_classifications USING btree (workspace_id, book_id, category_id, currency, kind);

CREATE INDEX transaction_classifications_created_by_user_id_idx ON finance.transaction_classifications USING btree (created_by_user_id);

CREATE INDEX transaction_classifications_updated_by_user_id_idx ON finance.transaction_classifications USING btree (updated_by_user_id);

CREATE INDEX transaction_groups_book_created_at_idx ON finance.transaction_groups USING btree (workspace_id, book_id, created_at, id);

CREATE INDEX transaction_groups_created_by_user_id_idx ON finance.transaction_groups USING btree (created_by_user_id);

CREATE INDEX transaction_groups_updated_by_user_id_idx ON finance.transaction_groups USING btree (updated_by_user_id);

REVOKE ALL ("account_kind") ON TABLE "finance"."accounts" FROM "impulso_backend";

GRANT UPDATE ("account_kind") ON TABLE "finance"."accounts" TO "impulso_backend";

REVOKE ALL ("opening_balance_on") ON TABLE "finance"."accounts" FROM "impulso_backend";

GRANT UPDATE ("opening_balance_on") ON TABLE "finance"."accounts" TO "impulso_backend";

REVOKE ALL ("updated_by_user_id") ON TABLE "finance"."accounts" FROM "impulso_backend";

GRANT UPDATE ("updated_by_user_id") ON TABLE "finance"."accounts" TO "impulso_backend";

REVOKE ALL ("version") ON TABLE "finance"."accounts" FROM "impulso_backend";

GRANT UPDATE ("version") ON TABLE "finance"."accounts" TO "impulso_backend";

GRANT UPDATE ("archived_at") ON TABLE "finance"."categories" TO "impulso_backend";

GRANT UPDATE ("archived_by_user_id") ON TABLE "finance"."categories" TO "impulso_backend";

GRANT UPDATE ("name") ON TABLE "finance"."categories" TO "impulso_backend";

GRANT UPDATE ("updated_at") ON TABLE "finance"."categories" TO "impulso_backend";

GRANT UPDATE ("updated_by_user_id") ON TABLE "finance"."categories" TO "impulso_backend";

GRANT UPDATE ("version") ON TABLE "finance"."categories" TO "impulso_backend";

GRANT INSERT, SELECT ON TABLE "finance"."categories" TO "impulso_backend";

GRANT UPDATE ("category_id") ON TABLE "finance"."transaction_classifications" TO "impulso_backend";

GRANT UPDATE ("updated_at") ON TABLE "finance"."transaction_classifications" TO "impulso_backend";

GRANT UPDATE ("updated_by_user_id") ON TABLE "finance"."transaction_classifications" TO "impulso_backend";

GRANT UPDATE ("version") ON TABLE "finance"."transaction_classifications" TO "impulso_backend";

GRANT INSERT, SELECT ON TABLE "finance"."transaction_classifications" TO "impulso_backend";

GRANT UPDATE ("updated_at") ON TABLE "finance"."transaction_groups" TO "impulso_backend";

GRANT INSERT, SELECT ON TABLE "finance"."transaction_groups" TO "impulso_backend";

REVOKE ALL ("updated_at") ON TABLE "finance"."transactions" FROM "impulso_backend";

GRANT UPDATE ("updated_at") ON TABLE "finance"."transactions" TO "impulso_backend";

REVOKE ALL ("updated_by_user_id") ON TABLE "finance"."transactions" FROM "impulso_backend";

GRANT UPDATE ("updated_by_user_id") ON TABLE "finance"."transactions" TO "impulso_backend";

REVOKE ALL ("version") ON TABLE "finance"."transactions" FROM "impulso_backend";

GRANT UPDATE ("version") ON TABLE "finance"."transactions" TO "impulso_backend";

REVOKE ALL ("void_reason") ON TABLE "finance"."transactions" FROM "impulso_backend";

GRANT UPDATE ("void_reason") ON TABLE "finance"."transactions" TO "impulso_backend";

REVOKE ALL ("voided_at") ON TABLE "finance"."transactions" FROM "impulso_backend";

GRANT UPDATE ("voided_at") ON TABLE "finance"."transactions" TO "impulso_backend";

REVOKE ALL ("voided_by_user_id") ON TABLE "finance"."transactions" FROM "impulso_backend";

GRANT UPDATE ("voided_by_user_id") ON TABLE "finance"."transactions" TO "impulso_backend";

COMMIT;
