-- Initial Impulso foundation. No application RPCs or sample data are installed.
BEGIN;

-- Foundation only: all application access remains denied until reviewed API and RLS migrations.

CREATE SCHEMA IF NOT EXISTS core;

CREATE SCHEMA IF NOT EXISTS finance;

CREATE SCHEMA IF NOT EXISTS health;

CREATE SCHEMA IF NOT EXISTS api;

CREATE SCHEMA IF NOT EXISTS audit;

CREATE SCHEMA IF NOT EXISTS private;

REVOKE ALL ON SCHEMA core, finance, health, api, audit, private FROM PUBLIC, anon, authenticated, service_role;

-- Namespace access exposes no relations or operations while api remains empty.
GRANT USAGE ON SCHEMA api TO anon, authenticated, service_role;

CREATE TABLE core.workspaces (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    version integer NOT NULL DEFAULT 1 CHECK (version > 0),
    archived_at timestamptz,
    archived_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    CHECK (archived_at IS NOT NULL OR archived_by_user_id IS NULL),
    name text NOT NULL,
    timezone text NOT NULL,
    UNIQUE (created_by_user_id),
    CHECK (char_length(btrim(name)) > 0 AND char_length(name) <= 200),
    CHECK (char_length(btrim(timezone)) > 0 AND char_length(timezone) <= 200)
);

CREATE TABLE core.workspace_members (
    workspace_id uuid NOT NULL REFERENCES core.workspaces(id) ON DELETE RESTRICT,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    role text NOT NULL CHECK (role IN ('owner', 'member')),
    status text NOT NULL CHECK (status IN ('invited', 'active', 'revoked')),
    invited_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    invited_at timestamptz,
    invite_expires_at timestamptz,
    accepted_at timestamptz,
    revoked_at timestamptz,
    revoked_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    version integer NOT NULL DEFAULT 1 CHECK (version > 0),
    PRIMARY KEY (workspace_id, user_id),
    CHECK ((invited_at IS NULL) = (invite_expires_at IS NULL)),
    CHECK (invite_expires_at IS NULL OR invite_expires_at > invited_at),
    CHECK ((status = 'invited' AND invited_at IS NOT NULL AND accepted_at IS NULL AND revoked_at IS NULL) OR (status = 'active' AND accepted_at IS NOT NULL AND revoked_at IS NULL) OR (status = 'revoked' AND revoked_at IS NOT NULL)),
    CHECK (revoked_at IS NOT NULL OR revoked_by_user_id IS NULL)
);

CREATE TABLE core.people (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES core.workspaces(id) ON DELETE RESTRICT,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    version integer NOT NULL DEFAULT 1 CHECK (version > 0),
    archived_at timestamptz,
    archived_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    CHECK (archived_at IS NOT NULL OR archived_by_user_id IS NULL),
    UNIQUE (workspace_id, id),
    display_name text NOT NULL,
    CHECK (char_length(btrim(display_name)) > 0 AND char_length(display_name) <= 200)
);

CREATE TABLE core.person_user_links (
    workspace_id uuid NOT NULL,
    person_id uuid NOT NULL,
    user_id uuid NOT NULL,
    verified_at timestamptz NOT NULL DEFAULT now(),
    verification_method text NOT NULL CHECK (verification_method IN ('self_registration', 'dual_acceptance')),
    PRIMARY KEY (workspace_id, person_id),
    UNIQUE (workspace_id, user_id),
    FOREIGN KEY (workspace_id, person_id) REFERENCES core.people(workspace_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (workspace_id, user_id) REFERENCES core.workspace_members(workspace_id, user_id) ON DELETE RESTRICT
);

CREATE TABLE core.person_access (
    workspace_id uuid NOT NULL,
    person_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role text NOT NULL CHECK (role IN ('owner', 'editor', 'viewer')),
    granted_at timestamptz NOT NULL DEFAULT now(),
    granted_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    revoked_at timestamptz,
    revoked_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    version integer NOT NULL DEFAULT 1 CHECK (version > 0),
    PRIMARY KEY (workspace_id, person_id, user_id),
    FOREIGN KEY (workspace_id, person_id) REFERENCES core.people(workspace_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (workspace_id, user_id) REFERENCES core.workspace_members(workspace_id, user_id) ON DELETE RESTRICT,
    CHECK (revoked_at IS NOT NULL OR revoked_by_user_id IS NULL)
);

CREATE TABLE core.person_aliases (
    workspace_id uuid NOT NULL,
    user_id uuid NOT NULL,
    person_id uuid NOT NULL,
    alias text NOT NULL,
    alias_normalized text GENERATED ALWAYS AS (lower(btrim(alias))) STORED,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    version integer NOT NULL DEFAULT 1 CHECK (version > 0),
    PRIMARY KEY (workspace_id, user_id, alias_normalized),
    FOREIGN KEY (workspace_id, user_id) REFERENCES core.workspace_members(workspace_id, user_id) ON DELETE RESTRICT,
    FOREIGN KEY (workspace_id, person_id) REFERENCES core.people(workspace_id, id) ON DELETE RESTRICT,
    CHECK (char_length(btrim(alias)) > 0 AND char_length(alias) <= 80)
);

CREATE TABLE core.identity_link_requests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL,
    person_id uuid NOT NULL,
    target_user_id uuid NOT NULL,
    requested_by_user_id uuid NOT NULL,
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'cancelled', 'expired')),
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
    completed_at timestamptz,
    completed_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    FOREIGN KEY (workspace_id, person_id) REFERENCES core.people(workspace_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (workspace_id, target_user_id) REFERENCES core.workspace_members(workspace_id, user_id) ON DELETE RESTRICT,
    FOREIGN KEY (workspace_id, requested_by_user_id) REFERENCES core.workspace_members(workspace_id, user_id) ON DELETE RESTRICT,
    CHECK (expires_at = created_at + interval '7 days'),
    CHECK ((status = 'pending') = (completed_at IS NULL)),
    CHECK (status NOT IN ('pending', 'expired') OR completed_by_user_id IS NULL)
);

CREATE TABLE finance.books (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES core.workspaces(id) ON DELETE RESTRICT,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    version integer NOT NULL DEFAULT 1 CHECK (version > 0),
    archived_at timestamptz,
    archived_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    CHECK (archived_at IS NOT NULL OR archived_by_user_id IS NULL),
    UNIQUE (workspace_id, id),
    name text NOT NULL,
    currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
    minor_unit smallint NOT NULL CHECK (minor_unit BETWEEN 0 AND 4),
    UNIQUE (workspace_id, id, currency),
    CHECK (char_length(btrim(name)) > 0 AND char_length(name) <= 200)
);

CREATE TABLE finance.book_access (
    workspace_id uuid NOT NULL,
    book_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role text NOT NULL CHECK (role IN ('owner', 'editor', 'viewer')),
    granted_at timestamptz NOT NULL DEFAULT now(),
    granted_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    revoked_at timestamptz,
    revoked_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    version integer NOT NULL DEFAULT 1 CHECK (version > 0),
    PRIMARY KEY (workspace_id, book_id, user_id),
    FOREIGN KEY (workspace_id, book_id) REFERENCES finance.books(workspace_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (workspace_id, user_id) REFERENCES core.workspace_members(workspace_id, user_id) ON DELETE RESTRICT,
    CHECK (revoked_at IS NOT NULL OR revoked_by_user_id IS NULL)
);

CREATE TABLE finance.accounts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES core.workspaces(id) ON DELETE RESTRICT,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    version integer NOT NULL DEFAULT 1 CHECK (version > 0),
    archived_at timestamptz,
    archived_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    CHECK (archived_at IS NOT NULL OR archived_by_user_id IS NULL),
    UNIQUE (workspace_id, id),
    book_id uuid NOT NULL,
    currency text NOT NULL,
    name text NOT NULL,
    person_id uuid,
    opening_balance numeric(20,4) NOT NULL CHECK (opening_balance > '-Infinity'::numeric AND opening_balance < 'Infinity'::numeric),
    FOREIGN KEY (workspace_id, book_id, currency) REFERENCES finance.books(workspace_id, id, currency) ON DELETE RESTRICT,
    FOREIGN KEY (workspace_id, person_id) REFERENCES core.people(workspace_id, id) ON DELETE RESTRICT,
    UNIQUE (workspace_id, book_id, id, currency),
    CHECK (char_length(btrim(name)) > 0 AND char_length(name) <= 200)
);

CREATE TABLE finance.transactions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES core.workspaces(id) ON DELETE RESTRICT,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    version integer NOT NULL DEFAULT 1 CHECK (version > 0),
    UNIQUE (workspace_id, id),
    book_id uuid NOT NULL,
    currency text NOT NULL,
    kind text NOT NULL CHECK (kind IN ('income', 'expense', 'transfer')),
    amount numeric(20,4) NOT NULL CHECK (amount > 0 AND amount < 'Infinity'::numeric),
    source_account_id uuid,
    destination_account_id uuid,
    beneficiary_person_id uuid,
    occurred_on date NOT NULL,
    description text NOT NULL,
    request_id uuid NOT NULL,
    replaces_transaction_id uuid,
    voided_at timestamptz,
    voided_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    void_reason text,
    UNIQUE (workspace_id, book_id, id),
    UNIQUE (workspace_id, book_id, request_id),
    FOREIGN KEY (workspace_id, book_id, currency) REFERENCES finance.books(workspace_id, id, currency) ON DELETE RESTRICT,
    FOREIGN KEY (workspace_id, book_id, source_account_id, currency) REFERENCES finance.accounts(workspace_id, book_id, id, currency) ON DELETE RESTRICT,
    FOREIGN KEY (workspace_id, book_id, destination_account_id, currency) REFERENCES finance.accounts(workspace_id, book_id, id, currency) ON DELETE RESTRICT,
    FOREIGN KEY (workspace_id, beneficiary_person_id) REFERENCES core.people(workspace_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (workspace_id, book_id, replaces_transaction_id) REFERENCES finance.transactions(workspace_id, book_id, id) ON DELETE RESTRICT,
    CHECK ((kind = 'income' AND source_account_id IS NULL AND destination_account_id IS NOT NULL) OR (kind = 'expense' AND source_account_id IS NOT NULL AND destination_account_id IS NULL) OR (kind = 'transfer' AND source_account_id IS NOT NULL AND destination_account_id IS NOT NULL AND source_account_id <> destination_account_id)),
    CHECK (replaces_transaction_id IS NULL OR replaces_transaction_id <> id),
    CHECK ((voided_at IS NULL AND voided_by_user_id IS NULL AND void_reason IS NULL) OR (voided_at IS NOT NULL AND void_reason IS NOT NULL AND char_length(btrim(void_reason)) > 0)),
    CHECK (void_reason IS NULL OR char_length(void_reason) <= 2000),
    CHECK (char_length(btrim(description)) > 0 AND char_length(description) <= 2000)
);

CREATE TABLE finance.budgets (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES core.workspaces(id) ON DELETE RESTRICT,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    version integer NOT NULL DEFAULT 1 CHECK (version > 0),
    archived_at timestamptz,
    archived_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    CHECK (archived_at IS NOT NULL OR archived_by_user_id IS NULL),
    UNIQUE (workspace_id, id),
    book_id uuid NOT NULL,
    currency text NOT NULL,
    name text NOT NULL,
    person_id uuid,
    starts_on date NOT NULL,
    ends_on date NOT NULL,
    amount numeric(20,4) NOT NULL CHECK (amount > 0 AND amount < 'Infinity'::numeric),
    FOREIGN KEY (workspace_id, book_id, currency) REFERENCES finance.books(workspace_id, id, currency) ON DELETE RESTRICT,
    FOREIGN KEY (workspace_id, person_id) REFERENCES core.people(workspace_id, id) ON DELETE RESTRICT,
    UNIQUE NULLS NOT DISTINCT (workspace_id, book_id, person_id, starts_on, ends_on),
    CHECK (ends_on > starts_on),
    CHECK (char_length(btrim(name)) > 0 AND char_length(name) <= 200)
);

CREATE TABLE health.person_access (
    workspace_id uuid NOT NULL,
    person_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role text NOT NULL CHECK (role IN ('owner', 'editor', 'viewer')),
    granted_at timestamptz NOT NULL DEFAULT now(),
    granted_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    revoked_at timestamptz,
    revoked_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    version integer NOT NULL DEFAULT 1 CHECK (version > 0),
    PRIMARY KEY (workspace_id, person_id, user_id),
    FOREIGN KEY (workspace_id, person_id) REFERENCES core.people(workspace_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (workspace_id, user_id) REFERENCES core.workspace_members(workspace_id, user_id) ON DELETE RESTRICT,
    CHECK (revoked_at IS NOT NULL OR revoked_by_user_id IS NULL)
);

CREATE TABLE health.records (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES core.workspaces(id) ON DELETE RESTRICT,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    version integer NOT NULL DEFAULT 1 CHECK (version > 0),
    archived_at timestamptz,
    archived_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    CHECK (archived_at IS NOT NULL OR archived_by_user_id IS NULL),
    UNIQUE (workspace_id, id),
    person_id uuid NOT NULL,
    FOREIGN KEY (workspace_id, person_id) REFERENCES core.people(workspace_id, id) ON DELETE RESTRICT,
    UNIQUE (workspace_id, person_id, id),
    kind text NOT NULL CHECK (kind IN ('note', 'symptom', 'diagnosis', 'history', 'medication_intake')),
    occurred_on date,
    occurred_at timestamptz,
    title text NOT NULL,
    body text NOT NULL,
    CHECK (occurred_on IS NULL OR occurred_at IS NULL),
    CHECK (char_length(btrim(title)) > 0 AND char_length(title) <= 200),
    CHECK (char_length(btrim(body)) > 0 AND char_length(body) <= 20000)
);

CREATE TABLE health.medications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES core.workspaces(id) ON DELETE RESTRICT,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    version integer NOT NULL DEFAULT 1 CHECK (version > 0),
    archived_at timestamptz,
    archived_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    CHECK (archived_at IS NOT NULL OR archived_by_user_id IS NULL),
    UNIQUE (workspace_id, id),
    person_id uuid NOT NULL,
    FOREIGN KEY (workspace_id, person_id) REFERENCES core.people(workspace_id, id) ON DELETE RESTRICT,
    UNIQUE (workspace_id, person_id, id),
    name text NOT NULL,
    instructions text CHECK (char_length(instructions) <= 4000),
    starts_on date,
    ends_on date,
    status text NOT NULL DEFAULT 'reported' CHECK (status IN ('reported', 'active', 'stopped')),
    CHECK (starts_on IS NULL OR ends_on IS NULL OR ends_on >= starts_on),
    CHECK (char_length(btrim(name)) > 0 AND char_length(name) <= 200)
);

CREATE TABLE health.appointments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES core.workspaces(id) ON DELETE RESTRICT,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    version integer NOT NULL DEFAULT 1 CHECK (version > 0),
    archived_at timestamptz,
    archived_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    CHECK (archived_at IS NOT NULL OR archived_by_user_id IS NULL),
    UNIQUE (workspace_id, id),
    person_id uuid NOT NULL,
    FOREIGN KEY (workspace_id, person_id) REFERENCES core.people(workspace_id, id) ON DELETE RESTRICT,
    UNIQUE (workspace_id, person_id, id),
    starts_at timestamptz NOT NULL,
    ends_at timestamptz,
    timezone text NOT NULL,
    provider text CHECK (char_length(provider) <= 200),
    location text CHECK (char_length(location) <= 500),
    reason text CHECK (char_length(reason) <= 4000),
    status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'completed', 'cancelled', 'missed')),
    CHECK (ends_at IS NULL OR ends_at > starts_at),
    CHECK (char_length(btrim(timezone)) > 0 AND char_length(timezone) <= 200)
);

CREATE TABLE health.lab_results (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES core.workspaces(id) ON DELETE RESTRICT,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    version integer NOT NULL DEFAULT 1 CHECK (version > 0),
    archived_at timestamptz,
    archived_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    CHECK (archived_at IS NOT NULL OR archived_by_user_id IS NULL),
    UNIQUE (workspace_id, id),
    person_id uuid NOT NULL,
    FOREIGN KEY (workspace_id, person_id) REFERENCES core.people(workspace_id, id) ON DELETE RESTRICT,
    UNIQUE (workspace_id, person_id, id),
    test_name text NOT NULL,
    collected_on date,
    collected_at timestamptz,
    result_text text NOT NULL,
    unit text CHECK (char_length(unit) <= 100),
    reference_range text CHECK (char_length(reference_range) <= 500),
    laboratory text CHECK (char_length(laboratory) <= 200),
    CHECK (collected_on IS NULL OR collected_at IS NULL),
    CHECK (char_length(btrim(test_name)) > 0 AND char_length(test_name) <= 200),
    CHECK (char_length(btrim(result_text)) > 0 AND char_length(result_text) <= 4000)
);

CREATE TABLE core.ownership_transfer_requests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES core.workspaces(id) ON DELETE RESTRICT,
    scope text NOT NULL CHECK (scope IN ('workspace', 'person', 'book', 'health_person')),
    person_id uuid,
    book_id uuid,
    offered_by_user_id uuid NOT NULL,
    target_user_id uuid NOT NULL,
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'cancelled', 'expired')),
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
    completed_at timestamptz,
    completed_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    FOREIGN KEY (workspace_id, person_id) REFERENCES core.people(workspace_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (workspace_id, book_id) REFERENCES finance.books(workspace_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (workspace_id, offered_by_user_id) REFERENCES core.workspace_members(workspace_id, user_id) ON DELETE RESTRICT,
    FOREIGN KEY (workspace_id, target_user_id) REFERENCES core.workspace_members(workspace_id, user_id) ON DELETE RESTRICT,
    CHECK ((scope = 'workspace' AND person_id IS NULL AND book_id IS NULL) OR (scope IN ('person', 'health_person') AND person_id IS NOT NULL AND book_id IS NULL) OR (scope = 'book' AND person_id IS NULL AND book_id IS NOT NULL)),
    CHECK (offered_by_user_id <> target_user_id),
    CHECK (expires_at = created_at + interval '7 days'),
    CHECK ((status = 'pending') = (completed_at IS NULL)),
    CHECK (status NOT IN ('pending', 'expired') OR completed_by_user_id IS NULL)
);

CREATE TABLE finance.files (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL,
    book_id uuid NOT NULL,
    transaction_id uuid NOT NULL,
    bucket_id text NOT NULL CHECK (bucket_id = 'finance-files'),
    object_path text NOT NULL UNIQUE,
    original_name text NOT NULL,
    mime_type text NOT NULL CHECK (mime_type IN ('application/pdf', 'image/jpeg', 'image/png')),
    size_bytes bigint NOT NULL CHECK (size_bytes BETWEEN 1 AND 20971520),
    state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'ready', 'deleting')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    version integer NOT NULL DEFAULT 1 CHECK (version > 0),
    archived_at timestamptz,
    archived_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    CHECK (archived_at IS NOT NULL OR archived_by_user_id IS NULL),
    CHECK (char_length(btrim(original_name)) > 0 AND char_length(original_name) <= 255),
    UNIQUE (workspace_id, book_id, id),
    FOREIGN KEY (workspace_id, book_id, transaction_id) REFERENCES finance.transactions(workspace_id, book_id, id) ON DELETE RESTRICT,
    CHECK (object_path = workspace_id::text || '/' || book_id::text || '/' || id::text)
);

CREATE TABLE health.files (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL,
    person_id uuid NOT NULL,
    record_id uuid,
    medication_id uuid,
    appointment_id uuid,
    lab_result_id uuid,
    bucket_id text NOT NULL CHECK (bucket_id = 'health-files'),
    object_path text NOT NULL UNIQUE,
    original_name text NOT NULL,
    mime_type text NOT NULL CHECK (mime_type IN ('application/pdf', 'image/jpeg', 'image/png')),
    size_bytes bigint NOT NULL CHECK (size_bytes BETWEEN 1 AND 20971520),
    state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'ready', 'deleting')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    version integer NOT NULL DEFAULT 1 CHECK (version > 0),
    archived_at timestamptz,
    archived_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    CHECK (archived_at IS NOT NULL OR archived_by_user_id IS NULL),
    CHECK (char_length(btrim(original_name)) > 0 AND char_length(original_name) <= 255),
    UNIQUE (workspace_id, person_id, id),
    FOREIGN KEY (workspace_id, person_id, record_id) REFERENCES health.records(workspace_id, person_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (workspace_id, person_id, medication_id) REFERENCES health.medications(workspace_id, person_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (workspace_id, person_id, appointment_id) REFERENCES health.appointments(workspace_id, person_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (workspace_id, person_id, lab_result_id) REFERENCES health.lab_results(workspace_id, person_id, id) ON DELETE RESTRICT,
    CHECK (num_nonnulls(record_id, medication_id, appointment_id, lab_result_id) = 1),
    CHECK (object_path = workspace_id::text || '/' || person_id::text || '/' || id::text)
);

CREATE TABLE audit.events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    occurred_at timestamptz NOT NULL DEFAULT now(),
    request_id uuid NOT NULL,
    actor_user_id uuid,
    workspace_id uuid,
    module text NOT NULL CHECK (module IN ('core', 'finance', 'health', 'auth')),
    resource_type text NOT NULL,
    resource_id uuid,
    subject_person_id uuid,
    book_id uuid,
    action text NOT NULL CHECK (action IN ('create', 'update', 'correct', 'void', 'archive', 'restore', 'invite', 'accept', 'reject', 'grant', 'revoke', 'transfer', 'upload', 'download', 'purge_request', 'purge_complete', 'login', 'logout')),
    outcome text NOT NULL CHECK (outcome IN ('success', 'denied', 'failed')),
    changed_fields text[] NOT NULL DEFAULT '{}'::text[],
    CHECK ((module = 'core' AND resource_type IN ('workspace', 'workspace_member', 'person', 'person_user_link', 'person_access', 'person_alias', 'identity_link_request', 'ownership_transfer_request', 'purge_request')) OR (module = 'finance' AND resource_type IN ('book', 'book_access', 'account', 'transaction', 'budget', 'file', 'purge_request')) OR (module = 'health' AND resource_type IN ('person_access', 'record', 'medication', 'appointment', 'lab_result', 'file', 'purge_request')) OR (module = 'auth' AND resource_type IN ('account', 'session'))),
    CHECK (outcome <> 'success' OR module <> 'health' OR subject_person_id IS NOT NULL),
    CHECK (outcome <> 'success' OR module <> 'finance' OR book_id IS NOT NULL)
);

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

CREATE TABLE private.purge_requests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL,
    scope text NOT NULL CHECK (scope IN ('book', 'health_person', 'person', 'workspace')),
    person_id uuid,
    book_id uuid,
    requested_by_user_id uuid NOT NULL,
    state text NOT NULL DEFAULT 'prepared' CHECK (state IN ('prepared', 'approved', 'deleting_files', 'deleting_rows', 'completed', 'cancelled', 'failed')),
    manifest jsonb NOT NULL CHECK (jsonb_typeof(manifest) = 'object'),
    manifest_hash bytea NOT NULL CHECK (octet_length(manifest_hash) = 32),
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL DEFAULT (now() + interval '5 minutes'),
    updated_at timestamptz NOT NULL DEFAULT now(),
    confirmed_at timestamptz,
    failure_code text CHECK (failure_code ~ '^[a-z][a-z0-9_]{0,63}$'),
    CHECK ((scope = 'workspace' AND person_id IS NULL AND book_id IS NULL) OR (scope IN ('person', 'health_person') AND person_id IS NOT NULL AND book_id IS NULL) OR (scope = 'book' AND person_id IS NULL AND book_id IS NOT NULL)),
    CHECK (expires_at = created_at + interval '5 minutes'),
    CHECK (state NOT IN ('approved', 'deleting_files', 'deleting_rows', 'completed') OR confirmed_at IS NOT NULL),
    CHECK (state <> 'prepared' OR confirmed_at IS NULL),
    CHECK (state = 'failed' OR failure_code IS NULL)
);

CREATE INDEX workspaces_updated_by_user_idx ON core.workspaces (updated_by_user_id);

CREATE INDEX workspaces_archived_by_user_idx ON core.workspaces (archived_by_user_id);

CREATE UNIQUE INDEX workspace_members_one_owner_idx ON core.workspace_members (workspace_id) WHERE role = 'owner' AND status = 'active';

CREATE INDEX workspace_members_user_status_idx ON core.workspace_members (user_id, status, workspace_id);

CREATE INDEX workspace_members_invited_by_user_idx ON core.workspace_members (invited_by_user_id);

CREATE INDEX workspace_members_revoked_by_user_idx ON core.workspace_members (revoked_by_user_id);

CREATE INDEX people_created_by_user_idx ON core.people (created_by_user_id);

CREATE INDEX people_updated_by_user_idx ON core.people (updated_by_user_id);

CREATE INDEX people_archived_by_user_idx ON core.people (archived_by_user_id);

CREATE INDEX people_name_idx ON core.people (workspace_id, display_name, id);

CREATE INDEX people_created_at_idx ON core.people (workspace_id, created_at, id);

CREATE INDEX person_user_links_user_idx ON core.person_user_links (user_id, workspace_id, person_id);

CREATE UNIQUE INDEX person_access_one_owner_idx ON core.person_access (workspace_id, person_id) WHERE role = 'owner' AND revoked_at IS NULL;

CREATE INDEX person_access_user_scope_idx ON core.person_access (user_id, workspace_id, person_id);

CREATE INDEX person_access_member_fk_idx ON core.person_access (workspace_id, user_id);

CREATE INDEX person_access_granted_by_user_idx ON core.person_access (granted_by_user_id);

CREATE INDEX person_access_revoked_by_user_idx ON core.person_access (revoked_by_user_id);

CREATE INDEX person_aliases_person_fk_idx ON core.person_aliases (workspace_id, person_id);

CREATE INDEX person_aliases_user_person_idx ON core.person_aliases (workspace_id, user_id, person_id);

CREATE UNIQUE INDEX identity_link_requests_pending_person_idx ON core.identity_link_requests (workspace_id, person_id) WHERE status = 'pending';

CREATE UNIQUE INDEX identity_link_requests_pending_target_idx ON core.identity_link_requests (workspace_id, target_user_id) WHERE status = 'pending';

CREATE INDEX identity_link_requests_person_fk_idx ON core.identity_link_requests (workspace_id, person_id);

CREATE INDEX identity_link_requests_target_member_idx ON core.identity_link_requests (workspace_id, target_user_id);

CREATE INDEX identity_link_requests_requester_member_idx ON core.identity_link_requests (workspace_id, requested_by_user_id);

CREATE INDEX identity_link_requests_target_status_idx ON core.identity_link_requests (target_user_id, status, expires_at);

CREATE INDEX identity_link_requests_completed_by_user_idx ON core.identity_link_requests (completed_by_user_id);

CREATE INDEX books_created_by_user_idx ON finance.books (created_by_user_id);

CREATE INDEX books_updated_by_user_idx ON finance.books (updated_by_user_id);

CREATE INDEX books_archived_by_user_idx ON finance.books (archived_by_user_id);

CREATE INDEX books_created_at_idx ON finance.books (workspace_id, created_at, id);

CREATE UNIQUE INDEX book_access_one_owner_idx ON finance.book_access (workspace_id, book_id) WHERE role = 'owner' AND revoked_at IS NULL;

CREATE INDEX book_access_user_scope_idx ON finance.book_access (user_id, workspace_id, book_id);

CREATE INDEX book_access_member_fk_idx ON finance.book_access (workspace_id, user_id);

CREATE INDEX book_access_granted_by_user_idx ON finance.book_access (granted_by_user_id);

CREATE INDEX book_access_revoked_by_user_idx ON finance.book_access (revoked_by_user_id);

CREATE INDEX accounts_created_by_user_idx ON finance.accounts (created_by_user_id);

CREATE INDEX accounts_updated_by_user_idx ON finance.accounts (updated_by_user_id);

CREATE INDEX accounts_archived_by_user_idx ON finance.accounts (archived_by_user_id);

CREATE INDEX accounts_book_currency_fk_idx ON finance.accounts (workspace_id, book_id, currency);

CREATE INDEX accounts_book_created_at_idx ON finance.accounts (workspace_id, book_id, created_at, id);

CREATE INDEX accounts_person_fk_idx ON finance.accounts (workspace_id, person_id);

CREATE INDEX transactions_created_by_user_idx ON finance.transactions (created_by_user_id);

CREATE INDEX transactions_updated_by_user_idx ON finance.transactions (updated_by_user_id);

CREATE UNIQUE INDEX transactions_one_replacement_idx ON finance.transactions (workspace_id, book_id, replaces_transaction_id) WHERE replaces_transaction_id IS NOT NULL;

CREATE INDEX transactions_book_currency_fk_idx ON finance.transactions (workspace_id, book_id, currency);

CREATE INDEX transactions_book_occurred_on_idx ON finance.transactions (workspace_id, book_id, occurred_on, id);

CREATE INDEX transactions_source_account_fk_idx ON finance.transactions (workspace_id, book_id, source_account_id, currency);

CREATE INDEX transactions_destination_account_fk_idx ON finance.transactions (workspace_id, book_id, destination_account_id, currency);

CREATE INDEX transactions_beneficiary_fk_idx ON finance.transactions (workspace_id, beneficiary_person_id);

CREATE INDEX transactions_voided_by_user_idx ON finance.transactions (voided_by_user_id);

CREATE INDEX budgets_created_by_user_idx ON finance.budgets (created_by_user_id);

CREATE INDEX budgets_updated_by_user_idx ON finance.budgets (updated_by_user_id);

CREATE INDEX budgets_archived_by_user_idx ON finance.budgets (archived_by_user_id);

CREATE INDEX budgets_book_currency_fk_idx ON finance.budgets (workspace_id, book_id, currency);

CREATE INDEX budgets_person_fk_idx ON finance.budgets (workspace_id, person_id);

CREATE INDEX budgets_book_created_at_idx ON finance.budgets (workspace_id, book_id, created_at, id);

CREATE INDEX budgets_interval_idx ON finance.budgets (workspace_id, book_id, starts_on, ends_on);

CREATE UNIQUE INDEX person_access_one_owner_idx ON health.person_access (workspace_id, person_id) WHERE role = 'owner' AND revoked_at IS NULL;

CREATE INDEX person_access_user_scope_idx ON health.person_access (user_id, workspace_id, person_id);

CREATE INDEX person_access_member_fk_idx ON health.person_access (workspace_id, user_id);

CREATE INDEX person_access_granted_by_user_idx ON health.person_access (granted_by_user_id);

CREATE INDEX person_access_revoked_by_user_idx ON health.person_access (revoked_by_user_id);

CREATE INDEX records_created_by_user_idx ON health.records (created_by_user_id);

CREATE INDEX records_updated_by_user_idx ON health.records (updated_by_user_id);

CREATE INDEX records_archived_by_user_idx ON health.records (archived_by_user_id);

CREATE INDEX records_person_created_at_idx ON health.records (workspace_id, person_id, created_at, id);

CREATE INDEX medications_created_by_user_idx ON health.medications (created_by_user_id);

CREATE INDEX medications_updated_by_user_idx ON health.medications (updated_by_user_id);

CREATE INDEX medications_archived_by_user_idx ON health.medications (archived_by_user_id);

CREATE INDEX medications_person_created_at_idx ON health.medications (workspace_id, person_id, created_at, id);

CREATE INDEX appointments_created_by_user_idx ON health.appointments (created_by_user_id);

CREATE INDEX appointments_updated_by_user_idx ON health.appointments (updated_by_user_id);

CREATE INDEX appointments_archived_by_user_idx ON health.appointments (archived_by_user_id);

CREATE INDEX appointments_person_starts_at_idx ON health.appointments (workspace_id, person_id, starts_at, id);

CREATE INDEX lab_results_created_by_user_idx ON health.lab_results (created_by_user_id);

CREATE INDEX lab_results_updated_by_user_idx ON health.lab_results (updated_by_user_id);

CREATE INDEX lab_results_archived_by_user_idx ON health.lab_results (archived_by_user_id);

CREATE INDEX lab_results_person_created_at_idx ON health.lab_results (workspace_id, person_id, created_at, id);

CREATE UNIQUE INDEX ownership_transfer_requests_pending_scope_idx ON core.ownership_transfer_requests (workspace_id, scope, person_id, book_id) NULLS NOT DISTINCT WHERE status = 'pending';

CREATE INDEX ownership_transfer_requests_person_fk_idx ON core.ownership_transfer_requests (workspace_id, person_id);

CREATE INDEX ownership_transfer_requests_book_fk_idx ON core.ownership_transfer_requests (workspace_id, book_id);

CREATE INDEX ownership_transfer_requests_offerer_member_idx ON core.ownership_transfer_requests (workspace_id, offered_by_user_id);

CREATE INDEX ownership_transfer_requests_target_member_idx ON core.ownership_transfer_requests (workspace_id, target_user_id);

CREATE INDEX ownership_transfer_requests_target_status_idx ON core.ownership_transfer_requests (target_user_id, status, expires_at);

CREATE INDEX ownership_transfer_requests_completed_by_user_idx ON core.ownership_transfer_requests (completed_by_user_id);

CREATE INDEX files_created_by_user_idx ON finance.files (created_by_user_id);

CREATE INDEX files_updated_by_user_idx ON finance.files (updated_by_user_id);

CREATE INDEX files_archived_by_user_idx ON finance.files (archived_by_user_id);

CREATE INDEX files_transaction_fk_idx ON finance.files (workspace_id, book_id, transaction_id);

CREATE INDEX files_book_state_created_at_idx ON finance.files (workspace_id, book_id, state, created_at, id);

CREATE INDEX files_created_by_user_idx ON health.files (created_by_user_id);

CREATE INDEX files_updated_by_user_idx ON health.files (updated_by_user_id);

CREATE INDEX files_archived_by_user_idx ON health.files (archived_by_user_id);

CREATE INDEX files_record_fk_idx ON health.files (workspace_id, person_id, record_id);

CREATE INDEX files_medication_fk_idx ON health.files (workspace_id, person_id, medication_id);

CREATE INDEX files_appointment_fk_idx ON health.files (workspace_id, person_id, appointment_id);

CREATE INDEX files_lab_result_fk_idx ON health.files (workspace_id, person_id, lab_result_id);

CREATE INDEX files_person_state_created_at_idx ON health.files (workspace_id, person_id, state, created_at, id);

CREATE INDEX events_scope_occurred_at_idx ON audit.events (workspace_id, module, occurred_at, id);

CREATE INDEX events_actor_idx ON audit.events (actor_user_id, occurred_at, id);

CREATE INDEX events_resource_idx ON audit.events (workspace_id, module, resource_type, resource_id, occurred_at, id);

CREATE INDEX operation_receipts_actor_completed_at_idx ON private.operation_receipts (actor_user_id, completed_at);

CREATE UNIQUE INDEX purge_requests_one_confirmed_scope_idx ON private.purge_requests (workspace_id) WHERE state IN ('approved', 'deleting_files', 'deleting_rows') OR (state = 'failed' AND confirmed_at IS NOT NULL);

CREATE INDEX purge_requests_workspace_state_idx ON private.purge_requests (workspace_id, state);

CREATE INDEX purge_requests_actor_created_at_idx ON private.purge_requests (requested_by_user_id, created_at);

ALTER TABLE core.workspaces ENABLE ROW LEVEL SECURITY;

ALTER TABLE core.workspace_members ENABLE ROW LEVEL SECURITY;

ALTER TABLE core.people ENABLE ROW LEVEL SECURITY;

ALTER TABLE core.person_user_links ENABLE ROW LEVEL SECURITY;

ALTER TABLE core.person_access ENABLE ROW LEVEL SECURITY;

ALTER TABLE core.person_aliases ENABLE ROW LEVEL SECURITY;

ALTER TABLE core.identity_link_requests ENABLE ROW LEVEL SECURITY;

ALTER TABLE finance.books ENABLE ROW LEVEL SECURITY;

ALTER TABLE finance.book_access ENABLE ROW LEVEL SECURITY;

ALTER TABLE finance.accounts ENABLE ROW LEVEL SECURITY;

ALTER TABLE finance.transactions ENABLE ROW LEVEL SECURITY;

ALTER TABLE finance.budgets ENABLE ROW LEVEL SECURITY;

ALTER TABLE health.person_access ENABLE ROW LEVEL SECURITY;

ALTER TABLE health.records ENABLE ROW LEVEL SECURITY;

ALTER TABLE health.medications ENABLE ROW LEVEL SECURITY;

ALTER TABLE health.appointments ENABLE ROW LEVEL SECURITY;

ALTER TABLE health.lab_results ENABLE ROW LEVEL SECURITY;

ALTER TABLE core.ownership_transfer_requests ENABLE ROW LEVEL SECURITY;

ALTER TABLE finance.files ENABLE ROW LEVEL SECURITY;

ALTER TABLE health.files ENABLE ROW LEVEL SECURITY;

ALTER TABLE audit.events ENABLE ROW LEVEL SECURITY;

ALTER TABLE private.operation_receipts ENABLE ROW LEVEL SECURITY;

ALTER TABLE private.purge_requests ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON ALL TABLES IN SCHEMA core, finance, health, api, audit, private FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON ALL SEQUENCES IN SCHEMA core, finance, health, api, audit, private FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA core, finance, health, api, audit, private FROM PUBLIC, anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA core, finance, health, api, audit, private REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA core, finance, health, api, audit, private REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA core, finance, health, api, audit, private REVOKE ALL ON SEQUENCES FROM PUBLIC, anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA core, finance, health, api, audit, private REVOKE ALL ON SEQUENCES FROM PUBLIC, anon, authenticated, service_role;

-- Each future migration must explicitly revoke PUBLIC execution on its new functions.

-- Foundation integrity only; application authorization and RPCs are intentionally absent.

CREATE FUNCTION private.is_historical_auth_cleanup(old_row jsonb, new_row jsonb)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
DECLARE
    field_name text;
    changed boolean := false;
BEGIN
    IF pg_trigger_depth() < 2 THEN
        RETURN false;
    END IF;
    FOR field_name IN SELECT key FROM jsonb_each(old_row)
    LOOP
        IF old_row -> field_name IS DISTINCT FROM new_row -> field_name THEN
            IF field_name <> ALL (ARRAY[
                'created_by_user_id', 'updated_by_user_id', 'archived_by_user_id',
                'invited_by_user_id', 'revoked_by_user_id', 'granted_by_user_id',
                'completed_by_user_id', 'voided_by_user_id'
            ]) OR old_row ->> field_name IS NULL OR new_row ->> field_name IS NOT NULL
                OR EXISTS (SELECT 1 FROM auth.users WHERE id = (old_row ->> field_name)::uuid)
            THEN
                RETURN false;
            END IF;
            changed := true;
        END IF;
    END LOOP;
    RETURN changed;
END;
$$;

CREATE FUNCTION private.scope_has_active_purge(space_id uuid, scope_name text, scope_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM private.purge_requests p
        WHERE p.workspace_id = space_id
          AND p.confirmed_at IS NOT NULL
          AND p.state IN ('approved', 'deleting_files', 'deleting_rows', 'failed')
          AND (p.scope = 'workspace'
               OR (scope_name = 'book' AND p.scope = 'book' AND p.book_id = scope_id)
               OR (scope_name = 'person' AND p.scope = 'person' AND p.person_id = scope_id)
               OR (scope_name = 'health_person' AND p.scope IN ('person', 'health_person')
                   AND p.person_id = scope_id))
    );
$$;

CREATE FUNCTION private.lock_workspace_for_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
DECLARE
    row_data jsonb;
    space_id uuid;
    book_id uuid;
    person_id uuid;
    scope_name text;
BEGIN
    -- shortcut: administrator UPDATEs can acquire a row lock before this trigger; future API operations must lock the workspace before issuing row mutations.
    row_data := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
    space_id := CASE WHEN TG_TABLE_SCHEMA = 'core' AND TG_TABLE_NAME = 'workspaces'
                     THEN (row_data ->> 'id')::uuid ELSE (row_data ->> 'workspace_id')::uuid END;
    IF space_id IS NOT NULL THEN
        PERFORM 1 FROM core.workspaces WHERE id = space_id FOR UPDATE;
        IF NOT FOUND AND TG_TABLE_SCHEMA NOT IN ('audit', 'private')
           AND NOT (TG_TABLE_SCHEMA = 'core' AND TG_TABLE_NAME = 'workspaces' AND TG_OP = 'INSERT')
        THEN
            RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'workspace_not_found';
        END IF;
    END IF;
    IF TG_TABLE_SCHEMA IN ('audit', 'private') OR TG_OP = 'DELETE'
       OR (TG_OP = 'UPDATE' AND private.is_historical_auth_cleanup(to_jsonb(OLD), row_data))
    THEN
        IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
        RETURN NEW;
    END IF;
    book_id := CASE WHEN TG_TABLE_SCHEMA = 'finance' AND TG_TABLE_NAME = 'books'
                    THEN (row_data ->> 'id')::uuid ELSE (row_data ->> 'book_id')::uuid END;
    person_id := CASE WHEN TG_TABLE_SCHEMA = 'core' AND TG_TABLE_NAME = 'people'
                      THEN (row_data ->> 'id')::uuid
                      ELSE coalesce(row_data ->> 'person_id', row_data ->> 'beneficiary_person_id')::uuid END;
    scope_name := CASE WHEN TG_TABLE_SCHEMA = 'health' THEN 'health_person' ELSE 'person' END;
    IF TG_TABLE_SCHEMA = 'core' AND TG_TABLE_NAME = 'ownership_transfer_requests' THEN
        scope_name := row_data ->> 'scope';
    END IF;
    IF private.scope_has_active_purge(space_id, 'workspace', space_id)
       OR (book_id IS NOT NULL AND private.scope_has_active_purge(space_id, 'book', book_id))
       OR (person_id IS NOT NULL AND private.scope_has_active_purge(space_id, scope_name, person_id))
    THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'resource_has_active_purge';
    END IF;
    RETURN NEW;
END;
$$;

CREATE FUNCTION private.enforce_row_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
DECLARE
    row_data jsonb;
    old_data jsonb := '{}'::jsonb;
    patch jsonb := '{}'::jsonb;
    actor_id uuid := auth.uid();
    field_name text;
    cleanup boolean := false;
    server_time timestamptz := transaction_timestamp();
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF TG_TABLE_SCHEMA IN ('audit', 'private') THEN
            RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'historical_record_cannot_be_deleted';
        END IF;
        RETURN OLD;
    END IF;
    row_data := to_jsonb(NEW);
    IF TG_OP = 'UPDATE' THEN
        old_data := to_jsonb(OLD);
        cleanup := private.is_historical_auth_cleanup(old_data, row_data);
        -- An Auth FK action only clears the deleted actor, not the last business edit.
        IF cleanup THEN RETURN NEW; END IF;
        IF TG_TABLE_SCHEMA = 'audit' THEN
            RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'audit_event_is_immutable';
        END IF;
        FOREACH field_name IN ARRAY ARRAY[
            'id', 'workspace_id', 'book_id', 'person_id', 'user_id', 'scope',
            'created_at', 'created_by_user_id', 'bucket_id', 'object_path',
            'transaction_id', 'record_id', 'medication_id', 'appointment_id', 'lab_result_id',
            'target_user_id', 'requested_by_user_id', 'offered_by_user_id',
            'verified_at', 'verification_method', 'expires_at', 'request_id'
        ]
        LOOP
            IF old_data ? field_name AND old_data -> field_name IS DISTINCT FROM row_data -> field_name
               AND NOT (field_name = 'person_id' AND TG_TABLE_SCHEMA = 'finance'
                        AND TG_TABLE_NAME IN ('accounts', 'budgets'))
            THEN
                RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'immutable_field', DETAIL = field_name;
            END IF;
        END LOOP;
        IF row_data ? 'version' THEN
            IF (row_data ->> 'version')::integer IS DISTINCT FROM (old_data ->> 'version')::integer THEN
                RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'version_conflict';
            END IF;
            patch := patch || jsonb_build_object('version', (old_data ->> 'version')::integer + 1);
        END IF;
        IF old_data ->> 'archived_at' IS NOT NULL
           AND old_data - ARRAY['updated_at', 'updated_by_user_id', 'version', 'archived_at', 'archived_by_user_id']
               IS DISTINCT FROM row_data - ARRAY['updated_at', 'updated_by_user_id', 'version', 'archived_at', 'archived_by_user_id']
        THEN
            RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'archived_record_cannot_be_edited';
        END IF;
        IF old_data ->> 'archived_at' IS NOT NULL
           AND row_data ->> 'archived_at' IS NOT NULL
           AND old_data -> 'archived_at' IS DISTINCT FROM row_data -> 'archived_at'
        THEN
            RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'archive_timestamp_is_immutable';
        END IF;
    ELSE
        IF row_data ? 'created_at' THEN patch := patch || jsonb_build_object('created_at', server_time); END IF;
        IF row_data ? 'version' THEN patch := patch || jsonb_build_object('version', 1); END IF;
        IF row_data ? 'archived_at' AND row_data ->> 'archived_at' IS NOT NULL THEN
            RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'new_record_must_be_active';
        END IF;
        IF row_data ? 'created_by_user_id' THEN
            patch := patch || jsonb_build_object('created_by_user_id', actor_id);
        END IF;
    END IF;
    IF row_data ? 'updated_at' THEN patch := patch || jsonb_build_object('updated_at', server_time); END IF;
    IF row_data ? 'updated_by_user_id' THEN
        patch := patch || jsonb_build_object('updated_by_user_id', actor_id);
    END IF;
    IF TG_TABLE_SCHEMA NOT IN ('audit', 'private')
       AND NOT (TG_TABLE_SCHEMA = 'core' AND TG_TABLE_NAME IN ('identity_link_requests', 'ownership_transfer_requests')
                AND TG_OP = 'UPDATE' AND row_data ->> 'status' = 'expired')
       AND (actor_id IS NULL OR NOT EXISTS (SELECT 1 FROM auth.users WHERE id = actor_id))
    THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'actor_required';
    END IF;
    IF row_data ? 'archived_at' THEN
        IF row_data ->> 'archived_at' IS NULL THEN
            patch := patch || jsonb_build_object('archived_by_user_id', NULL);
        ELSIF TG_OP = 'INSERT' OR old_data ->> 'archived_at' IS NULL THEN
            patch := patch || jsonb_build_object('archived_at', server_time, 'archived_by_user_id', actor_id);
        ELSIF old_data -> 'archived_by_user_id' IS DISTINCT FROM row_data -> 'archived_by_user_id' THEN
            RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'archive_actor_is_immutable';
        END IF;
    END IF;
    IF row_data ? 'granted_at' THEN
        IF TG_OP = 'INSERT' THEN
            IF row_data ->> 'revoked_at' IS NOT NULL THEN
                RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'new_grant_must_be_active';
            END IF;
            patch := patch || jsonb_build_object('granted_at', server_time, 'granted_by_user_id', actor_id);
        ELSIF old_data -> 'granted_at' IS DISTINCT FROM row_data -> 'granted_at'
           OR old_data -> 'granted_by_user_id' IS DISTINCT FROM row_data -> 'granted_by_user_id' THEN
            RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'grant_origin_is_immutable';
        END IF;
    END IF;
    IF row_data ? 'revoked_at' THEN
        IF row_data ->> 'revoked_at' IS NULL THEN
            patch := patch || jsonb_build_object('revoked_by_user_id', NULL);
        ELSIF TG_OP = 'INSERT' OR old_data ->> 'revoked_at' IS NULL THEN
            patch := patch || jsonb_build_object('revoked_at', server_time, 'revoked_by_user_id', actor_id);
        ELSIF old_data -> 'revoked_at' IS DISTINCT FROM row_data -> 'revoked_at'
           OR old_data -> 'revoked_by_user_id' IS DISTINCT FROM row_data -> 'revoked_by_user_id' THEN
            RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'revocation_origin_is_immutable';
        END IF;
    END IF;
    IF TG_TABLE_SCHEMA = 'core' AND TG_TABLE_NAME = 'person_aliases' AND TG_OP = 'UPDATE'
       AND lower(btrim(row_data ->> 'alias')) IS DISTINCT FROM old_data ->> 'alias_normalized'
    THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'alias_key_requires_replacement';
    END IF;
    IF TG_TABLE_SCHEMA = 'core' AND TG_TABLE_NAME = 'person_user_links' AND TG_OP = 'INSERT' THEN
        patch := patch || jsonb_build_object('verified_at', server_time);
    END IF;
    IF TG_TABLE_SCHEMA = 'core' AND TG_TABLE_NAME = 'workspace_members' THEN
        IF TG_OP = 'INSERT' OR old_data -> 'status' IS DISTINCT FROM row_data -> 'status' THEN
            CASE row_data ->> 'status'
                WHEN 'invited' THEN
                    IF TG_OP = 'UPDATE' AND old_data ->> 'status' <> 'revoked' THEN
                        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'invalid_membership_transition';
                    END IF;
                    patch := patch || jsonb_build_object('invited_at', server_time,
                        'invite_expires_at', server_time + interval '7 days', 'invited_by_user_id', actor_id,
                        'accepted_at', NULL, 'revoked_at', NULL, 'revoked_by_user_id', NULL);
                WHEN 'active' THEN
                    IF TG_OP = 'UPDATE' AND (old_data ->> 'status' <> 'invited'
                       OR (old_data ->> 'invite_expires_at')::timestamptz <= server_time) THEN
                        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'invalid_membership_acceptance';
                    END IF;
                    patch := patch || jsonb_build_object('accepted_at', server_time,
                        'revoked_at', NULL, 'revoked_by_user_id', NULL);
                WHEN 'revoked' THEN
                    patch := patch || jsonb_build_object('revoked_at', server_time, 'revoked_by_user_id', actor_id);
                ELSE NULL;
            END CASE;
        END IF;
    END IF;
    IF TG_TABLE_SCHEMA = 'core' AND TG_TABLE_NAME IN ('identity_link_requests', 'ownership_transfer_requests') THEN
        IF TG_OP = 'INSERT' THEN
            IF row_data ->> 'status' <> 'pending' THEN
                RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'new_request_must_be_pending';
            END IF;
            patch := patch || jsonb_build_object('expires_at', server_time + interval '7 days',
                'completed_at', NULL, 'completed_by_user_id', NULL);
            IF TG_TABLE_NAME = 'identity_link_requests' THEN
                patch := patch || jsonb_build_object('requested_by_user_id', actor_id);
            ELSE
                patch := patch || jsonb_build_object('offered_by_user_id', actor_id);
            END IF;
        ELSIF old_data ->> 'status' <> 'pending' THEN
            RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'completed_request_is_immutable';
        ELSIF row_data ->> 'status' <> 'pending' THEN
            IF row_data ->> 'status' = 'expired' THEN
                IF (old_data ->> 'expires_at')::timestamptz > server_time THEN
                    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'request_has_not_expired';
                END IF;
            ELSIF (old_data ->> 'expires_at')::timestamptz <= server_time THEN
                RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'request_has_expired';
            END IF;
            patch := patch || jsonb_build_object('completed_at', server_time,
                'completed_by_user_id', CASE WHEN row_data ->> 'status' = 'expired' THEN NULL ELSE actor_id END);
        ELSIF row_data -> 'completed_at' IS DISTINCT FROM old_data -> 'completed_at'
           OR row_data -> 'completed_by_user_id' IS DISTINCT FROM old_data -> 'completed_by_user_id' THEN
            RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'pending_request_cannot_be_completed';
        END IF;
    END IF;
    IF (TG_TABLE_SCHEMA = 'core' AND TG_TABLE_NAME = 'workspaces')
       OR (TG_TABLE_SCHEMA = 'health' AND TG_TABLE_NAME = 'appointments') THEN
        IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name = row_data ->> 'timezone') THEN
            RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'invalid_timezone';
        END IF;
    END IF;
    IF TG_TABLE_NAME = 'files' AND TG_TABLE_SCHEMA IN ('finance', 'health') THEN
        IF TG_OP = 'INSERT' AND row_data ->> 'state' <> 'pending' THEN
            RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'new_file_must_be_pending';
        ELSIF TG_OP = 'UPDATE' THEN
            IF old_data ->> 'state' = 'deleting' AND row_data ->> 'state' <> 'deleting' THEN
                RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'deleting_file_cannot_be_restored';
            END IF;
            IF old_data ->> 'state' = 'ready' THEN
                IF row_data ->> 'state' NOT IN ('ready', 'deleting')
                   OR old_data -> 'original_name' IS DISTINCT FROM row_data -> 'original_name'
                   OR old_data -> 'mime_type' IS DISTINCT FROM row_data -> 'mime_type'
                   OR old_data -> 'size_bytes' IS DISTINCT FROM row_data -> 'size_bytes' THEN
                    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ready_file_metadata_is_immutable';
                END IF;
            END IF;
            IF old_data ->> 'state' = 'pending' AND row_data ->> 'state' = 'ready'
               AND row_data ->> 'archived_at' IS NOT NULL THEN
                RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'archived_upload_cannot_be_finalized';
            END IF;
        END IF;
    END IF;
    IF TG_TABLE_SCHEMA = 'audit' THEN
        patch := patch || jsonb_build_object('occurred_at', server_time);
    END IF;
    NEW := jsonb_populate_record(NEW, patch);
    RETURN NEW;
END;
$$;

CREATE FUNCTION private.enforce_finance_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
DECLARE
    precision_digits smallint;
    money_value numeric;
    original finance.transactions%ROWTYPE;
    account_row finance.accounts%ROWTYPE;
    old_data jsonb;
    new_data jsonb;
    field_name text;
BEGIN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    IF TG_OP = 'UPDATE' THEN
        old_data := to_jsonb(OLD);
        new_data := to_jsonb(NEW);
        -- The stamping trigger has already updated administrative fields.
        IF private.is_historical_auth_cleanup(
            old_data, new_data || jsonb_build_object('updated_at', OLD.updated_at, 'version', OLD.version)) THEN
            RETURN NEW;
        END IF;
    END IF;
    IF TG_TABLE_NAME = 'books' THEN
        IF TG_OP = 'UPDATE' AND (NEW.currency IS DISTINCT FROM OLD.currency
           OR NEW.minor_unit IS DISTINCT FROM OLD.minor_unit) THEN
            RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'book_currency_is_immutable';
        END IF;
        RETURN NEW;
    END IF;
    IF TG_OP = 'UPDATE' AND NEW.currency IS DISTINCT FROM OLD.currency THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'resource_currency_is_immutable';
    END IF;
    SELECT b.minor_unit INTO precision_digits FROM finance.books b
    WHERE b.workspace_id = NEW.workspace_id AND b.id = NEW.book_id AND b.currency = NEW.currency;
    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'book_currency_not_found';
    END IF;
    money_value := CASE WHEN TG_TABLE_NAME = 'accounts' THEN (to_jsonb(NEW) ->> 'opening_balance')::numeric
                        ELSE (to_jsonb(NEW) ->> 'amount')::numeric END;
    IF NOT (money_value > '-Infinity'::numeric AND money_value < 'Infinity'::numeric)
       OR money_value IS DISTINCT FROM trunc(money_value, precision_digits) THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'invalid_stored_money_precision';
    END IF;
    IF TG_TABLE_NAME = 'accounts' THEN
        IF TG_OP = 'UPDATE' AND NEW.opening_balance IS DISTINCT FROM OLD.opening_balance
           AND EXISTS (SELECT 1 FROM finance.transactions t
                       WHERE t.workspace_id = NEW.workspace_id AND t.book_id = NEW.book_id
                         AND (t.source_account_id = NEW.id OR t.destination_account_id = NEW.id)) THEN
            RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'opening_balance_has_movements';
        END IF;
        RETURN NEW;
    ELSIF TG_TABLE_NAME = 'budgets' THEN
        RETURN NEW;
    END IF;
    IF TG_OP = 'UPDATE' THEN
        FOREACH field_name IN ARRAY ARRAY['kind', 'amount', 'currency', 'source_account_id',
            'destination_account_id', 'beneficiary_person_id', 'occurred_on', 'description',
            'request_id', 'replaces_transaction_id'] LOOP
            IF old_data -> field_name IS DISTINCT FROM new_data -> field_name THEN
                RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'transaction_original_is_immutable', DETAIL = field_name;
            END IF;
        END LOOP;
        IF OLD.voided_at IS NOT NULL THEN
            RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'voided_transaction_is_immutable';
        END IF;
        IF NEW.voided_at IS NULL THEN
            RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'transaction_update_requires_void';
        END IF;
        NEW.voided_at := transaction_timestamp();
        NEW.voided_by_user_id := auth.uid();
        RETURN NEW;
    END IF;
    IF NEW.voided_at IS NOT NULL OR NEW.voided_by_user_id IS NOT NULL OR NEW.void_reason IS NOT NULL THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'new_transaction_must_not_be_voided';
    END IF;
    IF NEW.replaces_transaction_id IS NOT NULL THEN
        SELECT t.* INTO original FROM finance.transactions t
        WHERE t.workspace_id = NEW.workspace_id AND t.book_id = NEW.book_id
          AND t.id = NEW.replaces_transaction_id FOR UPDATE;
        IF NOT FOUND THEN
            RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'replacement_original_not_found';
        END IF;
        IF original.voided_at IS NULL OR original.voided_at IS DISTINCT FROM transaction_timestamp() THEN
            RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'replacement_requires_atomic_void';
        END IF;
    END IF;
    FOR account_row IN
        SELECT a.* FROM finance.accounts a
        WHERE a.workspace_id = NEW.workspace_id AND a.book_id = NEW.book_id
          AND a.id IN (NEW.source_account_id, NEW.destination_account_id)
        ORDER BY a.id FOR UPDATE
    LOOP
        IF account_row.archived_at IS NOT NULL AND NOT (
            NEW.replaces_transaction_id IS NOT NULL
            AND ((account_row.id = NEW.source_account_id AND NEW.source_account_id = original.source_account_id)
                 OR (account_row.id = NEW.destination_account_id AND NEW.destination_account_id = original.destination_account_id))) THEN
            RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'account_is_archived';
        END IF;
    END LOOP;
    IF NEW.beneficiary_person_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM core.people p WHERE p.workspace_id = NEW.workspace_id
          AND p.id = NEW.beneficiary_person_id AND p.archived_at IS NOT NULL
    ) AND NOT (NEW.replaces_transaction_id IS NOT NULL
               AND NEW.beneficiary_person_id = original.beneficiary_person_id) THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'beneficiary_is_archived';
    END IF;
    RETURN NEW;
END;
$$;

CREATE FUNCTION private.enforce_parent_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
DECLARE
    row_data jsonb;
    old_data jsonb := '{}'::jsonb;
    v_space_id uuid;
    v_person_id uuid;
    v_book_id uuid;
    parent_archived timestamptz;
    child_archived timestamptz;
    movement finance.transactions%ROWTYPE;
BEGIN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    row_data := to_jsonb(NEW);
    IF TG_OP = 'UPDATE' THEN
        old_data := to_jsonb(OLD);
        IF private.is_historical_auth_cleanup(old_data,
            row_data || jsonb_build_object('updated_at', old_data -> 'updated_at', 'version', old_data -> 'version')) THEN
            RETURN NEW;
        END IF;
    END IF;
    v_space_id := CASE WHEN TG_TABLE_SCHEMA = 'core' AND TG_TABLE_NAME = 'workspaces'
                     THEN (row_data ->> 'id')::uuid ELSE (row_data ->> 'workspace_id')::uuid END;
    IF TG_TABLE_SCHEMA = 'core' AND TG_TABLE_NAME = 'workspaces' THEN
        IF TG_OP = 'UPDATE' AND OLD.archived_at IS NULL AND NEW.archived_at IS NOT NULL
           AND (EXISTS (SELECT 1 FROM core.people p WHERE p.workspace_id = v_space_id AND p.archived_at IS NULL)
                OR EXISTS (SELECT 1 FROM finance.books b WHERE b.workspace_id = v_space_id AND b.archived_at IS NULL)) THEN
            RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'workspace_has_active_resources';
        END IF;
        RETURN NEW;
    END IF;
    SELECT w.archived_at INTO parent_archived FROM core.workspaces w WHERE w.id = v_space_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'workspace_not_found';
    END IF;
    -- Membership and ACL administration retain access to archived-resource history.
    IF (TG_TABLE_SCHEMA = 'core' AND TG_TABLE_NAME IN ('workspace_members', 'ownership_transfer_requests'))
       OR TG_TABLE_NAME IN ('person_access', 'book_access') THEN
        IF TG_TABLE_NAME IN ('person_access', 'book_access') AND row_data ->> 'revoked_at' IS NULL
           AND NOT EXISTS (SELECT 1 FROM core.workspace_members m
                           WHERE m.workspace_id = v_space_id AND m.user_id = (row_data ->> 'user_id')::uuid
                             AND m.status = 'active') THEN
            RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'active_grant_requires_active_member';
        END IF;
        IF TG_TABLE_SCHEMA = 'health' AND TG_TABLE_NAME = 'person_access' AND TG_OP = 'INSERT'
           AND NOT EXISTS (SELECT 1 FROM health.person_access a
                           WHERE a.workspace_id = v_space_id AND a.person_id = (row_data ->> 'person_id')::uuid)
           AND (parent_archived IS NOT NULL OR EXISTS (
               SELECT 1 FROM core.people p WHERE p.workspace_id = v_space_id
                 AND p.id = (row_data ->> 'person_id')::uuid AND p.archived_at IS NOT NULL)) THEN
            RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'health_bootstrap_requires_active_parents';
        END IF;
        RETURN NEW;
    END IF;
    IF parent_archived IS NOT NULL THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'workspace_is_archived';
    END IF;
    IF TG_TABLE_SCHEMA = 'core' AND TG_TABLE_NAME = 'people' THEN
        IF TG_OP = 'UPDATE' AND OLD.archived_at IS NULL AND NEW.archived_at IS NOT NULL
           AND (EXISTS (SELECT 1 FROM health.records r WHERE r.workspace_id = v_space_id AND r.person_id = NEW.id AND r.archived_at IS NULL)
                OR EXISTS (SELECT 1 FROM health.medications m WHERE m.workspace_id = v_space_id AND m.person_id = NEW.id AND m.archived_at IS NULL)
                OR EXISTS (SELECT 1 FROM health.appointments a WHERE a.workspace_id = v_space_id AND a.person_id = NEW.id AND a.archived_at IS NULL)
                OR EXISTS (SELECT 1 FROM health.lab_results l WHERE l.workspace_id = v_space_id AND l.person_id = NEW.id AND l.archived_at IS NULL)
                OR EXISTS (SELECT 1 FROM finance.accounts a WHERE a.workspace_id = v_space_id AND a.person_id = NEW.id AND a.archived_at IS NULL)
                OR EXISTS (SELECT 1 FROM finance.budgets b WHERE b.workspace_id = v_space_id AND b.person_id = NEW.id AND b.archived_at IS NULL)) THEN
            RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'person_has_active_dependencies';
        END IF;
        RETURN NEW;
    END IF;
    v_book_id := (row_data ->> 'book_id')::uuid;
    IF v_book_id IS NOT NULL THEN
        SELECT b.archived_at INTO parent_archived FROM finance.books b WHERE b.workspace_id = v_space_id AND b.id = v_book_id;
        IF NOT FOUND THEN
            RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'book_not_found';
        END IF;
        IF parent_archived IS NOT NULL THEN
            RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'book_is_archived';
        END IF;
    END IF;
    v_person_id := (row_data ->> 'person_id')::uuid;
    IF v_person_id IS NOT NULL THEN
        SELECT p.archived_at INTO parent_archived FROM core.people p WHERE p.workspace_id = v_space_id AND p.id = v_person_id;
        IF NOT FOUND THEN
            RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'person_not_found';
        END IF;
        IF parent_archived IS NOT NULL THEN
            RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'person_is_archived';
        END IF;
    END IF;
    IF TG_TABLE_NAME = 'files' AND TG_TABLE_SCHEMA = 'finance' THEN
        SELECT t.* INTO movement FROM finance.transactions t
        WHERE t.workspace_id = v_space_id AND t.book_id = v_book_id AND t.id = NEW.transaction_id;
        IF NOT FOUND THEN
            RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'file_transaction_not_found';
        END IF;
        IF movement.voided_at IS NOT NULL OR EXISTS (
            SELECT 1 FROM finance.accounts a WHERE a.workspace_id = v_space_id AND a.book_id = v_book_id
              AND a.id IN (movement.source_account_id, movement.destination_account_id) AND a.archived_at IS NOT NULL
        ) THEN
            RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'file_parent_is_not_active';
        END IF;
    ELSIF TG_TABLE_NAME = 'files' AND TG_TABLE_SCHEMA = 'health' THEN
        IF NEW.record_id IS NOT NULL THEN
            SELECT r.archived_at INTO child_archived FROM health.records r
            WHERE r.workspace_id = v_space_id AND r.person_id = NEW.person_id AND r.id = NEW.record_id;
        ELSIF NEW.medication_id IS NOT NULL THEN
            SELECT m.archived_at INTO child_archived FROM health.medications m
            WHERE m.workspace_id = v_space_id AND m.person_id = NEW.person_id AND m.id = NEW.medication_id;
        ELSIF NEW.appointment_id IS NOT NULL THEN
            SELECT a.archived_at INTO child_archived FROM health.appointments a
            WHERE a.workspace_id = v_space_id AND a.person_id = NEW.person_id AND a.id = NEW.appointment_id;
        ELSIF NEW.lab_result_id IS NOT NULL THEN
            SELECT l.archived_at INTO child_archived FROM health.lab_results l
            WHERE l.workspace_id = v_space_id AND l.person_id = NEW.person_id AND l.id = NEW.lab_result_id;
        ELSE
            RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'file_requires_one_parent';
        END IF;
        IF NOT FOUND THEN
            RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'file_health_parent_not_found';
        END IF;
        IF child_archived IS NOT NULL THEN
            RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'file_parent_is_archived';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE FUNCTION private.enforce_private_records()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
DECLARE
    actor_id uuid := auth.uid();
    field_name text;
    row_data jsonb := to_jsonb(NEW);
    old_data jsonb;
BEGIN
    IF TG_TABLE_NAME = 'operation_receipts' THEN
        IF TG_OP = 'INSERT' THEN
            IF actor_id IS NULL OR NEW.status <> 'completed' THEN
                RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'receipt_requires_completed_user_operation';
            END IF;
            NEW.actor_user_id := actor_id;
            NEW.completed_at := NEW.created_at;
        ELSE
            old_data := to_jsonb(OLD);
            FOREACH field_name IN ARRAY ARRAY['actor_user_id', 'operation', 'completed_at'] LOOP
                IF old_data -> field_name IS DISTINCT FROM row_data -> field_name THEN
                    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'receipt_origin_is_immutable';
                END IF;
            END LOOP;
            IF NEW.status <> 'purged' OR NEW.payload_hash IS NOT NULL
               OR NOT (NEW.resource_ids <@ OLD.resource_ids) THEN
                RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'receipt_only_allows_purge_tombstone';
            END IF;
        END IF;
        RETURN NEW;
    END IF;
    IF TG_OP = 'INSERT' THEN
        IF actor_id IS NULL OR NEW.state <> 'prepared' OR NEW.confirmed_at IS NOT NULL THEN
            RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'purge_requires_prepared_user_request';
        END IF;
        NEW.requested_by_user_id := actor_id;
        NEW.expires_at := NEW.created_at + interval '5 minutes';
        RETURN NEW;
    END IF;
    IF OLD.state IN ('completed', 'cancelled') THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'finished_purge_is_immutable';
    END IF;
    IF NEW.manifest IS DISTINCT FROM OLD.manifest OR NEW.manifest_hash IS DISTINCT FROM OLD.manifest_hash THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'purge_manifest_is_immutable';
    END IF;
    IF OLD.state IS DISTINCT FROM NEW.state AND NOT (
        (OLD.state = 'prepared' AND NEW.state IN ('approved', 'cancelled', 'failed'))
        OR (OLD.state = 'approved' AND NEW.state IN ('deleting_files', 'cancelled', 'failed'))
        OR (OLD.state = 'deleting_files' AND NEW.state IN ('deleting_rows', 'failed'))
        OR (OLD.state = 'deleting_rows' AND NEW.state IN ('completed', 'failed'))
        OR (OLD.state = 'failed' AND OLD.confirmed_at IS NOT NULL AND NEW.state IN ('deleting_files', 'deleting_rows'))
        OR (OLD.state = 'failed' AND OLD.confirmed_at IS NULL AND NEW.state = 'cancelled')) THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'invalid_purge_transition';
    END IF;
    IF OLD.state = 'prepared' AND NEW.state = 'approved' THEN
        IF OLD.expires_at <= transaction_timestamp() OR actor_id IS DISTINCT FROM OLD.requested_by_user_id THEN
            RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'purge_confirmation_is_not_valid';
        END IF;
        NEW.confirmed_at := transaction_timestamp();
    ELSIF NEW.confirmed_at IS DISTINCT FROM OLD.confirmed_at THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'purge_confirmation_is_immutable';
    END IF;
    RETURN NEW;
END;
$$;

CREATE FUNCTION private.check_scope_owners()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
DECLARE
    row_data jsonb;
    space_id uuid;
BEGIN
    row_data := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
    space_id := CASE WHEN TG_TABLE_SCHEMA = 'core' AND TG_TABLE_NAME = 'workspaces'
                     THEN (row_data ->> 'id')::uuid ELSE (row_data ->> 'workspace_id')::uuid END;
    IF NOT EXISTS (SELECT 1 FROM core.workspaces WHERE id = space_id) THEN RETURN NULL; END IF;
    IF NOT private.scope_has_active_purge(space_id, 'workspace', space_id)
       AND (SELECT count(*) FROM core.workspace_members
            WHERE workspace_id = space_id AND role = 'owner' AND status = 'active') <> 1 THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'workspace_requires_one_active_owner';
    END IF;
    IF EXISTS (
        SELECT 1 FROM core.people p WHERE p.workspace_id = space_id
          AND NOT private.scope_has_active_purge(space_id, 'person', p.id)
          AND (SELECT count(*) FROM core.person_access a
               JOIN core.workspace_members m ON m.workspace_id = a.workspace_id AND m.user_id = a.user_id
               WHERE a.workspace_id = space_id AND a.person_id = p.id AND a.role = 'owner'
                 AND a.revoked_at IS NULL AND m.status = 'active') <> 1
    ) THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'person_requires_one_active_owner';
    END IF;
    IF EXISTS (
        SELECT 1 FROM finance.books b WHERE b.workspace_id = space_id
          AND NOT private.scope_has_active_purge(space_id, 'book', b.id)
          AND (SELECT count(*) FROM finance.book_access a
               JOIN core.workspace_members m ON m.workspace_id = a.workspace_id AND m.user_id = a.user_id
               WHERE a.workspace_id = space_id AND a.book_id = b.id AND a.role = 'owner'
                 AND a.revoked_at IS NULL AND m.status = 'active') <> 1
    ) THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'book_requires_one_active_owner';
    END IF;
    IF EXISTS (
        SELECT 1 FROM (
            SELECT person_id FROM health.person_access WHERE workspace_id = space_id
            UNION SELECT person_id FROM health.records WHERE workspace_id = space_id
            UNION SELECT person_id FROM health.medications WHERE workspace_id = space_id
            UNION SELECT person_id FROM health.appointments WHERE workspace_id = space_id
            UNION SELECT person_id FROM health.lab_results WHERE workspace_id = space_id
            UNION SELECT person_id FROM health.files WHERE workspace_id = space_id
        ) h
        WHERE NOT private.scope_has_active_purge(space_id, 'health_person', h.person_id)
          AND (SELECT count(*) FROM health.person_access a
               JOIN core.workspace_members m ON m.workspace_id = a.workspace_id AND m.user_id = a.user_id
               WHERE a.workspace_id = space_id AND a.person_id = h.person_id AND a.role = 'owner'
                 AND a.revoked_at IS NULL AND m.status = 'active') <> 1
    ) THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'health_scope_requires_one_active_owner';
    END IF;
    IF EXISTS (
        SELECT 1 FROM (
            SELECT workspace_id, user_id FROM core.person_access WHERE workspace_id = space_id AND revoked_at IS NULL
            UNION ALL SELECT workspace_id, user_id FROM finance.book_access WHERE workspace_id = space_id AND revoked_at IS NULL
            UNION ALL SELECT workspace_id, user_id FROM health.person_access WHERE workspace_id = space_id AND revoked_at IS NULL
        ) a JOIN core.workspace_members m ON m.workspace_id = a.workspace_id AND m.user_id = a.user_id
        WHERE m.status <> 'active'
    ) THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'inactive_member_has_active_acl';
    END IF;
    RETURN NULL;
END;
$$;

-- This fixed list is migration-owned; no identifiers or SQL originate from application input.
DO $$
DECLARE
    table_ref record;
BEGIN
    FOR table_ref IN SELECT * FROM (VALUES
        ('core', 'workspaces'), ('core', 'workspace_members'), ('core', 'people'),
        ('core', 'person_user_links'), ('core', 'person_access'), ('core', 'person_aliases'),
        ('core', 'identity_link_requests'), ('core', 'ownership_transfer_requests'),
        ('finance', 'books'), ('finance', 'book_access'), ('finance', 'accounts'),
        ('finance', 'transactions'), ('finance', 'budgets'), ('finance', 'files'),
        ('health', 'person_access'), ('health', 'records'), ('health', 'medications'),
        ('health', 'appointments'), ('health', 'lab_results'), ('health', 'files'),
        ('audit', 'events'), ('private', 'operation_receipts'), ('private', 'purge_requests')
    ) AS tables(schema_name, table_name)
    LOOP
        EXECUTE format('CREATE TRIGGER a_workspace_lock BEFORE INSERT OR UPDATE OR DELETE ON %I.%I '
                       'FOR EACH ROW EXECUTE FUNCTION private.lock_workspace_for_integrity()',
                       table_ref.schema_name, table_ref.table_name);
        EXECUTE format('CREATE TRIGGER b_row_integrity BEFORE INSERT OR UPDATE OR DELETE ON %I.%I '
                       'FOR EACH ROW EXECUTE FUNCTION private.enforce_row_integrity()',
                       table_ref.schema_name, table_ref.table_name);
        IF table_ref.schema_name IN ('core', 'finance', 'health') THEN
            EXECUTE format('CREATE TRIGGER c_parent_lifecycle BEFORE INSERT OR UPDATE OR DELETE ON %I.%I '
                           'FOR EACH ROW EXECUTE FUNCTION private.enforce_parent_lifecycle()',
                           table_ref.schema_name, table_ref.table_name);
        END IF;
        IF table_ref.schema_name = 'finance' AND table_ref.table_name IN ('books', 'accounts', 'transactions', 'budgets') THEN
            EXECUTE format('CREATE TRIGGER d_finance_integrity BEFORE INSERT OR UPDATE ON %I.%I '
                           'FOR EACH ROW EXECUTE FUNCTION private.enforce_finance_integrity()',
                           table_ref.schema_name, table_ref.table_name);
        END IF;
        IF table_ref.schema_name = 'private' THEN
            EXECUTE format('CREATE TRIGGER c_private_records BEFORE INSERT OR UPDATE ON %I.%I '
                           'FOR EACH ROW EXECUTE FUNCTION private.enforce_private_records()',
                           table_ref.schema_name, table_ref.table_name);
        END IF;
        IF table_ref.schema_name IN ('core', 'finance', 'health') OR table_ref.table_name = 'purge_requests' THEN
            EXECUTE format('CREATE CONSTRAINT TRIGGER scope_owners AFTER INSERT OR UPDATE OR DELETE ON %I.%I '
                           'DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION private.check_scope_owners()',
                           table_ref.schema_name, table_ref.table_name);
        END IF;
    END LOOP;
END;
$$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA private FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
