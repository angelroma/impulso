# mcp-authentication Specification

## Purpose

Describe Impulso's authenticated Edge Function boundary for account setup and the local Finance context, book/account creation, and expense tools. The active Finance change tracks the expanded requirements until spec synchronization; hosted deployment is verified separately. Broader Finance operations, Health, sharing, files, and arbitrary SQL remain outside this surface. Setup follows the separate [conversational onboarding specification](../conversational-onboarding/spec.md).

## Requirements

### Requirement: Public discovery identifies configured authorities

The API SHALL serve public `GET /health` liveness and configured protected-resource metadata without requiring a user token. Metadata SHALL identify the canonical MCP resource and Auth issuer, support header bearer tokens, and advertise `openid`, `email`, `profile`, and `offline_access`. Request or forwarding headers MUST NOT choose those authorities. Authentication challenges SHALL link to this metadata.

#### Scenario: An unauthenticated client discovers Impulso

- **WHEN** a client loads protected-resource metadata or calls MCP without a bearer token
- **THEN** it receives the configured metadata or an authentication challenge linking that metadata
- **AND** neither response exposes credentials or accepts a caller-selected issuer

### Requirement: HTTP requests respect explicit routing and browser boundaries

The API SHALL use an exact configured browser-origin allowlist without wildcard or credentialed CORS. It SHALL validate preflight methods and headers, reject unsupported routes, methods, and query parameters, and bound JSON/tool bodies to 32 KiB. Responses SHALL use no-store caching and controlled English errors without raw SQL or credentials. Unexpected input fields SHALL be rejected.

#### Scenario: An untrusted origin or request shape is supplied

- **WHEN** a caller supplies an unlisted browser origin, an invalid preflight, a URL token, unknown input fields, or an oversized body
- **THEN** the request is rejected before the application operation executes
- **AND** failures do not expose implementation secrets

### Requirement: Verified user credentials establish the actor

Protected requests SHALL require a bearer user JWT verified by Supabase Auth before trusting its decoded claims. The backend SHALL validate the configured issuer, authenticated audience and role, matching user subject, session identifier, expiry, and optional not-before claim. Anonymous accounts SHALL be rejected. User-editable metadata or caller-supplied actor identifiers MUST NOT establish identity or authorization.

#### Scenario: A token is forged, expired, or belongs to a different subject

- **WHEN** Auth rejects a token or its validated claims fail the backend checks
- **THEN** the request receives an authentication failure
- **AND** no application write runs using the claimed actor

### Requirement: Direct Google sign-in and delegated MCP grants remain distinct

Direct onboarding SHALL require a confirmed, server-verified Google identity and signed social OAuth method. MCP SHALL instead require a signed OAuth-server session, a client identifier, `openid`, and a confirmed Google-linked account. Delegated clients SHALL use MCP rather than direct session/onboarding routes. Identity scopes MUST NOT be treated as Finance or Health resource permissions.

#### Scenario: A browser session is used as an MCP grant

- **WHEN** a direct Google browser session calls MCP without a delegated client grant
- **THEN** MCP rejects it and advertises OAuth discovery

#### Scenario: Delegated authorization is incomplete

- **WHEN** a delegated request lacks `openid` or a verified Google-linked account
- **THEN** the backend rejects the request
- **AND** a client grant cannot bypass this boundary through `GET /session` or `POST /onboard`

### Requirement: Current session and consent state are checked again

The backend SHALL verify that the session exists, belongs to the verified user, and has not reached its end time. Delegated requests SHALL additionally match a nondeleted OAuth client, the session's complete scope set, and unrevoked consent covering every token scope. These checks SHALL run per protected request and again inside account-status, onboarding, Finance context, and Finance mutation transactions.

#### Scenario: A previously issued token loses its session or consent

- **WHEN** a session is removed or expired, its client is deleted, consent is revoked, or scope state no longer matches
- **THEN** reuse of the otherwise unexpired token is rejected by the active-state checks

#### Scenario: Financial work uses previously discovered context

- **WHEN** a Finance operation starts after the client obtained authorized book or account context
- **THEN** the transaction rechecks current session and consent state before returning scoped data or committing a mutation
- **AND** cached discovery cannot override a revoked connection

### Requirement: Stateless MCP exposes only the supported strict tools

The API SHALL use stateless Streamable HTTP with a separate verified identity and server instance for each request. Its only tools SHALL be `get_session`, `onboard`, `get_finance_context`, `create_book`, `create_account`, and `record_expense`, each with closed inputs. None SHALL accept tokens, passwords, SQL, actor IDs, raw location context, or arbitrary records. OAuth registration, authorization-code exchange, and refresh SHALL remain Supabase Auth responsibilities.

#### Scenario: A connected client lists tools

- **WHEN** an authorized client initializes MCP and lists available tools
- **THEN** it receives the two unchanged account tools, the four Finance tools, and the current conversational guidance
- **AND** no Health, income, transfer, correction, arbitrary SQL, balance-reporting, or file operation is advertised

#### Scenario: Different callers use MCP concurrently

- **WHEN** simultaneous requests belong to different verified users
- **THEN** each tool invocation uses its request's verified identity
- **AND** transport state does not share one caller's identity with another

#### Scenario: Existing account clients keep their contracts

- **WHEN** an existing client invokes `get_session` or `onboard` after Finance tools are added
- **THEN** the existing input and output shapes, Google identity checks, onboarding confirmation, and retry semantics remain unchanged
- **AND** Finance context and records use their own strictly validated tool contracts

### Requirement: Session inspection reports setup state without creating resources

`get_session` SHALL accept only an empty object and return the verified user ID, email only when granted the `email` scope, and onboarding status `required`, `complete`, or `unavailable`. A complete state SHALL include the authorized workspace/person identifiers. Inspection MUST NOT create resources or invent a display name, location, or time-zone hint.

#### Scenario: A new user checks their setup

- **WHEN** a valid account has no initial workspace or prior onboarding receipt
- **THEN** `get_session` reports `required` without writing account resources
- **AND** the client follows the separate [guided onboarding requirements](../conversational-onboarding/spec.md)

#### Scenario: Existing resources are inaccessible or retired

- **WHEN** the initial scope is archived, lacks current membership/person access, is purging, or previous receipts prevent recreation
- **THEN** the status is `unavailable` rather than an invitation to create replacement resources

### Requirement: Onboarding validates the existing four-field contract

`onboard` and the direct onboarding handler SHALL accept exactly `request_id`, `display_name`, `workspace_name`, and `timezone`. The backend SHALL require a UUID, trim names without translating user data, enforce nonempty well-formed text of at most 200 characters, and normalize a recognized IANA zone. The transaction SHALL also require that zone to exist in PostgreSQL's zone catalogue.

#### Scenario: Reviewed values are submitted

- **WHEN** an accepted review supplies valid names and a recognized named zone
- **THEN** the backend preserves the normalized names and canonical zone
- **AND** caller-supplied user IDs, city labels, fixed offsets, invalid UUIDs, or malformed text are rejected

### Requirement: Initial setup commits atomically and retries safely

Onboarding SHALL serialize request and account creation within one transaction, recheck access, and atomically create the workspace, active owner membership, self person/link, basic owner ACL, alias `me`, audit event, and receipt. Receipts SHALL bind actor, operation, normalized payload hash, and result IDs. Identical retries SHALL recover the authorized result; conflicting keys or retired scopes SHALL fail without partial writes.

#### Scenario: A request fails after writing initial records

- **WHEN** onboarding encounters a transaction failure before commit
- **THEN** resources, audit event, and receipt all roll back
- **AND** no partially configured account is returned as complete

#### Scenario: An accepted action is retried or races with another request

- **WHEN** matching retries or concurrent request keys target the same account
- **THEN** at most one initial workspace is created
- **AND** successful recovery returns `already_processed` with the currently authorized IDs
- **AND** changed payload under the same key or another actor's receipt is rejected

#### Scenario: Recovery finds an existing workspace

- **WHEN** an already configured user submits a fresh valid request key
- **THEN** the service recovers the existing authorized scope without renaming it or changing its time zone
- **AND** revoked, archived, purging, and retired resources are not silently restored

### Requirement: Backend transport and audience limits remain explicit

The backend SHALL connect using its separately provisioned limited PostgreSQL role, with verified TLS outside recognized local hosts, prepared statements disabled, and bounded transaction timeouts. The current token boundary SHALL validate the `authenticated` audience for one Impulso resource per issuer. It MUST NOT claim resource-URL audiences or multi-resource isolation that the current integration does not enforce.

#### Scenario: A remote database connection is created

- **WHEN** the database hostname is not a recognized local development host
- **THEN** the client requires certificate verification using the configured trusted CA
- **AND** URL parameters do not disable the explicit TLS settings

## Implementation evidence

- [API handler](../../../apps/supabase/functions/impulso-api/handler.ts), [MCP contracts](../../../apps/supabase/functions/impulso-api/mcp.ts), and [runtime configuration](../../../apps/supabase/functions/impulso-api/runtime.ts).
- [Identity validation](../../../apps/supabase/functions/_shared/auth.ts), [session/grant checks](../../../apps/supabase/functions/_shared/database.ts), and [onboarding transaction](../../../apps/supabase/functions/_shared/onboarding.ts).
- [MCP protocol assertions](../../../apps/supabase/functions/impulso-api/mcp_test.ts), [onboarding integration](../../../apps/supabase/functions/tests/onboarding_integration_test.ts), and [OAuth integration](../../../apps/supabase/functions/tests/oauth_mcp_integration_test.ts).
- [Database boundary](../database-model/spec.md) and [local development guide](../../guides/local-development.md).
