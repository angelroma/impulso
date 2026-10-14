# Impulso

Impulso connects AI clients to a modular Supabase backend for personal workspaces, finance, and health. Local source and the hosted version 3 API provide Google sign-in, OAuth, conversational onboarding, financial setup, an exact ledger, budgets and commitments, debt and wealth tracking, reports, and reviewed historical imports through 20 MCP tools. The remote database has ten reviewed migrations and 40 application tables; [rollout verification](openspec/guides/remote-deployment.md#finance-rollout-verification) records refreshed plugin discovery and the authenticated session check. No salary, financial records or live workbook imports were created during deployment. Health operations remain pending.

Start with the [documentation index](openspec/README.md). All project technical documentation lives in `openspec`:

- [Current specifications](openspec/README.md#current-specifications)
- [Operating guides](openspec/README.md#operating-guides)
- [Database catalogue and original references](openspec/reference/README.md)
- [Active changes and archived history](openspec/changes)

The canonical database definitions and migration history remain in [apps/supabase](apps/supabase). Business logic and MCP tools use TypeScript Supabase Edge Functions. The current database model has no custom SQL functions, procedures, or application triggers. Implementation artifacts use English; user-provided content keeps its original language.

For development, follow the [local development guide](openspec/guides/local-development.md) and [database workflow](openspec/guides/database-workflow.md). For the hosted connection, use the [remote deployment guide](openspec/guides/remote-deployment.md). Repository instructions are in [AGENTS.md](AGENTS.md).
