# Impulso documentation

This directory is the home for Impulso's technical documentation. Start with the current specifications for behavior, use the guides to operate the project, and consult reference material for context and original design sources.

## Current specifications

| Specification | Covers |
| --- | --- |
| [Database model](specs/database-model/spec.md) | Domain boundaries, native integrity, restricted access, and the division between PostgreSQL and TypeScript responsibilities. |
| [MCP authentication](specs/mcp-authentication/spec.md) | Google identity, Supabase OAuth/session checks, MCP discovery, and the baseline account-tool requirements. |
| [Conversational onboarding](specs/conversational-onboarding/spec.md) | Suggested workspace names, friendly time-zone assistance, confirmation, and setup through the conversation. |
| [Finance expenses](specs/finance-expenses/spec.md) | Authorized financial choices, accepted book/account setup, exact expense recording and safe retries. |

The completed [conversational expense change](changes/add-conversational-expense-recording/proposal.md) has been synchronized into the main specifications and remains unarchived. The [personal finance planning adaptation](changes/adapt-finance-to-personal-planning/proposal.md) contains nine deltas covering the extended ledger, budgets and expected activity, debts, wealth, reports, reviewed imports and their database/MCP boundaries. Consult its [verification record](changes/adapt-finance-to-personal-planning/verification.md) for observed local results. Those deltas remain in the active change until normal synchronization. New product behavior should be proposed as a change before implementation.

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

- [Database catalogue](reference/database-catalogue.md): purposes and SQL sources for all 40 application tables and four private Auth views.
- [Reference index](reference/README.md): provenance, historical path mapping, and implemented versus planned status.
- [Original data model](reference/original-data-model.md): the original design, preserved in its original language; consult the reference index before using it as implementation guidance.
- [Authorization Site identity](reference/authorization-site.json): the existing public deployment identity and expected origin.
- [Changes](changes): active proposals, designs, and tracked implementation tasks.
- [Archived changes](changes/archive): completed change records, preserved as historical evidence.

## Implementation boundary

Local source and hosted API version 3 expose 20 MCP tools. The original six account/setup/expense contracts remain available. Five ledger tools add account metadata, categories, typed income/expense/transfers, corrections and bounded history. Five planning tools manage budgets, commitments, debt metadata, savings goals and manual assets. `get_finance_report` provides exact dated measures with explicit completeness and evidence. Three import tools separate frozen preview, accepted atomic commit and bounded status reads. See the [service catalogue](guides/local-development.md#mcp-tools) and [synthetic walkthrough](changes/adapt-finance-to-personal-planning/synthetic-acceptance.md).

The authorized remote rollout applied the six pending migrations, bringing the hosted database to ten migration versions and 40 RLS-enabled application tables. ChatGPT's refreshed plugin lists all 20 tools, and an actual OAuth `get_session` call confirmed completed onboarding. The [rollout verification](guides/remote-deployment.md#finance-rollout-verification) distinguishes that hosted evidence from the earlier local test results. Existing user records were preserved; deployment created no salary, financial records or live workbook imports and made no source-sheet repairs. New managed people, sharing, Health, files and purge execution remain pending. See [local development](guides/local-development.md) for contracts and local verification status.

The desired SQL structure stays in [apps/supabase/schemas](../apps/supabase/schemas), with reviewed chronological changes in [apps/supabase/migrations](../apps/supabase/migrations). Business logic and MCP tools stay in [TypeScript Edge Functions](../apps/supabase/functions). Custom PostgreSQL functions, procedures, and application triggers are excluded from the current model.

## Maintaining documentation

`specs` and `changes` are native OpenSpec directories. `guides` and `reference` are Impulso repository conventions for operating instructions and supporting sources; OpenSpec does not validate their prose automatically. Keep specifications focused on observable requirements, guides on procedures, and reference files on supporting context.

New technical documentation is written in English. Preserve user-provided material in its original language, identify historical observations, and link canonical implementation instead of copying its complete definitions. Root [README.md](../README.md) is a short entry point and [AGENTS.md](../AGENTS.md) contains repository instructions. General project documentation belongs here; there is no separate root `docs` directory.
