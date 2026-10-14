# Spec Delta

## MODIFIED Requirements

### Requirement: Current session and consent state are checked again

The backend SHALL validate the live user session, its subject and end time. Delegated requests SHALL match a nondeleted client, the session's complete scope set, and unrevoked consent covering all token scopes. Checks SHALL run per protected request and again inside account and every Finance read/write transaction, including reports, planning, debt, wealth, and imports.

#### Scenario: A previously issued token loses its session or consent

- **WHEN** a session is removed or expired, its client is deleted, consent is revoked, or scope state no longer matches
- **THEN** reuse of the otherwise unexpired token is rejected by the active-state checks

#### Scenario: Financial work uses previously discovered context

- **WHEN** a Finance operation starts after the client obtained authorized book or account context
- **THEN** the transaction rechecks current session and consent before returning scoped data or committing a mutation
- **AND** cached discovery cannot override a revoked connection

#### Scenario: A reviewed import or report waits for a lock

- **WHEN** consent or applicable book access is revoked while a report, allocation, or import waits
- **THEN** the request fails after its transactional checks without returning protected data or committing financial records
- **AND** a reviewed digest is not authorization to bypass the current session

### Requirement: Stateless MCP exposes only the supported strict tools

The API SHALL use stateless Streamable HTTP with a separate verified identity and server per request. Only the supported manifest's closed tools SHALL be advertised; the six existing contracts SHALL remain compatible. Tools MUST NOT accept credentials, SQL, actor IDs, arbitrary CRUD, raw location, or backend fetch URLs. Supabase Auth SHALL retain OAuth registration, exchange, and refresh responsibilities.

#### Scenario: A connected client lists tools

- **WHEN** an authorized client initializes the fully implemented local MCP surface
- **THEN** it receives the six existing tools and the supported ledger, planning, debt, wealth, reporting, and import tools
- **AND** no Health, sharing, file, arbitrary SQL, bank-execution, or cross-currency operation is advertised

#### Scenario: Different callers use MCP concurrently

- **WHEN** simultaneous requests belong to different verified users
- **THEN** each invocation uses its request's verified identity
- **AND** transport state does not share one caller's identity with another

#### Scenario: Existing account clients keep their contracts

- **WHEN** an existing client invokes `get_session` or `onboard` after more Finance tools are added
- **THEN** its input/output shapes, Google checks, setup confirmation, and retries remain unchanged
- **AND** Finance tools retain their own validated contracts

## ADDED Requirements

### Requirement: The supported Finance manifest has explicit bounded families

The completed local manifest SHALL expose only the existing six tools and the fourteen named extensions below. Related-operation families SHALL have closed action-specific inputs and outputs, explicit limits, and correct read-only/destructive annotations. No generic table selector, arbitrary property bag, or unbounded action list SHALL be accepted.

#### Scenario: Discover the complete supported tool set

- **WHEN** an authorized client lists tools after this change is fully implemented
- **THEN** the exact names are `get_session`, `onboard`, `get_finance_context`, `create_book`, `create_account`, `record_expense`, `configure_account`, `manage_category`, `record_transaction`, `correct_transaction`, `list_transactions`, `get_finance_report`, `manage_budget`, `manage_plan`, `manage_debt`, `manage_goal`, `manage_asset`, `preview_finance_import`, `commit_finance_import`, and `get_finance_import`
- **AND** all tools advertise closed result contracts and controlled errors

#### Scenario: A grouped operation has an unsupported field or action

- **WHEN** a client supplies an unknown action, nested unknown field, SQL text, oversized page, group above ten entries, or import batch above its limit
- **THEN** strict validation rejects it before invoking a service
- **AND** a read-only report or listing does not create resources

### Requirement: Conversation guidance distinguishes intent and financial evidence

Guidance SHALL ask only unresolved values, reuse accepted context, preserve user text, and distinguish actual movement, plan, debt principal, interest, transfer, and valuation. It SHALL obtain acceptance of proposed assumptions, never infer currency from language, and preserve identifiers and dates on retries. It MUST NOT present a ledger entry as an executed payment or a preview as an import.

#### Scenario: A request could mean a plan or a completed payment

- **WHEN** a user asks about a future bill or says they paid a loan without enough component or account information
- **THEN** the assistant asks the focused missing question and explains proposed classification in ordinary language
- **AND** it does not turn a forecast or an entire installment into an expense automatically

#### Scenario: A complete request or cancellation is provided

- **WHEN** all required values are explicit or accepted and the user asks for a supported action
- **THEN** it submits without redundant confirmation; cancellation before submission performs no write
- **AND** separate committed setup or import batches keep their actual reported outcomes

#### Scenario: The hosted plugin has not been rolled out

- **WHEN** only local implementation and tests are complete
- **THEN** guidance and documentation distinguish that state from the hosted plugin's verified tool set
- **AND** no local synthetic test is presented as a successful remote financial operation
