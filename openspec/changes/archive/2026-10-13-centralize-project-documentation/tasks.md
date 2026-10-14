# Tasks

## 1. Relocation and provenance

- [x] 1.1 Relocate all seven source documents according to the design map; verify matching SHA-256 hashes immediately after each move and record original-model, Site metadata, archive, and existing onboarding-spec hashes for final preservation checks.
- [x] 1.2 Add an English reference index explaining source provenance, historical path mapping, and implemented versus planned behavior; verify links to both preserved reference files and canonical implementation sources.

## 2. Current behavior baselines

- [x] 2.1 Backfill the database-model main spec and English database catalogue from canonical SQL; verify all six schemas, 23 tables, four private Auth views, and the distinction between native constraints and pending business services.
- [x] 2.2 Backfill the MCP-authentication main spec from TypeScript, configuration, and tests; verify the two-tool scope, OAuth/session protections, and link to the unchanged conversational-onboarding spec.

## 3. Operating guides and navigation

- [x] 3.1 Reconcile all five relocated operating guides against current local source and known deployment history; verify commands and relative paths, label optional tunnel and unverified tests, and remove stale current-account assertions.
- [x] 3.2 Add the OpenSpec documentation index, shorten the root README, and document ownership in AGENTS.md; verify navigation covers every guide, spec, reference, and change directory without duplicating detailed behavior.

## 4. Integrated verification

- [x] 4.1 Validate active local Markdown targets and anchors, check references to removed paths with historical exclusions documented, confirm preserved hashes, and remove the root docs directory only after verifying it is empty.
- [x] 4.2 Run strict OpenSpec validation for all current specs and this change, inspect the final diff for documentation-only scope, and record verification results; confirm all tracked tasks report complete without changing runtime, infrastructure, or data.

## Workflow follow-up

- Review the completed documentation migration and archive the change when requested.

## Verification results

- All seven source documents were relocated with matching SHA-256 hashes before guide edits.
- The preserved original model and public Site metadata, seven existing history/onboarding records, and 83 implementation files match their recorded hashes: 92 protected files, zero mismatches.
- Static checks covered 16 active Markdown files and 133 local targets/anchors with zero errors. Preserved original-source prose and archived records are excluded from live-link checks; their historical paths are explained in the reference index.
- The catalogue covers all six schemas, 23 tables, four private Auth views, and four reviewed migrations. The current SQL tree contains no custom functions, procedures, or application triggers.
- Strict OpenSpec validation passed the three current specifications and this documentation-only change: four items passed, zero failed. `skip_specs: true` is accepted because no capability behavior changed.
- Tracked-file whitespace checks and independent content/preservation review passed. The root documentation directory was removed only after confirming it was empty.
- No application source, SQL, migration, environment configuration, deployment, or user data was changed by this migration. Runtime, database integration, remote services, and external URL availability were not retested.
