<!-- nx configuration start-->
<!-- Leave the start & end comments to automatically receive updates. -->

# General Guidelines for working with Nx

- For navigating/exploring the workspace, invoke the `nx-workspace` skill first - it has patterns for querying projects, targets, and dependencies
- When running tasks (for example build, lint, test, e2e, etc.), always prefer running the task through `nx` (i.e. `nx run`, `nx run-many`, `nx affected`) instead of using the underlying tooling directly
- Prefix nx commands with the workspace's package manager (e.g., `pnpm nx build`, `npm exec nx test`) - avoids using globally installed CLI
- You have access to the Nx MCP server and its tools, use them to help the user
- For Nx plugin best practices, check `node_modules/@nx/<plugin>/PLUGIN.md`. Not all plugins have this file - proceed without it if unavailable.
- NEVER guess CLI flags - always check nx_docs or `--help` first when unsure

## Scaffolding & Generators

- For scaffolding tasks (creating apps, libs, project structure, setup), ALWAYS invoke the `nx-generate` skill FIRST before exploring or calling MCP tools

## When to use nx_docs

- USE for: advanced config options, unfamiliar flags, migration guides, plugin configuration, edge cases
- DON'T USE for: basic generator syntax (`nx g @nx/react:app`), standard commands, things you already know
- The `nx-generate` skill handles generator discovery internally - don't call nx_docs just to look up generator syntax

<!-- nx configuration end-->

## Implementation language

All code and implementation artifacts created for Impulso must be written in English. This includes source code, identifiers, schemas, tables, columns, views, functions, procedures, triggers, policies, constraints, indexes, migrations, storage buckets, API endpoints, tool names, roles, enum and state values, configuration, file and folder names, comments, docstrings, tests, logs, error codes, technical documentation, interface text and system-generated messages.

Use English snake_case for PostgreSQL identifiers and enum/state values. Follow the framework's naming conventions for code while keeping all names in English. Keep the brand names Impulso and @Impulso unchanged.

User-provided names, aliases, descriptions, notes and documents must retain their original language and content. This rule does not require translating user data. System-generated defaults must be in English, including the initial self alias "me".

## Database responsibilities

Keep application business logic and MCP tools in TypeScript Supabase Edge Functions. Do not create custom PostgreSQL functions, procedures or application triggers, including custom SQL test helpers. The declarative database model contains tables, native constraints, indexes, RLS and privileges. Preserve Supabase-managed Auth and Storage objects and PostgreSQL built-ins.

Use the complete declarative tree in `apps/supabase/schemas` as the desired schema and keep reviewed chronological changes in `apps/supabase/migrations`. Historical migration definitions may include removed objects; do not restore those objects in the current model. Tests may call pgTAP's built-in assertions without defining custom functions.

## Documentation ownership

Keep project technical documentation in `openspec`, using `openspec/README.md` as the index. Use native `specs` for current capability requirements and `changes` for proposed work and archived history. Use the project-specific `guides` directory for operating procedures and `reference` for supporting sources and original design material. Do not recreate a root `docs` directory. Keep the root README as a short entry point and AGENTS.md as repository instructions.

Distinguish implemented behavior from planned operations and dated verification observations. Preserve original user-provided documents and archived change records; explain their provenance and superseded paths in current indexes instead of rewriting historical evidence. Keep live document links current when relocating files. SQL and runtime source remain canonical implementation evidence; documentation does not replace the declarative tree or migration history.
