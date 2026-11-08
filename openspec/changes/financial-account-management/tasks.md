# Tasks

## Completed discovery
- [x] Confirm the request concerns financial accounts in the Impulso plugin.
- [x] Inspect the repository's current schema and application structure.
- [x] Specify renaming, cross-workspace migration and acceptance scenarios.

## Blocking prerequisite
- [ ] Obtain the financial server source and identify its relationship to this repository and deployment.
- [ ] Resolve source retention, supported dependencies and destination merge policy.

## Implementation — not started
- [ ] Implement versioned, authorized, idempotent account renaming with audit history.
- [ ] Implement migration preview with explicit source/destination resolution, dependency mapping and reconciliation.
- [ ] Implement accepted-preview commit with atomicity/recovery and duplicate protection.
- [ ] Register and document the operations in the existing MCP server.

## Validation — pending implementation
- [ ] Test renaming preserves IDs, balances, transactions and references.
- [ ] Test whitespace/invalid names, inaccessible accounts, stale versions and retries.
- [ ] Test migration between accounts in the same and different workspaces.
- [ ] Test nonempty destinations, duplicate provenance and currency incompatibility.
- [ ] Test cross-account transfers, corrections, settlements, opening balances and related records.
- [ ] Test access revoked after preview and concurrent source/destination writes.
- [ ] Inject mid-operation failures and verify rollback/recovery and retry behavior.
- [ ] Verify exact monetary reconciliation, report totals and unchanged external bindings.
- [ ] Run the financial server's full required checks before marking the PR ready.
