# Design

## Context

The repository currently keeps six documents in `docs`, authorization hosting instructions in `apps/supabase/auth-hosting.md`, and one current capability spec plus an archived change in OpenSpec. The operational documents contain useful commands and deployment evidence, but some describe an earlier three-migration database and an account before onboarding. The original data-model document mixes Spanish source material, implemented table structure, and proposed application operations.

Canonical implementation evidence is available locally: the declarative SQL tree, four chronological migrations, TypeScript Edge Functions, configuration, and tests. Documentation can therefore be reconciled without querying user records or changing any running environment.

## Goals / Non-Goals

**Goals:**

- Make `openspec/README.md` the documentation entry point and remove the root `docs` directory.
- Separate existing behavior, operating instructions, original reference material, and proposed work.
- Preserve all original source documents through relocation, preserve the Spanish model and public Site metadata byte for byte, and retain archived change history unchanged.
- Backfill current English specifications from implementation evidence without adding product behavior.
- Keep live document links valid and explain historical references that intentionally retain their original paths.

**Non-Goals:**

- Change SQL, migrations, configuration, runtime code, OAuth settings, credentials, deployment, services, or application data.
- Implement Finance, Health, sharing, file services, or other future operations described in the original design.
- Move implementation files into OpenSpec, generate SQL from prose, or replace native OpenSpec workflows.

## Decisions

### Use native OpenSpec directories with two documentation extensions

Keep `specs` for current requirements and `changes` for plans/history. Add project-specific `guides` for operating procedures and `reference` for supporting material. A root README remains a short project entry point; AGENTS.md remains the repository instruction file. These exceptions do not recreate a general-purpose root documentation directory.

Putting every document in `specs` would treat commands, deployment observations, and planned operations as normative product requirements. Keeping a second documentation tree would defeat the requested single home.

### Relocate first, then reconcile

Move the current working-tree files using this explicit map, checking source/destination paths and hashes before content edits:

| Source | Destination |
| --- | --- |
| `docs/data-model.md` | `openspec/reference/original-data-model.md` |
| `docs/authorization-site.json` | `openspec/reference/authorization-site.json` |
| `docs/database-workflow.md` | `openspec/guides/database-workflow.md` |
| `docs/edge-functions.md` | `openspec/guides/local-development.md` |
| `docs/openai-tunnel.md` | `openspec/guides/local-tunnel.md` |
| `docs/remote-deployment.md` | `openspec/guides/remote-deployment.md` |
| `apps/supabase/auth-hosting.md` | `openspec/guides/authorization-hosting.md` |

The original model and Site identity remain byte-identical after relocation. New English reference guidance explains provenance and the limits of the original design. The five operational guides may be corrected after their initial hashes are verified. Remove `docs` only when it is empty; never delete unknown contents recursively.

### Backfill existing behavior directly into main specs

Add `database-model` and `mcp-authentication` main specs, preserve `conversational-onboarding`, and add an English catalogue of all 23 tables with links to canonical SQL. This change uses `skip_specs: true`: there are no delta specs because the work documents existing behavior and changes no capability. The backfills are reviewed against implementation, not copied wholesale from the older proposal.

Describe native constraints accurately. In particular, partial unique owner indexes enforce at most one matching owner; default version columns do not themselves implement incrementing versions or immutable fields. Application business rules remain in TypeScript, and planned lifecycle services are labeled pending.

### Keep authority and status explicit

The complete SQL tree in `apps/supabase/schemas` remains the desired database model; migrations remain reviewed chronological history. Existing TypeScript, configuration, and tests are evidence for current authentication and MCP behavior. The original model is design provenance, not proof that every described operation exists.

Replace mutable account-state assertions with reusable acceptance criteria or clearly dated historical observations. Preserve useful deployment details and public Site metadata. Document the tunnel as an optional, unverified local alternative. Link to the existing onboarding spec instead of duplicating its normative conversation flow.

### Preserve historical records

Do not rewrite the previous archived change or the original model merely to erase old path strings. The relocation table and reference index explain those historical paths. Active guides, indexes, and implementation references must use the new locations.

## Risks / Trade-offs

- [Old narrative mistaken for implemented behavior] -> Put an explicit provenance/status notice in the reference index and link to current specs and SQL.
- [Broken links after relocation] -> Validate local Markdown targets and anchors in active documents; check old-path references separately and document historical exclusions.
- [Information lost during cleanup] -> Hash all seven files before and immediately after moves; retain original model, Site metadata, and archive hashes through final verification.
- [Documentation drifts again] -> Add ownership rules to AGENTS.md, avoid volatile inventory totals where they add no value, and link canonical sources rather than copying full column definitions.
- [Custom folders mistaken for native OpenSpec behavior] -> Identify `guides` and `reference` as repository conventions; continue native validation for specs and change artifacts.

## Migration Plan

1. Record source hashes and existing archive hashes, then relocate all seven documents without altering content.
2. Backfill two current main specs and the English table catalogue from implementation evidence.
3. Reconcile the five guides, retaining useful procedures and labeling historical or pending material.
4. Create the OpenSpec and reference indexes; shorten the root README and add documentation ownership guidance to AGENTS.md.
5. Check links, preserved hashes, active old-path references, canonical inventories, and strict OpenSpec validation. Remove the empty root `docs` directory and mark verified tasks complete.

Rollback is limited to documentation: move the seven files back according to the inverse map and revert the associated document edits, preserving any unrelated working-tree changes. No infrastructure or data rollback is required.

## Open Questions

None. The user approved the documentation organization and full migration.
