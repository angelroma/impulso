BEGIN;

DROP INDEX "finance"."import_rows_one_replacement_idx";

CREATE UNIQUE INDEX import_rows_one_replacement_idx ON finance.import_rows USING btree (workspace_id, book_id, replaces_row_id)
  WHERE ((replaces_row_id IS NOT NULL) AND (consumed_at IS NOT NULL));

COMMIT;
