# Impulso

The architecture, data model and access rules are documented in [docs/data-model.md](docs/data-model.md) and the [editable specification](https://chatgpt.com/space/page_1f49a154ed3c8191abfe517551114a72).

## Local database

Supabase files are in `apps/supabase`. The migration history creates six application schemas and 23 tables on PostgreSQL 17, removes the original custom SQL functions and triggers, and adds the limited server role `impulso_backend`. The current declarative model contains tables, native constraints, indexes, RLS, privileges and four private Auth views, with no custom SQL functions or application triggers. The views expose only the Auth columns needed for session checks and transactional row locks to the backend role. The `api` schema is empty. Direct client access to application tables remains denied; onboarding runs through the authenticated Edge Function.

All implementation artifacts use English names. User-provided content retains its original language. Google sign-in, MCP OAuth and conversational onboarding are implemented with Supabase Auth and Edge Functions. The remote deployment is available, and the local stack remains available for development. Finance/Health operations, storage buckets, uploads and purge services are subsequent stages. No users or sample records are seeded.

All four migrations have been applied to the local `Impulso` stack. All 256 pgTAP assertions passed, confirming the model, restricted Auth views and the absence of custom database functions and application triggers. The remote Impulso database has also been verified against the current model, and its migration history is up to date. Remote Auth, authorization hosting and the API Edge Function are deployed. Google sign-in, the authenticated remote `/session` check, consent, OAuth return and authenticated MCP handshake/discovery succeeded. ChatGPT shows the plugin connected. An individual ChatGPT MCP tool invocation and remote denial/revocation tests remain unverified. See [the remote deployment guide](docs/remote-deployment.md) for the verified status and separate Personal CLI profile.

### Schema definitions and migrations

Edit the complete desired database structure in `apps/supabase/schemas/`. Each table has its own file grouped by domain, with its columns, relationships, constraints, indexes, RLS and privileges together. No custom SQL function or application trigger definitions remain in the declarative tree. The initial migration is preserved as history; `20261013013807_remove_impulso_database_functions.sql` removes its eight functions and 93 triggers without changing any tables or stored data.

`apps/supabase/migrations/` contains the chronological change history. After editing the declarative files, generate and review a new migration with the configured `pg-delta` engine before applying it. Changes in `schemas/` are not applied automatically by `db reset`.

```powershell
npx supabase@2.120.0 db schema declarative sync --file update_finance_tables --no-apply --workdir apps
```

Run this only after making the intended schema edits. It can use a temporary shadow database to compare definitions, but `--no-apply` does not apply changes to the local project database. Preserve applied or shared migrations and commit the declarative edits, new migration and relevant tests together.

See [the database workflow](docs/database-workflow.md) for the file layout, generation process, dependency handling and review steps. Each additional operation needs its application rules implemented in Edge Functions before being exposed through MCP.

### Apply locally

The local `Impulso` stack is initialized and all four migrations are already applied. The previous `apps` stack was stopped with its volumes preserved. Run these targets from the repository root with Docker Desktop running to start the stack, apply future reviewed migrations and verify the database:

```powershell
npx nx run supabase:start-local
npx nx run supabase:migrate-local
npx nx run supabase:test-db
```

`start-local` applies migrations when initializing a fresh stack. `migrate-local` applies pending migrations while preserving existing data. To deliberately rebuild the local database from history, use `npx supabase@2.120.0 db reset --local --workdir apps`; this deletes its existing data. These commands do not deploy to the hosted Supabase project.

Tests live in `apps/supabase/tests/database` and use temporary fixtures inside transactions that roll back. Run them after applying the migration. Validation of user-supplied decimal strings before PostgreSQL conversion belongs to the future application operations; direct administrator SQL must supply already validated amounts.

Before enabling additional client operations, implement authenticated Edge Functions that enforce user permissions, immutable fields, row versions, financial precision, owner existence, archive rules and purge workflows. Use explicit SQL transactions and consistent row locks for related writes and audit records. Native table constraints still enforce references, uniqueness and basic value checks; there is no automatic actor stamping, version increment or custom trigger validation. Direct client access to application tables remains denied; additional operations stay unexposed until their Edge Function checks are implemented.

## Edge Function foundation

The local `impulso-api` Edge Function hosts the Streamable HTTP MCP endpoint at `http://127.0.0.1:54321/functions/v1/impulso-api/mcp`. The `impulso-auth` Edge Function serves Google sign-in and connection consent at `http://127.0.0.1:54321/functions/v1/impulso-auth`. Clients initiate Supabase OAuth and ask the user to approve the connection. The `get_session` and `onboard` tools let the client collect the initial name, workspace name and time zone in conversation. Authorization has no onboarding form and needs no separate web server.

Onboarding atomically creates the personal workspace, owner membership, self profile, identity link, basic-person ownership, alias `me`, audit event and request receipt. Retries and concurrent calls reuse the same workspace. Finance and Health operations are not exposed yet. Existing `/health`, `/session` and `/onboard` HTTP endpoints share the same backend.

Run `npx nx run supabase:configure-backend` once after applying the migrations, then keep `npx nx run supabase:serve-functions` active in one terminal. This target builds the authorization assets and serves both functions. The authorization page is `http://127.0.0.1:54321/functions/v1/impulso-auth/oauth/consent`; an OAuth client supplies the request identifier. Opening the authorization function's home page explains how to connect.

Project-local connection settings in `.codex/config.toml` and `.mcp.json` now point Codex and Claude Code to the hosted MCP endpoint. Each client completes its own OAuth connection. The [remote deployment guide](docs/remote-deployment.md) describes that connection and the published authorization page. The page serves only browser assets through a small Sites response wrapper; all application logic and data stay on Supabase. The [OpenAI tunnel guide](docs/openai-tunnel.md) remains an optional alternative for local development. See [the Edge Function guide](docs/edge-functions.md) for login commands, supported OAuth boundaries and verification.

<a alt="Nx logo" href="https://nx.dev" target="_blank" rel="noreferrer"><img src="https://raw.githubusercontent.com/nrwl/nx/master/images/nx-logo.png" width="45"></a>

✨ Your new, shiny [Nx workspace](https://nx.dev) is ready ✨.

[Learn more about this workspace setup and its capabilities](https://nx.dev/docs/technologies/typescript/introduction?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects) or run `npx nx graph` to visually explore what was created. Now, let's get you up to speed!

🚀 If you haven't connected to Nx Cloud yet, [complete your setup here](https://cloud.nx.app/get-started). Get faster builds with remote caching, distributed task execution, and self-healing CI. [See how your workspace can benefit](#nx-cloud).

## Generate a library

```sh
npx nx g @nx/js:lib packages/pkg1 --publishable --importPath=@my-org/pkg1
```

## Run tasks

To build the library use:

```sh
npx nx run pkg1:build
```

To run any task with Nx use:

```sh
npx nx run <project-name>:<target>
```

These targets are either [inferred automatically](https://nx.dev/docs/concepts/inferred-tasks?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects) or defined in the `project.json` or `package.json` files.

[More about running tasks in the docs &raquo;](https://nx.dev/docs/features/run-tasks?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects)

## Versioning and releasing

To version and release the library use

```
npx nx release
```

Pass `--dry-run` to see what would happen without actually releasing the library.

[Learn more about Nx release &raquo;](https://nx.dev/docs/features/manage-releases?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects)

## Keep TypeScript project references up to date

Nx automatically updates TypeScript [project references](https://www.typescriptlang.org/docs/handbook/project-references.html) in `tsconfig.json` files to ensure they remain accurate based on your project dependencies (`import` or `require` statements). This sync is automatically done when running tasks such as `build` or `typecheck`, which require updated references to function correctly.

To manually trigger the process to sync the project graph dependencies information to the TypeScript project references, run the following command:

```sh
npx nx sync
```

You can enforce that the TypeScript project references are always in the correct state when running in CI by adding a step to your CI job configuration that runs the following command:

```sh
npx nx sync:check
```

[Learn more about nx sync](https://nx.dev/reference/nx-commands#sync)

## Nx Cloud

Nx Cloud ensures a [fast and scalable CI](https://nx.dev/nx-cloud?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects) pipeline. It includes features such as:

- [Remote caching](https://nx.dev/docs/features/ci-features/remote-cache?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects)
- [Task distribution across multiple machines](https://nx.dev/docs/features/ci-features/distribute-task-execution?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects)
- [Automated e2e test splitting](https://nx.dev/docs/features/ci-features/split-e2e-tasks?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects)
- [Task flakiness detection and rerunning](https://nx.dev/docs/features/ci-features/flaky-tasks?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects)

### Set up CI (non-Github Actions CI)

**Note:** This is only required if your CI provider is not GitHub Actions.

Use the following command to configure a CI workflow for your workspace:

```sh
npx nx g ci-workflow
```

[Learn more about Nx on CI](https://nx.dev/docs/features/ci-features?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects)

## Install Nx Console

Nx Console is an editor extension that enriches your developer experience. It lets you run tasks, generate code, and improves code autocompletion in your IDE. It is available for VSCode and IntelliJ.

[Install Nx Console &raquo;](https://nx.dev/docs/getting-started/editor-setup?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects)

## 🔗 Learn More

- [Nx Documentation](https://nx.dev/docs)
- [Crafting Your Workspace Tutorial](https://nx.dev/docs/getting-started/tutorials/crafting-your-workspace)
- [Module Boundaries](https://nx.dev/docs/features/enforce-module-boundaries)
- [Releasing Packages](https://nx.dev/docs/features/manage-releases)
- [Nx Plugins](https://nx.dev/docs/concepts/nx-plugins)
- [Nx Cloud](https://nx.dev/nx-cloud)

## 💬 Community

Join the Nx community:

- [Discord](https://go.nx.dev/community)
- [X (Twitter)](https://twitter.com/nxdevtools)
- [LinkedIn](https://www.linkedin.com/company/nrwl)
- [YouTube](https://www.youtube.com/@nxdevtools)
- [Blog](https://nx.dev/blog)
