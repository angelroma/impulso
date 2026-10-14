# Spec Delta

## RENAMED Requirements

- FROM: `### Requirement: Stateless MCP exposes only two strict account tools`
- TO: `### Requirement: Stateless MCP exposes only the supported strict tools`

## MODIFIED Requirements

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
