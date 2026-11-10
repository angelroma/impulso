<!--
Sync Impact Report
- Version: 1.1.0 -> 1.2.0 (MINOR: language rule and Principle I scope materially changed)
- Modified principles: I. Minimal Model (any Google user, each with an isolated space, instead
  of a single user; category merging and cross-currency transfers added to rejected features)
- Modified sections: Technology and Language Constraints (default categories are seeded in
  Mexican Spanish)
- Added sections: none
- Removed sections: none
- Templates: plan-template.md, spec-template.md, tasks-template.md need no change
- Follow-ups: none. Source: user decisions recorded as Clarifications in specs 001-007.
-->

# Impulso Constitution

## Core Principles

### I. Minimal Model

Impulso is a personal ledger. Anyone may sign in with Google and gets their own isolated space;
the model MUST stay as small as one person's real needs.

- The schema contains only tables the user actively uses. Today that is six application
  tables (workspaces, accounts, categories, payees, projects and transactions) and five
  reference tables (currencies, account_types, transaction_kinds, category_kinds and
  project_statuses).
- Enumerated values (kinds, types, statuses, currency codes) MUST live in a reference table
  keyed by a text code and be enforced with foreign keys, not repeated `CHECK` lists.
  Reference rows are seeded by migrations and are read-only to the backend role. A reference
  table is added only when an application column needs it.
- A new table, column, MCP tool or tool action MUST trace to a requirement in a feature spec
  that names the user need it serves.
- Features the user has explicitly rejected MUST NOT be reintroduced unless the user asks for
  them again: recurring transactions, separate transfer rows or `transfer_id`, a cleared flag,
  tags, category budgets, merging categories, transfers between currencies, Google Sheets
  export, Health, people or sharing tables, and guided onboarding.
- When two designs meet the requirement, choose the one with fewer objects and fewer
  concepts.

Rationale: the previous 44-table model became too complex to track and was rebuilt from scratch
on 2026-11-09. Growth must be deliberate.

### II. Logic in Edge Functions, Not the Database

Business logic and MCP tools MUST live in TypeScript Supabase Edge Functions.

- The database MUST NOT contain custom PostgreSQL functions, procedures or application
  triggers, including custom SQL test helpers. Supabase-managed Auth and Storage objects and
  PostgreSQL built-ins are preserved.
- The declarative model holds only tables, native constraints, indexes, views, RLS and
  privileges.
- `apps/supabase/schemas` is the canonical desired schema. Every change to it MUST ship with a
  reviewed migration in `apps/supabase/migrations`, and the two MUST match.
- Historical migrations may define removed objects; those objects MUST NOT be restored to the
  current model.

Rationale: one language and one runtime for logic keeps behavior testable and reviewable, and
keeps the database a plain, inspectable store.

### III. Data Safety and Workspace Isolation

Financial records MUST be exact, recoverable and contained within their workspace.

- Money MUST use exact decimal types (`numeric`), never floating point, in SQL and in
  TypeScript calculations.
- Records are editable, but removal MUST be a soft delete or archive. The backend role MUST NOT
  hold `DELETE` privilege on application tables.
- Every application table MUST enable row-level security.
- Each workspace is independent. References between rows MUST stay inside one workspace,
  enforced with composite foreign keys rather than application checks alone.
- Write operations that create records MUST be idempotent through a client-supplied request
  identifier.

Rationale: this is the user's personal ledger. A lost, duplicated or cross-workspace record is a
correctness failure, not a cosmetic bug.

### IV. Concise MCP Interface

The MCP surface MUST be short and decisive.

- Server instructions and tool descriptions MUST stay brief; verbose, repeated guidance is a
  defect.
- Tools MUST prefer sensible defaults (the default workspace, the default account, a payee's
  default category) over asking the user.
- A clear request MUST be carried out without a confirmation review. When a required value is
  missing, the reply offers a short list of choices rather than an open question.
- Tool replies MUST be short summaries of what changed.
- OAuth, consent and connector plumbing MUST NOT change as a side effect of feature work.

Rationale: the user rejected the earlier long instructions that made the assistant ask, review
and explain everything.

### V. Verified Before Done

A change is complete only when its checks pass through Nx.

- Code changes MUST pass `check`, `lint` and `test` for the `supabase` project.
- Schema changes MUST also pass `test-db` (pgTAP, using built-in assertions only) and
  `verify-schema`.
- Changes to MCP tools, auth or request handling MUST also pass `test-integration`.
- New behavior MUST be covered by a test at the lowest level that can observe it: unit tests
  for TypeScript logic, pgTAP for constraints and privileges, integration tests for
  end-to-end tool flows.
- Results MUST be reported faithfully; a skipped or failing check is stated, not hidden.

Rationale: the rebuild was accepted on the strength of its pgTAP, unit and integration suites
and a schema/migration match. That bar stays.

## Technology and Language Constraints

- Workspace: Nx monorepo. Tasks run through Nx with the workspace package manager
  (`npx nx run supabase:<target>`), not the underlying tools directly.
- Backend: Supabase (PostgreSQL, Auth, Edge Functions on Deno with TypeScript). The Supabase CLI
  is pinned as a devDependency.
- All implementation artifacts MUST be in English: code, identifiers, schemas, tables, columns,
  enum and state values, tool names, configuration, file names, comments, tests, logs, error
  codes, technical documentation and system-generated messages.
- PostgreSQL identifiers and enum or state values use English `snake_case`. Code follows its
  framework's naming conventions in English.
- User-provided names, aliases, descriptions, notes and documents keep their original language
  and content. The default categories seeded into a new workspace are user-facing data and are
  in Mexican Spanish; other system-generated defaults are in English. The brand names Impulso
  and @Impulso are unchanged.

## Development Workflow

- Feature work follows Spec Kit: specify, then plan, then tasks, then implement. Use clarify,
  checklist and analyze when a spec is ambiguous or broad.
- Each plan MUST include a constitution check against Principles I–V. Any deviation MUST be
  recorded in the plan with its justification and the simpler alternative that was rejected.
- Documentation distinguishes implemented behavior from planned work. SQL and runtime source are
  the canonical evidence; documentation does not replace the declarative tree or migration
  history.
- Commands that change the hosted production project (`deploy`, `push-config`, applying remote
  migrations) MUST NOT run without the user's explicit approval for that change.
- Secrets MUST stay out of version control; `.env.local` and similar files are local only.

## Governance

This constitution supersedes other project practices where they conflict. AGENTS.md and
CLAUDE.md hold runtime guidance for agents and MUST stay consistent with it.

- Amendments are made through `/speckit-constitution`, record a Sync Impact Report, and take
  effect once the user approves them.
- Versioning follows semantic versioning. MAJOR: a principle is removed or redefined
  incompatibly. MINOR: a principle or section is added or materially expanded. PATCH:
  clarifications and wording.
- Every plan and every review MUST verify compliance with the Core Principles. Added complexity
  MUST be justified in writing.

**Version**: 1.2.0 | **Ratified**: 2026-11-09 | **Last Amended**: 2026-11-09
