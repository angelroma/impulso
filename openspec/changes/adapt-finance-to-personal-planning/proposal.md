# Proposal

## Why

Impulso's implemented local expense path does not yet cover the user's existing monthly cash-flow workbook, which also tracks income, recurring commitments, debt, investment contributions, future plans, and net worth. Extend the working foundation before migration so planned amounts, borrowed money, transfers, and monthly aggregates are not mistaken for completed expenses or earned income.

## What Changes

- Preserve existing onboarding, Finance permissions, exact money, expense contracts, and retry receipts. Extend the current ledger with typed accounts, categories, income, transfers, controlled corrections, dated balances, and paginated reads.
- Add monthly budgets, recurring plans and their dated occurrences, with explicit links to actual payments. Keep planned and actual records separate.
- Add simple loan/card tracking, scheduled principal/interest/fee breakdowns, savings goals, dated asset valuations, and monthly cash-flow/net-worth reporting. Record accepted terms; do not invent interest schedules or initiate bank payments.
- Add a bounded, provenance-preserving workbook import preview and reviewed commit workflow. Preserve month-only precision, distinguish actual/planned/unknown rows, exclude backup duplicates, reconcile totals, and require accepted mappings before any financial import.
- Expand the authenticated MCP surface through strict related-operation contracts. Keep business logic in TypeScript Edge Functions and native database integrity/security in declarative SQL.
- Use additive local migrations and disposable verification fixtures. Remote rollout, editing the source workbook, and importing the user's real financial records are separate actions.

## Capabilities

### New Capabilities

- `finance-ledger`: Typed accounts, categories, exact income/transfers/corrections, dated balances, and authorized movement reads.
- `finance-planning`: Period budgets, recurring expectations, payment matching, and actual-versus-planned projections.
- `finance-debts`: Loan/card balances, accepted repayment terms, due amounts, and principal/interest/fee allocation.
- `finance-wealth`: Savings goals and dated noncash asset valuations without double-counting ledger assets.
- `finance-reporting`: Consistent cash flow, earned income, expenses, projections, and dated net worth with completeness disclosure.
- `finance-imports`: Reviewed source mappings, reconciliation, monthly precision, provenance, and safe import retries.

### Modified Capabilities

- `database-model`: Extend Finance structure and least-privilege grants while preserving the six-schema boundary and ban on custom SQL routines.
- `mcp-authentication`: Extend the supported strict Finance tools and transactional checks without weakening OAuth or changing account setup.
- `finance-expenses`: Preserve the legacy expense API while replacing its temporary exclusion of the newly supported Finance operations. This capability currently exists in the completed predecessor delta and must be synchronized before this change is applied.

## Impact

Target `apps/supabase/schemas`, CLI-created forward migrations, TypeScript shared services/contracts, MCP/runtime wiring, SQL/unit/integration tests, and current OpenSpec guides/catalogue. No independent backend or new UI is required. The dependency is `add-conversational-expense-recording` (15/15 implemented locally, not yet synchronized); apply must synchronize that reviewed baseline first without automatically archiving it. Existing local Finance data and all historical migrations must survive; hosted Finance support remains unclaimed until separate rollout verification.
