-- Declarative definition: apps/supabase/schemas/private/tables/operation_receipts.sql.

CREATE TABLE private.operation_receipts (
    request_id uuid PRIMARY KEY,
    actor_user_id uuid NOT NULL,
    workspace_id uuid,
    operation text NOT NULL CHECK (operation IN ('onboard', 'create_person', 'set_alias', 'update_person', 'archive_person', 'restore_person', 'invite_member', 'accept_invitation', 'revoke_member', 'request_identity_link', 'answer_identity_link', 'offer_ownership_transfer', 'answer_ownership_transfer', 'create_book', 'update_book', 'archive_book', 'restore_book', 'create_account', 'update_account', 'archive_account', 'restore_account', 'create_transaction', 'correct_transaction', 'void_transaction', 'create_budget', 'update_budget', 'archive_budget', 'restore_budget', 'enable_health', 'create_health_record', 'update_health_record', 'archive_health_record', 'restore_health_record', 'grant_access', 'revoke_access', 'begin_upload', 'finalize_upload', 'archive_file', 'restore_file')),
    payload_hash bytea,
    resource_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
    status text NOT NULL CHECK (status IN ('completed', 'purged')),
    created_at timestamptz NOT NULL DEFAULT now(),
    completed_at timestamptz NOT NULL DEFAULT now(),
    CHECK ((status = 'completed' AND payload_hash IS NOT NULL AND octet_length(payload_hash) = 32) OR (status = 'purged' AND payload_hash IS NULL)),
    CHECK (completed_at >= created_at)
);

CREATE INDEX operation_receipts_actor_completed_at_idx ON private.operation_receipts (actor_user_id, completed_at);

ALTER TABLE private.operation_receipts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE private.operation_receipts FROM PUBLIC, anon, authenticated, service_role;
