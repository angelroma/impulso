# Proposal

## Why

Project documentation is split between `docs`, an application hosting guide, and OpenSpec, with duplicated and stale implementation status. Centralizing it under `openspec` will make the current behavior, operating instructions, and future design easier to distinguish and maintain.

## What Changes

- Move all six files in `docs` and the authorization hosting guide into `openspec/guides` or `openspec/reference`, then remove the empty root documentation directory.
- Backfill English main specifications for the existing database model and MCP authentication behavior from canonical SQL, TypeScript, tests, and existing documentation. Preserve the existing conversational onboarding spec.
- Keep the original detailed Spanish data-model document and the public authorization Site identity unchanged as reference material, with explicit provenance and status guidance. Add an English table catalogue linking canonical SQL.
- Correct stale procedure/status descriptions and label unimplemented Finance, Health, sharing, file, and purge operations as planned.
- Add an OpenSpec documentation index, shorten the root README, update live links, and document the agreed structure in AGENTS.md. Preserve archived change records.
- Validate specification structure, document links, source-file preservation, and the absence of active references to removed documentation paths.

## Capabilities

### New Capabilities

None. The new main-spec files backfill documentation of existing behavior; no product capability is added. This documentation-only migration uses `skip_specs: true` and creates no change delta specs.

### Modified Capabilities

None. Existing requirements and application behavior remain unchanged.

## Impact

The documentation home becomes `openspec/README.md`, with native `specs` and `changes` plus project-specific `guides` and `reference` directories. SQL definitions and migration history remain in `apps/supabase`; runtime code, credentials, infrastructure, deployed functions, and application data are outside this change. New main-spec backfills do not authorize planned application operations.
