# Impulso

Impulso connects AI clients to a modular Supabase backend for personal workspaces, finance, and health. Google sign-in, OAuth connection, session inspection, and conversational onboarding are implemented; Finance and Health application operations are still pending.

Start with the [documentation index](openspec/README.md). All project technical documentation lives in `openspec`:

- [Current specifications](openspec/README.md#current-specifications)
- [Operating guides](openspec/README.md#operating-guides)
- [Database catalogue and original references](openspec/reference/README.md)
- [Active changes and archived history](openspec/changes)

The canonical database definitions and migration history remain in [apps/supabase](apps/supabase). Business logic and MCP tools use TypeScript Supabase Edge Functions. The current database model has no custom SQL functions, procedures, or application triggers. Implementation artifacts use English; user-provided content keeps its original language.

For development, follow the [local development guide](openspec/guides/local-development.md) and [database workflow](openspec/guides/database-workflow.md). For the hosted connection, use the [remote deployment guide](openspec/guides/remote-deployment.md). Repository instructions are in [AGENTS.md](AGENTS.md).
