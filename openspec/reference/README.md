# Reference material

These files support the [current specifications](../README.md#current-specifications) and [operating guides](../README.md#operating-guides). They do not establish additional implemented application operations.

| File | Purpose and authority |
| --- | --- |
| [Database catalogue](database-catalogue.md) | English overview of the current tables and private Auth views, with links to canonical SQL. |
| [Original data model](original-data-model.md) | Preserved original design document in its original language. It mixes implemented structure, earlier verification notes, and proposed application contracts. |
| [Authorization Site identity](authorization-site.json) | Preserved public Site project ID and expected HTTPS origin, used by the authorization hosting procedure. It contains no credentials. |

## Source of truth

The complete [declarative SQL tree](../../apps/supabase/schemas) defines the desired database structure. The [migration directory](../../apps/supabase/migrations) records reviewed chronological changes, including definitions that were subsequently removed. The [Edge Function implementation](../../apps/supabase/functions/impulso-api) and its tests establish current application behavior.

The original model is design provenance. Its three-migration inventory, local-only observations, and proposed operation contracts are historical. Current source has ten migrations, 40 application tables and four private Auth projection views; the database contains no custom PostgreSQL functions, procedures, or application triggers. The fifth migration added narrow Finance backend privileges; five subsequent migrations extend the ledger, planning/debt/wealth model, reviewed imports, committed replacement uniqueness and recurrence revision metadata privileges. All ten are applied locally and remotely. The earlier four-migration, 23-table remote observations remain historical evidence. Do not restore removed routines from historical migrations or the original narrative.

The deployed version 3 application and local source expose 20 tools covering session inspection, conversational onboarding, authorized financial setup, typed ledger activity and corrections, budgets and commitments, debts, goals, assets, reports and reviewed imports. Independent book grants, exact decimal validation, explicit self/null attribution, transactional audit and safe retries apply throughout. The [personal planning adaptation](../changes/adapt-finance-to-personal-planning/proposal.md) and its [verification record](../changes/adapt-finance-to-personal-planning/verification.md) track the local implementation; the separate [rollout verification](../guides/remote-deployment.md#finance-rollout-verification) records the remote migration/deployment, refreshed 20-tool plugin discovery and authenticated session check. Deployment preserved existing user records and created no salary, financial records or live workbook imports. Managed-person lifecycle, sharing and invitations, identity claiming, owner transfer, Health, file services, audit-query services and purge workflows remain pending. Proposed rules in the original document do not authorize unsupported operations.

## Preserved sources and historical paths

The original model and authorization Site metadata were relocated without changing their bytes. Archived changes and the existing conversational onboarding spec were also retained unchanged. Their original paths and wording are historical evidence; active guides use the destinations below.

| Previous location | Current location |
| --- | --- |
| `docs/data-model.md` | [Original data model](original-data-model.md) |
| `docs/authorization-site.json` | [Authorization Site identity](authorization-site.json) |
| `docs/database-workflow.md` | [Database workflow](../guides/database-workflow.md) |
| `docs/edge-functions.md` | [Local development](../guides/local-development.md) |
| `docs/openai-tunnel.md` | [Optional local tunnel](../guides/local-tunnel.md) |
| `docs/remote-deployment.md` | [Remote deployment](../guides/remote-deployment.md) |
| `apps/supabase/auth-hosting.md` | [Authorization hosting](../guides/authorization-hosting.md) |

The five operating guides were reconciled after relocation. Preserve the original model and archived records as sources rather than editing them to reflect newer behavior. Document future corrections in current specs, guides, or a new change. Historical old-path strings in this mapping, the preserved model, and archived records are intentionally retained; they are not live navigation targets.
