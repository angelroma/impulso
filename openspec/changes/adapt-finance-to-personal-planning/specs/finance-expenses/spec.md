# Spec Delta

## MODIFIED Requirements

### Requirement: Finance tools use strict explicit resource contracts

The existing `get_finance_context`, `create_book`, `create_account`, and `record_expense` contracts SHALL remain closed and compatible. Every Finance call SHALL require explicit `workspace_id` and applicable resource scope. New capabilities SHALL use their own closed contracts without credentials, SQL, caller-selected actors, or arbitrary records. Existing `get_session` and `onboard` contracts SHALL remain unchanged.

#### Scenario: The client supplies an unexpected field

- **WHEN** one of the four existing Finance calls contains `actor_user_id`, `kind`, a token, SQL, an unsupported field, or a malformed resource identifier
- **THEN** the request is rejected without executing a Finance mutation
- **AND** the connected identity remains the only source of the actor

#### Scenario: A connected client chooses its initial workspace

- **WHEN** `get_session` reports complete onboarding with an authorized initial workspace
- **THEN** the client can use that workspace identifier in subsequent Finance calls
- **AND** Finance inputs do not require changes to the existing account-tool shapes

#### Scenario: A new financial operation is requested

- **WHEN** a client records income, transfers funds in its ledger, configures categories, or manages a supported plan
- **THEN** it uses that operation's separately advertised and validated contract
- **AND** it does not add unsupported fields to the existing expense or context input/output shapes

### Requirement: Errors and unsupported requests preserve the narrow expense boundary

Finance failures SHALL use controlled English errors without SQL or unauthorized details. `record_expense` SHALL remain expense-only. Income, transfers, corrections, reports, planning, debts, wealth, and imports SHALL use their supported separate contracts. New managed people, sharing, files, Health, bank execution, currency conversion, and purge execution SHALL remain unsupported rather than approximated through expense tools.

#### Scenario: A caller requests a broader financial action

- **WHEN** a user asks to transfer money, record income, correct a committed expense, manage another person, or use another operation beyond `record_expense`
- **THEN** the assistant chooses a separately supported contract after resolving its required values, or explains that the operation remains unsupported
- **AND** it does not create an expense as a substitute or claim an unsupported operation succeeded

#### Scenario: A failed call exposes only a controlled error

- **WHEN** validation, access, scope, receipt conflict, or an unexpected backend failure prevents an action
- **THEN** the tool returns a controlled failure without raw database messages, connection details, or credentials
- **AND** the client does not interpret the failure as permission to repeat the action with a new identifier
