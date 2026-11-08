# Financial account renaming and migration

## Why

Users need to rename existing financial accounts and migrate their data to another account, including an account in a different workspace.

## What changes

- Rename an authorized existing account while retaining its identity and financial history.
- Preview and commit a migration between explicitly selected source and destination accounts, validating access to both workspaces.
- Preserve monetary values, dates, provenance, correction history and dependent references; prevent duplicate imports and partial migrations.

## Status: blocked before implementation

The reviewed `main` commit, `4fab47af8a3915fbe554186d3d4456d6dba26ad5`, contains an Expo app with local trackers and habit setups. Its SQLite schema has no financial accounts, books, workspace memberships or financial ledger, and it contains no Impulso MCP server. The connected plugin exposes financial operations, but its implementation is not present in this repository.

This change specifies the requested capabilities only. It does not implement, register, deploy or enable either operation. Obtain the financial server source and establish its deployment relationship to this repository before implementation. Do not reinterpret financial accounts as local habit profiles or add an independent replacement ledger.

## Scope

Financial accounts managed by the Impulso plugin. Existing habit tracking behavior is outside this change. Actual customer account data is not migrated by this PR.

## Open decisions

- Identify the server repository/source and its authentication, persistence and audit conventions.
- Confirm whether migration retires the source account or copies its records. The preview must explicitly describe source retention and destination treatment before any commit.
- Define supported dependent records and policies for cross-account transfers, category/person mappings, existing destination data, differing currencies and connected reports. Unsupported cases must block the operation rather than silently omit records.
