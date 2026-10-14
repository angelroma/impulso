# Planning validation

## Result and boundaries

The proposal, design, nine capability deltas, and 32 unchecked implementation tasks are ready. No task is marked implemented. This workflow created only this change's planning documents and metadata; it did not edit application source, migrations, main specifications, the Google workbook, or any local/remote financial records. No application test run is claimed for this new design.

## Checks performed

- Native `openspec validate --all --strict --no-interactive --json` passed all five current items. The new change has two informational dependency notices: `finance-expenses` is not a main spec yet, and the renamed supported-tools requirement exists only in the completed predecessor delta. These are resolved by task 1.1, not by pretending that synchronization happened.
- A native sequential merge preview applied the completed expense change followed by this change against a disposable copy of main specs. All three predecessor and all nine new capability updates composed without warnings. Hash comparison confirmed the real main specs were unchanged; the temporary copy was removed.
- The composed result retains the renamed MCP requirement, the existing 18 expense requirements, original scenario names, and existing onboarding specification. New totals for modified capabilities are database model 10 requirements/20 scenarios, expenses 18/44, and MCP 12/23. No requirement was removed.
- New capability totals are ledger 7 requirements/21 scenarios, planning 6/10, debts 5/12, wealth 5/12, reporting 6/18, and imports 7/17. Requirement descriptions remain within the strict 500-character bound.
- Local Markdown links and anchors were checked, and 52 protected source/history/schema files matched their existing preservation hashes. Historical migration files, original reference material, and archived changes remain intact.
- Independent read-only model/API review closed explicit decisions for distinct child transaction request IDs, immutable group membership, unknown installment component totals, goal funding basis, signed net worth, source consumption across changed roles, and monthly summaries that cannot settle individual bills or reconstruct accounts.

## Implementation and rollout prerequisites

Follow [tasks](tasks.md) in dependency order, beginning with normal predecessor spec synchronization without automatic archive. The proposed final model adds 17 Finance tables to the existing application inventory of 23; the proposed MCP surface retains six old contracts and adds fourteen strict tools. Neither the 40-table model nor the 20-tool surface exists in the running application yet.

Source currency, actual-versus-planned months, adjustment meanings, baseline dates and destination mappings remain user-data review decisions. A later actual import requires accepted reconciled source evidence and a separate explicit instruction; a later remote rollout requires its own deployment and connection verification. The 106827.04 workbook difference is a verified arithmetic discrepancy, not a conclusion about the user's current savings.
