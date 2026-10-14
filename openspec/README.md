# Impulso documentation

This directory is the home for Impulso's technical documentation. Start with the current specifications for behavior, use the guides to operate the project, and consult reference material for context and original design sources.

## Current specifications

| Specification | Covers |
| --- | --- |
| [Database model](specs/database-model/spec.md) | Domain boundaries, native integrity, restricted access, and the division between PostgreSQL and TypeScript responsibilities. |
| [MCP authentication](specs/mcp-authentication/spec.md) | Google identity, Supabase OAuth/session checks, MCP discovery, and the two implemented tools. |
| [Conversational onboarding](specs/conversational-onboarding/spec.md) | Suggested workspace names, friendly time-zone assistance, confirmation, and setup through the conversation. |

The database and MCP authentication specs backfill existing implementation. The onboarding spec records the completed onboarding change. New product behavior should be proposed as a change before implementation.

## Operating guides

| Guide | Use it for |
| --- | --- |
| [Database workflow](guides/database-workflow.md) | Editing the declarative model, reviewing migrations, and checking the local database. |
| [Local development](guides/local-development.md) | Configuring and testing the local Edge Functions, authentication, and MCP endpoint. |
| [Remote deployment](guides/remote-deployment.md) | The Personal Supabase profile, hosted configuration, connection setup, and recorded verification limits. |
| [Authorization hosting](guides/authorization-hosting.md) | Building and hosting the small public sign-in and consent page. |
| [Optional local tunnel](guides/local-tunnel.md) | The prepared OpenAI tunnel alternative for local development; its runtime has not been verified. |

These procedures include commands that can change a running environment. Reading the guide or updating documentation does not execute them.

## Reference and history

- [Database catalogue](reference/database-catalogue.md): purposes and SQL sources for all 23 application tables and four private Auth views.
- [Reference index](reference/README.md): provenance, historical path mapping, and implemented versus planned status.
- [Original data model](reference/original-data-model.md): the original design, preserved in its original language; consult the reference index before using it as implementation guidance.
- [Authorization Site identity](reference/authorization-site.json): the existing public deployment identity and expected origin.
- [Changes](changes): active proposals, designs, and tracked implementation tasks.
- [Archived changes](changes/archive): completed change records, preserved as historical evidence.

## Implementation boundary

Google sign-in, OAuth connection, session inspection, and personal workspace onboarding are implemented. The MCP tool surface currently contains only `get_session` and `onboard`. Finance and Health tables exist; recording an expense, managing health data, sharing, uploads, and purge services still require application work.

The desired SQL structure stays in [apps/supabase/schemas](../apps/supabase/schemas), with reviewed chronological changes in [apps/supabase/migrations](../apps/supabase/migrations). Business logic and MCP tools stay in [TypeScript Edge Functions](../apps/supabase/functions). Custom PostgreSQL functions, procedures, and application triggers are excluded from the current model.

## Maintaining documentation

`specs` and `changes` are native OpenSpec directories. `guides` and `reference` are Impulso repository conventions for operating instructions and supporting sources; OpenSpec does not validate their prose automatically. Keep specifications focused on observable requirements, guides on procedures, and reference files on supporting context.

New technical documentation is written in English. Preserve user-provided material in its original language, identify historical observations, and link canonical implementation instead of copying its complete definitions. Root [README.md](../README.md) is a short entry point and [AGENTS.md](../AGENTS.md) contains repository instructions. General project documentation belongs here; there is no separate root `docs` directory.
