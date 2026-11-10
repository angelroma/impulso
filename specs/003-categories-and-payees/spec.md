# Feature Specification: Categories and Payees

**Feature Branch**: n/a (retroactive; built on `refactor`)

**Created**: 2026-11-09

**Status**: Implemented (retroactive spec)

**Input**: "Categories must be general, like Wallet by BudgetBakers ('Suscripciones', 'Renta').
The specific thing paid (ChatGPT, Telmex, SAT) is a payee. Payees have a default category."

## User Scenarios & Testing

### User Story 1 - Label spending with general categories (Priority: P1)

The user classifies money by what it was for. Categories are general and grouped one level deep
(Vivienda › Renta). Who was paid is never a category.

**Why this priority**: categories drive every summary.

**Independent Test**: create a top-level category and a subcategory under it, and see both in
context with the parent shown.

**Acceptance Scenarios**:

1. **Given** a workspace, **When** a top-level category is created with a name and a kind
   (income or expense), **Then** it appears in context.
2. **Given** a top-level expense category, **When** a subcategory is created under it without a
   kind, **Then** it takes the parent's kind.
3. **Given** a subcategory, **When** another category is created under it, **Then** it is
   refused: the tree is one level deep.
4. **Given** an income parent, **When** an expense subcategory is requested under it, **Then**
   it is refused.

---

### User Story 2 - Remember who is paid (Priority: P1)

The user names who they paid ("Telmex"). The payee is created the first time it is used and can
carry a default category, so the next payment needs no category.

**Why this priority**: it is what makes recording a one-line request.

**Independent Test**: record an expense to a new payee, set that payee's default category, record
again without a category and see it applied.

**Acceptance Scenarios**:

1. **Given** no payee called "Telmex", **When** a transaction names it, **Then** the payee is
   created.
2. **Given** a payee "Telmex", **When** a transaction names "telmex", **Then** the existing
   payee is used.
3. **Given** a payee with a default expense category, **When** an expense is recorded for it
   without a category, **Then** that category is applied.

---

### User Story 3 - Tidy up (Priority: P3)

The user renames or regroups categories, archives ones they do not use, and merges duplicate
payees.

**Why this priority**: keeps lists short; needed occasionally.

**Independent Test**: merge payee A into B and confirm A's transactions now show B and A is gone
from context.

**Acceptance Scenarios**:

1. **Given** two payees for the same business, **When** one is merged into the other, **Then**
   all its transactions move to the target, the duplicate is archived and the reply says how
   many transactions changed.
2. **Given** a merge target with no default category, **When** the duplicate had one, **Then**
   the target inherits it; a target that has its own keeps it.
3. **Given** a category with active subcategories, **When** archiving it or moving it under a
   parent is requested, **Then** it is refused.
4. **Given** an archived category or payee, **When** context is requested, **Then** it is not
   listed, but past transactions still show it.

### Edge Cases

- Active category names are unique per workspace and kind (case-insensitive), so "Regalos" can
  exist once as income and once as expense. Active payee names are unique per workspace.
- A category cannot be its own parent. Passing no parent (null) makes a category top-level.
- A payee's default category must be an active category of the same workspace. It is applied
  only when its kind matches the transaction and it is still active; otherwise the transaction
  has no category.
- A payee cannot be merged into itself, into an archived payee, or into one of another
  workspace.
- Naming an archived payee in a new transaction creates a new payee with that name.

## Requirements

### Functional Requirements

- **FR-001**: A user MUST be able to create, rename and archive categories of kind income or
  expense.
- **FR-002**: Categories MUST form a tree at most one level deep; a subcategory has the same
  kind as its parent.
- **FR-003**: A user MUST be able to move a category under a top-level parent or make it
  top-level.
- **FR-004**: A category with active subcategories MUST NOT be archived or made a subcategory.
- **FR-005**: A payee MUST be created automatically the first time its name is used in a
  transaction; names match without regard to case.
- **FR-006**: A user MUST be able to create, rename and archive payees and set or clear a
  payee's default category.
- **FR-007**: A user MUST be able to merge one payee into another of the same workspace.
- **FR-008**: Categories and payees belong to one workspace and MUST NOT be used from another.
- **FR-009**: Archived categories and payees MUST remain on existing transactions and MUST NOT
  be offered for new ones.
- **FR-010**: `kind` sent with a category update MUST NOT be ignored. The change is applied only
  when no transaction and no subcategory uses the category; otherwise it is refused and the
  reply says how many transactions use it.
- **FR-011**: The reply to archiving or renaming a category or payee MUST say how many
  transactions use it.
- **FR-012**: A user MUST be able to restore an archived category or payee. Restoring is refused
  while an active one uses its name, and for a subcategory while its parent is archived.
- **FR-013**: When an edit changes a transaction's payee and leaves its category alone, the
  reply MUST include the new payee's default category as a suggestion, so the assistant can ask
  the user whether to apply it.

### Key Entities

- **Category**: what money was for. Has a name, a kind (income or expense), an optional parent
  and an archived date.
- **Payee**: who was paid or who paid. Has a name, an optional default category and an archived
  date.

## Success Criteria

- **SC-001**: A repeat payment to a known payee is recorded without the user naming a category.
- **SC-002**: The same business never appears as two active payees because of letter case.
- **SC-003**: A merge leaves no transaction on the duplicate payee.

## Assumptions

- Tags, category budgets and merging categories were rejected and are out of scope.
- The assistant, not the system, decides which category a new payee should get; it then saves
  it as that payee's default.

## Clarifications

### Session 2026-11-09

- Q: What happens when a category that other records use is changed? → A: The user must be told
  what the change affects; such changes are risky and must never be silent.
- Q: Should archived categories and payees be restorable? → A: Yes.
- Q: Should categories be mergeable? → A: No.
- Q: Should a payee's default category be applied when a transaction's payee is changed later?
  → A: Not automatically. The assistant picks the category that fits the operation and confirms
  it with the user. Every reply ends with a short summary of what was done, so the user can ask
  for a correction.

## Implementation Reference

- Tools: `manage_category` (create, update, archive, restore), `manage_payee` (create, update,
  archive, restore, merge)
- Code: `apps/supabase/functions/_shared/finance/labels.ts`, `common.ts` (`payeeByName`,
  `activeCategory`)
- Schema: `apps/supabase/schemas/finance/tables/categories.sql`, `payees.sql`,
  `category_kinds.sql`
- Tests: `functions/tests/integration_test.ts` ("A new user sets up workspaces, accounts,
  categories and payees",
  "Restores and notices tell the user what a change affects"),
  `tests/database/impulso_schema.test.sql`
