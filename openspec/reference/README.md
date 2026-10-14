# Reference material

These files support the [current specifications](../README.md#current-specifications) and [operating guides](../README.md#operating-guides). They do not establish additional implemented application operations.

| File | Purpose and authority |
| --- | --- |
| [Database catalogue](database-catalogue.md) | English overview of the current tables and private Auth views, with links to canonical SQL. |
| [Original data model](original-data-model.md) | Preserved original design document in its original language. It mixes implemented structure, earlier verification notes, and proposed application contracts. |
| [Authorization Site identity](authorization-site.json) | Preserved public Site project ID and expected HTTPS origin, used by the authorization hosting procedure. It contains no credentials. |

## Source of truth

The complete [declarative SQL tree](../../apps/supabase/schemas) defines the desired database structure. The [migration directory](../../apps/supabase/migrations) records reviewed chronological changes, including definitions that were subsequently removed. The [Edge Function implementation](../../apps/supabase/functions/impulso-api) and its tests establish current application behavior.

The original model is design provenance. Its three-migration inventory, local-only observations, and proposed operation contracts are historical. Current source has four migrations and four private Auth projection views; the database contains no custom PostgreSQL functions, procedures, or application triggers. Do not restore removed routines from historical migrations or the original narrative.

The deployed application currently exposes session inspection and conversational onboarding through `get_session` and `onboard`. Finance and Health records have tables, but their application operations are pending. Managed-person lifecycle, sharing and invitations, identity claiming, owner transfer, file storage/upload services, audit-query services, and purge workflows are also pending. Proposed rules in the original document must be implemented and tested in TypeScript Edge Functions before those operations are exposed.

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
