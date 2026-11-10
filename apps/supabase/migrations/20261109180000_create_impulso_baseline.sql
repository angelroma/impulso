-- Impulso baseline: five reference tables (currencies, account types, transaction and category
-- kinds, project statuses) and workspaces, accounts, categories, payees, projects and transactions.
-- Replaces the earlier migration history after a full database reset.

-- Roles survive some reset paths; this anonymous block only creates infrastructure when absent.
DO $infrastructure$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'impulso_backend') THEN
        CREATE ROLE impulso_backend
            NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION BYPASSRLS;
    END IF;
END;
$infrastructure$;


CREATE SCHEMA IF NOT EXISTS finance;

CREATE SCHEMA IF NOT EXISTS api;

CREATE SCHEMA IF NOT EXISTS private;

CREATE VIEW private.auth_users WITH (security_invoker = false) AS
SELECT id, updated_at FROM auth.users;

ALTER VIEW private.auth_users OWNER TO postgres;

REVOKE ALL ON TABLE private.auth_users FROM PUBLIC, anon, authenticated, service_role;

CREATE VIEW private.auth_sessions WITH (security_invoker = false) AS
SELECT id, user_id, not_after, updated_at, oauth_client_id, scopes FROM auth.sessions;

ALTER VIEW private.auth_sessions OWNER TO postgres;

REVOKE ALL ON TABLE private.auth_sessions FROM PUBLIC, anon, authenticated, service_role;

CREATE VIEW private.oauth_clients WITH (security_invoker = false) AS
SELECT id, deleted_at FROM auth.oauth_clients;

ALTER VIEW private.oauth_clients OWNER TO postgres;

REVOKE ALL ON TABLE private.oauth_clients FROM PUBLIC, anon, authenticated, service_role;

CREATE VIEW private.oauth_consents WITH (security_invoker = false) AS
SELECT user_id, client_id, scopes, revoked_at FROM auth.oauth_consents;

ALTER VIEW private.oauth_consents OWNER TO postgres;

REVOKE ALL ON TABLE private.oauth_consents FROM PUBLIC, anon, authenticated, service_role;

-- Reference data: the ISO 4217 currencies a workspace or account can use. Rows are seeded by the
-- baseline migration; supporting another currency is one INSERT, not a schema change.

CREATE TABLE finance.currencies (
    code text PRIMARY KEY CHECK (code ~ '^[A-Z]{3}$'),
    name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 100)
);

ALTER TABLE finance.currencies ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE finance.currencies FROM PUBLIC, anon, authenticated, service_role;

-- Reference data: what an account is (cash, checking, savings, credit_card, loan, investment).
-- is_liability marks types whose balance is money owed, recorded as a negative amount.

CREATE TABLE finance.account_types (
    code text PRIMARY KEY CHECK (code ~ '^[a-z][a-z_]{0,29}$'),
    is_liability boolean NOT NULL DEFAULT false
);

ALTER TABLE finance.account_types ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE finance.account_types FROM PUBLIC, anon, authenticated, service_role;

-- Reference data: the direction of a transaction (income, expense, transfer).

CREATE TABLE finance.transaction_kinds (
    code text PRIMARY KEY CHECK (code ~ '^[a-z][a-z_]{0,29}$')
);

ALTER TABLE finance.transaction_kinds ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE finance.transaction_kinds FROM PUBLIC, anon, authenticated, service_role;

-- Reference data: the transaction kinds a category can label (income, expense; never transfer).

CREATE TABLE finance.category_kinds (
    code text PRIMARY KEY REFERENCES finance.transaction_kinds(code) ON DELETE RESTRICT
);

ALTER TABLE finance.category_kinds ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE finance.category_kinds FROM PUBLIC, anon, authenticated, service_role;

-- Reference data: where a project stands (active, closed).

CREATE TABLE finance.project_statuses (
    code text PRIMARY KEY CHECK (code ~ '^[a-z][a-z_]{0,29}$')
);

ALTER TABLE finance.project_statuses ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE finance.project_statuses FROM PUBLIC, anon, authenticated, service_role;

-- Reference data. Codes are the stored values, so rows stay readable without joins.

INSERT INTO finance.currencies (code, name) VALUES
    ('MXN', 'Mexican peso'),
    ('USD', 'US dollar'),
    ('CAD', 'Canadian dollar'),
    ('EUR', 'Euro'),
    ('GBP', 'Pound sterling'),
    ('CHF', 'Swiss franc'),
    ('JPY', 'Japanese yen'),
    ('CNY', 'Chinese yuan'),
    ('HKD', 'Hong Kong dollar'),
    ('SGD', 'Singapore dollar'),
    ('KRW', 'South Korean won'),
    ('INR', 'Indian rupee'),
    ('AUD', 'Australian dollar'),
    ('NZD', 'New Zealand dollar'),
    ('SEK', 'Swedish krona'),
    ('NOK', 'Norwegian krone'),
    ('DKK', 'Danish krone'),
    ('PLN', 'Polish zloty'),
    ('CZK', 'Czech koruna'),
    ('TRY', 'Turkish lira'),
    ('ILS', 'Israeli new shekel'),
    ('AED', 'UAE dirham'),
    ('SAR', 'Saudi riyal'),
    ('ZAR', 'South African rand'),
    ('BRL', 'Brazilian real'),
    ('ARS', 'Argentine peso'),
    ('CLP', 'Chilean peso'),
    ('COP', 'Colombian peso'),
    ('PEN', 'Peruvian sol'),
    ('UYU', 'Uruguayan peso'),
    ('GTQ', 'Guatemalan quetzal'),
    ('CRC', 'Costa Rican colon'),
    ('DOP', 'Dominican peso');

INSERT INTO finance.account_types (code, is_liability) VALUES
    ('cash', false),
    ('checking', false),
    ('savings', false),
    ('investment', false),
    ('credit_card', true),
    ('loan', true);

INSERT INTO finance.transaction_kinds (code) VALUES ('income'), ('expense'), ('transfer');

INSERT INTO finance.category_kinds (code) VALUES ('income'), ('expense');

INSERT INTO finance.project_statuses (code) VALUES ('active'), ('closed');

-- Independent containers owned by one user, for example "Yo", "Mamá" or "Negocio".

CREATE TABLE finance.workspaces (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 100),
    currency text NOT NULL REFERENCES finance.currencies(code) ON DELETE RESTRICT,
    timezone text NOT NULL CHECK (char_length(timezone) BETWEEN 1 AND 64),
    is_default boolean NOT NULL DEFAULT false,
    archived_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (NOT (is_default AND archived_at IS NOT NULL))
);

CREATE UNIQUE INDEX workspaces_one_default_idx ON finance.workspaces (owner_user_id) WHERE is_default;

CREATE UNIQUE INDEX workspaces_active_name_idx ON finance.workspaces (owner_user_id, lower(name)) WHERE archived_at IS NULL;

ALTER TABLE finance.workspaces ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE finance.workspaces FROM PUBLIC, anon, authenticated, service_role;

-- Accounts can be renamed and moved to another workspace together with their transactions.

CREATE TABLE finance.accounts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES finance.workspaces(id) ON DELETE RESTRICT,
    name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 100),
    type text NOT NULL DEFAULT 'checking' REFERENCES finance.account_types(code) ON DELETE RESTRICT,
    currency text NOT NULL REFERENCES finance.currencies(code) ON DELETE RESTRICT,
    opening_balance numeric(14,2) NOT NULL DEFAULT 0,
    is_default boolean NOT NULL DEFAULT false,
    archived_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (workspace_id, id),
    CHECK (NOT (is_default AND archived_at IS NOT NULL))
);

CREATE UNIQUE INDEX accounts_one_default_idx ON finance.accounts (workspace_id) WHERE is_default;

CREATE UNIQUE INDEX accounts_active_name_idx ON finance.accounts (workspace_id, lower(name)) WHERE archived_at IS NULL;

ALTER TABLE finance.accounts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE finance.accounts FROM PUBLIC, anon, authenticated, service_role;

-- Income or expense labels. A category is general ("Suscripciones"); who was paid is a payee.
-- parent_id makes it a subcategory of a top-level category of the same kind ("Vivienda" > "Renta").

CREATE TABLE finance.categories (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES finance.workspaces(id) ON DELETE RESTRICT,
    name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 100),
    parent_id uuid,
    kind text NOT NULL REFERENCES finance.category_kinds(code) ON DELETE RESTRICT,
    archived_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (workspace_id, id),
    UNIQUE (workspace_id, id, kind),
    FOREIGN KEY (workspace_id, parent_id, kind) REFERENCES finance.categories(workspace_id, id, kind) ON DELETE RESTRICT,
    CHECK (parent_id IS NULL OR parent_id <> id)
);

CREATE INDEX categories_parent_idx ON finance.categories (workspace_id, parent_id) WHERE parent_id IS NOT NULL;

CREATE UNIQUE INDEX categories_active_name_idx ON finance.categories (workspace_id, kind, lower(name)) WHERE archived_at IS NULL;

ALTER TABLE finance.categories ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE finance.categories FROM PUBLIC, anon, authenticated, service_role;

-- Who was paid or who paid; the default category lets a known payee skip categorization questions.

CREATE TABLE finance.payees (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES finance.workspaces(id) ON DELETE RESTRICT,
    name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 100),
    default_category_id uuid,
    archived_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (workspace_id, id),
    FOREIGN KEY (workspace_id, default_category_id) REFERENCES finance.categories(workspace_id, id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE
);

CREATE UNIQUE INDEX payees_active_name_idx ON finance.payees (workspace_id, lower(name)) WHERE archived_at IS NULL;

CREATE INDEX payees_default_category_idx ON finance.payees (workspace_id, default_category_id);

ALTER TABLE finance.payees ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE finance.payees FROM PUBLIC, anon, authenticated, service_role;

-- Cross-category buckets such as "Viaje Japón"; spent and remaining are computed from transactions.

CREATE TABLE finance.projects (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES finance.workspaces(id) ON DELETE RESTRICT,
    name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 100),
    status text NOT NULL DEFAULT 'active' REFERENCES finance.project_statuses(code) ON DELETE RESTRICT,
    budget numeric(14,2) CHECK (budget IS NULL OR budget > 0),
    start_date date,
    end_date date,
    notes text CHECK (notes IS NULL OR char_length(notes) <= 2000),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (workspace_id, id),
    CHECK (start_date IS NULL OR end_date IS NULL OR end_date >= start_date)
);

CREATE UNIQUE INDEX projects_name_idx ON finance.projects (workspace_id, lower(name));

ALTER TABLE finance.projects ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE finance.projects FROM PUBLIC, anon, authenticated, service_role;

-- One row per income, expense or transfer. Rows are editable; deleted_at is a restorable soft delete.
-- Composite keys keep every reference inside the row's workspace. They are deferrable so an
-- account and its transactions can move to another workspace inside one transaction.
-- The category key includes kind, so an expense can only carry an expense category.

CREATE TABLE finance.transactions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES finance.workspaces(id) ON DELETE RESTRICT,
    account_id uuid NOT NULL,
    to_account_id uuid,
    kind text NOT NULL REFERENCES finance.transaction_kinds(code) ON DELETE RESTRICT,
    amount numeric(14,2) NOT NULL CHECK (amount > 0),
    occurred_on date NOT NULL,
    payee_id uuid,
    category_id uuid,
    project_id uuid,
    notes text CHECK (notes IS NULL OR char_length(notes) <= 2000),
    request_id uuid NOT NULL UNIQUE,
    deleted_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (workspace_id, account_id) REFERENCES finance.accounts(workspace_id, id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE,
    FOREIGN KEY (workspace_id, to_account_id) REFERENCES finance.accounts(workspace_id, id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE,
    FOREIGN KEY (workspace_id, payee_id) REFERENCES finance.payees(workspace_id, id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE,
    FOREIGN KEY (workspace_id, category_id, kind) REFERENCES finance.categories(workspace_id, id, kind) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE,
    FOREIGN KEY (workspace_id, project_id) REFERENCES finance.projects(workspace_id, id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE,
    CHECK ((kind = 'transfer') = (to_account_id IS NOT NULL)),
    CHECK (to_account_id IS NULL OR to_account_id <> account_id),
    CHECK (kind <> 'transfer' OR category_id IS NULL)
);

CREATE INDEX transactions_workspace_date_idx ON finance.transactions (workspace_id, occurred_on DESC, id);

CREATE INDEX transactions_account_idx ON finance.transactions (workspace_id, account_id);

CREATE INDEX transactions_to_account_idx ON finance.transactions (workspace_id, to_account_id) WHERE to_account_id IS NOT NULL;

CREATE INDEX transactions_payee_idx ON finance.transactions (workspace_id, payee_id) WHERE payee_id IS NOT NULL;

CREATE INDEX transactions_category_idx ON finance.transactions (workspace_id, category_id) WHERE category_id IS NOT NULL;

CREATE INDEX transactions_project_idx ON finance.transactions (workspace_id, project_id) WHERE project_id IS NOT NULL;

ALTER TABLE finance.transactions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE finance.transactions FROM PUBLIC, anon, authenticated, service_role;

-- Client access remains closed; Edge Functions authorize every application operation.

REVOKE ALL ON SCHEMA finance, api, private FROM PUBLIC, anon, authenticated, service_role;

GRANT USAGE ON SCHEMA api TO anon, authenticated, service_role;

REVOKE ALL ON ALL SEQUENCES IN SCHEMA finance, api, private FROM PUBLIC, anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA finance, api, private REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA finance, api, private REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA finance, api, private REVOKE ALL ON SEQUENCES FROM PUBLIC, anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA finance, api, private REVOKE ALL ON SEQUENCES FROM PUBLIC, anon, authenticated, service_role;

GRANT USAGE ON SCHEMA finance, private TO impulso_backend;

-- Records are editable; removal is a soft delete or archive, so the backend never receives DELETE.
GRANT SELECT, INSERT, UPDATE ON TABLE
    finance.workspaces,
    finance.accounts,
    finance.categories,
    finance.payees,
    finance.projects,
    finance.transactions
TO impulso_backend;

-- Reference data is fixed by migrations; the backend only reads it.
GRANT SELECT ON TABLE
    finance.currencies,
    finance.account_types,
    finance.transaction_kinds,
    finance.category_kinds,
    finance.project_statuses
TO impulso_backend;

-- Owner-checked projections expose only Auth identifiers and grant state; locks reach base rows.
GRANT SELECT (id), UPDATE (updated_at) ON TABLE private.auth_users TO impulso_backend;
GRANT SELECT (id, user_id, not_after, oauth_client_id, scopes), UPDATE (updated_at)
ON TABLE private.auth_sessions TO impulso_backend;
GRANT SELECT (id, deleted_at) ON TABLE private.oauth_clients TO impulso_backend;
GRANT SELECT (user_id, client_id, scopes, revoked_at)
ON TABLE private.oauth_consents TO impulso_backend;

-- Environment-specific login credentials are provisioned separately.
