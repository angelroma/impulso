# Proposal

## Why

Impulso can authenticate a user and create their personal workspace, but cannot yet fulfill a request such as recording a hamburger purchase. The Finance tables already exist; the missing piece is a permission-checked conversational workflow that resolves the required details and writes the expense reliably.

## What Changes

- Add `get_finance_context`, `create_book`, `create_account`, and `record_expense` to the existing MCP endpoint, preserving the exact `get_session` and `onboard` contracts.
- Reuse authorized books and accounts, ask only for missing or ambiguous details, and offer simple English setup names when needed. Confirm proposed setup values, including currency and opening balance, before creating resources. Never infer a currency from language, location, or the word "pesos" alone.
- Record expense-only ledger entries using exact decimal strings, concrete dates, explicit self/shared attribution, independent book permissions, and current session checks. Preserve user-provided names and descriptions.
- Commit each mutation, successful audit event, and idempotency receipt atomically. Make retries safe, recheck current access during recovery, and accurately report partial setup if separate accepted actions do not all succeed.
- Extend only the limited backend privileges required by these services through the complete declarative SQL tree and a CLI-created reviewed migration. Keep the 23 tables, ordinary-client denial, and prohibition on custom SQL functions, procedures, and application triggers.
- Add focused validation, permission, protocol, transaction, concurrency, and conversational acceptance coverage, and update current documentation when implementation is complete.

## Capabilities

### New Capabilities

- `finance-expenses`: Authorized Finance context, book/account creation, and conversational expense recording with exact values, truthful outcomes, audit, and safe retries.

### Modified Capabilities

- `mcp-authentication`: Expand the strict MCP tool surface from two to six tools and apply existing active-session/consent checks inside Finance transactions.
- `database-model`: Permit narrow Finance backend grants and document the implemented TypeScript financial validation and creation responsibilities without claiming database-trigger enforcement.

## Impact

Implementation will extend `apps/supabase/functions/impulso-api` and its shared TypeScript services/tests, update `apps/supabase/schemas/access.sql`, add a reviewed forward migration, and extend existing pgTAP/integration assertions. A versioned current ISO 4217 currency/minor-unit snapshot will be packaged with the code; runtime currency lookup needs no external request or floating-point dependency.

No new application tables, OAuth scopes, separate web UI, MCP server, or independent backend are required. Income, transfers, corrections, balances/reporting, managed-person creation/resolution beyond the verified self, sharing, Health, budgets, files, and purge execution are excluded. This proposal changes planning files only; applying migrations, deploying remotely, refreshing the connected plugin, and writing real user expenses are subsequent actions.
