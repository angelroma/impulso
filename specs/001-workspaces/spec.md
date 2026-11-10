# Feature Specification: Workspaces

**Feature Branch**: n/a (retroactive; built on `refactor`)

**Created**: 2026-11-09

**Status**: Implemented (retroactive spec)

**Input**: "Single user; each workspace is independent (for example 'Yo', 'Mamá') and one is the
default. Categories, payees and projects are per workspace."

## User Scenarios & Testing

### User Story 1 - Start with one workspace (Priority: P1)

A new user has nothing yet. They create a workspace with a name, a currency and a time zone, and
it is ready to use: it is the default and already has general categories.

**Why this priority**: nothing else can be recorded without a workspace.

**Independent Test**: sign in as a new user, ask for context (setup is required), create a
workspace, ask for context again and see the workspace with its categories.

**Acceptance Scenarios**:

1. **Given** a user with no workspaces, **When** they ask for context, **Then** the reply says
   setup is required and lists no workspaces.
2. **Given** a user with no workspaces, **When** they create "Personal" in MXN and
   America/Mexico_City, **Then** it becomes the default and has the default income and expense
   categories.
3. **Given** a user with no workspaces, **When** they try to record a transaction, **Then** it is
   refused with a message to create a workspace first.

---

### User Story 2 - Keep separate sets of books (Priority: P2)

The user keeps money that is not theirs (a parent's funds) apart from their own. Each workspace
has its own accounts, categories, payees, projects and transactions, and one is used when none
is named.

**Why this priority**: independence between workspaces is the core promise of the model.

**Independent Test**: create two workspaces, add records to each, and confirm the context of one
never shows records of the other.

**Acceptance Scenarios**:

1. **Given** a default workspace, **When** a second workspace is created without asking to be
   the default, **Then** the first stays the default.
2. **Given** two workspaces, **When** the second is set as default, **Then** the first stops
   being the default and later requests without a workspace use the second.
3. **Given** two workspaces, **When** context is requested for one, **Then** only that
   workspace's accounts, categories, payees and active projects are returned, plus the short
   list of all workspaces.

---

### User Story 3 - Rename, adjust or retire a workspace (Priority: P3)

The user renames a workspace, fixes its time zone, or archives one they no longer use.

**Why this priority**: maintenance, needed rarely.

**Independent Test**: rename a workspace, change its time zone, archive a non-default workspace
and confirm it no longer appears in context.

**Acceptance Scenarios**:

1. **Given** a workspace with no accounts, **When** its currency is changed, **Then** the change
   is accepted.
2. **Given** a workspace with at least one account, **When** its currency is changed, **Then**
   the change is refused.
3. **Given** the default workspace and another active one, **When** the default is archived,
   **Then** it is refused until another workspace is made the default.
4. **Given** an archived workspace, **When** context is requested, **Then** it is not listed and
   its records cannot be reached.

### Edge Cases

- Two active workspaces of one user cannot share a name (compared without regard to case); an
  archived workspace's name can be reused.
- Unsetting the default directly is refused; the user sets another workspace as default instead.
- The only remaining workspace can be archived even though it is the default; the user is then
  back to "setup required".
- An unknown time zone or a currency outside the supported list is refused.
- A workspace that belongs to another user behaves as if it did not exist.

## Requirements

### Functional Requirements

- **FR-001**: A user MUST be able to create a workspace by giving a name, a currency and a time
  zone.
- **FR-002**: The currency MUST be one of the supported ISO 4217 codes and the time zone MUST be
  a valid IANA zone.
- **FR-003**: A user's first active workspace MUST become their default. Exactly one active
  workspace per user is the default while any exist.
- **FR-004**: Every new workspace MUST start with the default category set (82 general
  categories: ten expense groups and one income group, with subcategories).
- **FR-005**: A user MUST be able to rename a workspace, change its time zone and make it the
  default.
- **FR-006**: The currency of a workspace MUST NOT change once the workspace has accounts.
- **FR-007**: A user MUST be able to archive a workspace. The default cannot be archived while
  another active workspace exists.
- **FR-008**: An archived workspace and everything in it MUST be hidden from all tools; nothing
  is physically deleted.
- **FR-009**: Requests that do not name a workspace MUST use the default workspace.
- **FR-010**: Context MUST return, for the chosen or default workspace: today's date in its time
  zone, active accounts with balances, active categories with their parent, active payees
  (most used first, at most 100) and active projects with progress.
- **FR-011**: A user MUST only ever see or change their own workspaces.

### Key Entities

- **Workspace**: an independent set of books owned by one user. Has a name, a currency, a time
  zone, a default flag and an archived date.
- **Currency**: a supported ISO 4217 code with its name (reference data).

## Success Criteria

- **SC-001**: A new user goes from nothing to a usable workspace with one request after sign-in.
- **SC-002**: No request made for one workspace ever returns or changes a record of another.
- **SC-003**: At every moment a user with active workspaces has exactly one default.

## Assumptions

- One person uses the system; "workspaces" separate purposes, not people. There is no sharing.
- "Today" for defaults and summaries is computed in the workspace time zone.

## Open Questions

- **Language of the default categories**: they are seeded in Mexican Spanish, but the
  constitution says system-generated defaults are in English. Amend the rule or the seed?
- **No unarchive**: an archived workspace cannot be brought back through the tools. Intended?
- **Archiving with content**: a workspace with accounts and transactions can be archived with no
  warning. Should the reply say how much is being hidden?

## Implementation Reference

- Tools: `get_context`, `manage_workspace` (create, update, archive)
- Code: `apps/supabase/functions/_shared/finance/workspaces.ts`, `default_categories.ts`,
  `common.ts` (`resolveWorkspace`, `validCurrency`, `validTimezone`)
- Schema: `apps/supabase/schemas/finance/tables/workspaces.sql`, `currencies.sql`
- Tests: `functions/tests/integration_test.ts` ("A new user sets up workspaces…", "Guards
  keep…"), `tests/database/impulso_schema.test.sql`
