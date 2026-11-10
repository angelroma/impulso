# Impulso specs

Specs 001–007 are **retroactive**: they describe what was already built in the November 2026
rebuild, written from the code and tests rather than before them. Each has a `spec.md` only; there
is no `plan.md` or `tasks.md` because the work is done.

| Spec | Covers | MCP tools |
| --- | --- | --- |
| [001-workspaces](001-workspaces/spec.md) | Independent workspaces, the default, currency and time zone | `get_context`, `manage_workspace` |
| [002-accounts](002-accounts/spec.md) | Account types, balances, default account, moving accounts | `manage_account` |
| [003-categories-and-payees](003-categories-and-payees/spec.md) | General categories with subcategories, payees, merging | `manage_category`, `manage_payee` |
| [004-transactions](004-transactions/spec.md) | Recording, editing, deleting, moving and listing | `record_transaction`, `update_transaction`, `list_transactions` |
| [005-projects](005-projects/spec.md) | Budget, spent, remaining; debts as projects | `manage_project` |
| [006-summaries](006-summaries/spec.md) | Income, expense and net for a period | `get_summary` |
| [007-mcp-access](007-mcp-access/spec.md) | Sign-in, consent and who can call the tools | — |

## How to read them

- **Requirements** state what the system does today. Each is covered by code; the
  "Implementation reference" section of each spec names the files and tests.
- **Open questions** are behaviors found in the code that nobody decided on purpose, or gaps.
  They are not requirements. Answer one by amending the spec, then change the code if needed.

## Going forward

New work starts at `008` with `/speckit-specify` and follows the full flow (specify, plan, tasks,
implement). A change to existing behavior amends the retroactive spec it belongs to instead of
creating a new one.
