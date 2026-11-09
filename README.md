# Impulso

Impulso is a personal finance backend that AI clients use through MCP. It runs on Supabase:
Google sign-in and OAuth for the connector, and TypeScript Edge Functions for all business logic.

## Model

Six tables in the `finance` schema, created by one baseline migration:

- `workspaces`: independent books (for example "Yo" and "Mamá"); one is the default.
- `accounts`: can be renamed and moved between workspaces together with their transactions.
- `categories`, `payees`, `projects`: per workspace. Payees can carry a default category;
  projects track budget, spent and remaining.
- `transactions`: one row per income, expense or transfer. Rows are editable, and removal is a
  restorable soft delete.

The database has no custom SQL functions, procedures or application triggers. The canonical
schema is [apps/supabase/schemas](apps/supabase/schemas), and the migration history is
[apps/supabase/migrations](apps/supabase/migrations).

## MCP tools

`get_context`, `manage_workspace`, `manage_account`, `manage_category`, `manage_payee`,
`manage_project`, `record_transaction`, `update_transaction`, `list_transactions` and
`get_summary`.

## Development

Run tasks through Nx:

```bash
npx nx run supabase:start
npx nx run supabase:serve
npx nx run supabase:test
npx nx run supabase:test-db
npx nx run supabase:test-integration
npx nx run supabase:verify-schema
```

Feature work follows Spec Kit. Principles are in the
[constitution](.specify/memory/constitution.md), and feature specs, plans and tasks live in
`specs/<feature>/`. Repository instructions are in [AGENTS.md](AGENTS.md).

Implementation artifacts use English; user-provided content keeps its original language.
