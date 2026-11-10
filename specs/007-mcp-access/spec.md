# Feature Specification: MCP Access

**Feature Branch**: n/a (retroactive; built on `refactor`)

**Created**: 2026-11-09

**Status**: Implemented (retroactive spec; kept unchanged through the November 2026 rebuild)

**Input**: "Use Impulso from an AI assistant as a connector. Sign in with Google, approve the
client once, and keep replies short."

## User Scenarios & Testing

### User Story 1 - Connect an assistant (Priority: P1)

The user adds Impulso as a connector in their assistant. The assistant discovers how to sign in,
the user signs in with Google and approves the client on a consent page, and the assistant can
then call the tools as that user.

**Why this priority**: there is no other way to use the product.

**Independent Test**: from a fresh client, call the connector without credentials, follow the
discovery it points to, complete sign-in and consent, and list the tools.

**Acceptance Scenarios**:

1. **Given** a client with no credentials, **When** it calls the connector, **Then** it is
   refused with a pointer to where sign-in is described.
2. **Given** a signed-in user on the consent page, **When** they approve, **Then** the client
   receives a single-use code it can exchange for access; when they deny, no code is issued.
3. **Given** an approved client, **When** it initialises, **Then** it receives short usage
   guidance and exactly ten tools.

---

### User Story 2 - Act only as the signed-in user (Priority: P1)

Every tool call runs for the person who signed in. A client cannot name another user.

**Why this priority**: this is a personal ledger.

**Independent Test**: call a tool with an extra field that names a user; it is refused. Call
tools as two users at once; each sees only their own data.

**Acceptance Scenarios**:

1. **Given** a tool call with a field that is not part of the tool, **When** it is sent, **Then**
   it is refused before anything runs.
2. **Given** two users calling at the same moment, **When** both read context, **Then** each
   receives only their own.
3. **Given** a token that looks valid but was not issued by the sign-in service, **When** it is
   used, **Then** it is refused.

---

### User Story 3 - Withdraw access (Priority: P2)

The user revokes a client, or signs out, and access stops at once.

**Why this priority**: control over who holds access to financial data.

**Independent Test**: revoke the client's consent and retry a tool call and a token refresh;
both fail.

**Acceptance Scenarios**:

1. **Given** an approved client, **When** its consent is revoked, **Then** its current access
   and its ability to renew are both refused immediately.
2. **Given** a signed-out session, **When** its old access is reused, **Then** it is refused.
3. **Given** access issued to one client, **When** another client tries to renew it, **Then** it
   is refused.

### Edge Cases

- A browser session used directly on the connector (without the client approval step) is
  refused; a connector client using the plain session route is refused too.
- Anonymous accounts are refused.
- A user whose account is not linked to a verified Google identity with a confirmed email is
  refused.
- Access without the basic identity scope is refused with a message naming the scope needed.
- Requests from a web origin that is not on the allowed list, with query parameters, or with a
  body over 32 KB are refused.
- If the sign-in service is unreachable the request fails as "temporarily unavailable"; it is
  never treated as valid.
- The health check is public and reveals nothing about the user or the runtime.
- Errors returned to the client are short and never contain secrets or database details.

## Requirements

### Functional Requirements

- **FR-001**: The connector MUST publish discovery information that tells a client where to sign
  in, and MUST challenge calls without credentials by pointing to it.
- **FR-002**: Sign-in MUST be through Google. Access for a client MUST require the user's
  explicit approval on a consent page and MUST use a single-use code bound to that client
  (PKCE).
- **FR-003**: The identity of the caller MUST come only from access verified with the sign-in
  service; nothing the client sends as tool input can select the user.
- **FR-004**: Tool calls MUST be accepted only from an approved client acting for a
  Google-verified user with the basic identity scope.
- **FR-005**: Access MUST stop working as soon as the user signs out or revokes the client.
- **FR-006**: The connector MUST expose exactly ten tools: get_context, manage_workspace,
  manage_account, manage_category, manage_payee, manage_project, record_transaction,
  update_transaction, list_transactions and get_summary. Read-only tools are marked as such.
- **FR-007**: Tool input MUST be validated against a closed definition; unknown fields are
  refused.
- **FR-008**: Each request MUST be independent: no state is kept between requests or shared
  between callers.
- **FR-009**: The guidance sent to the assistant MUST stay short and tell it to: read context
  first, act on clear requests without a confirmation step, reply in one or two lines in the
  user's language, and offer a short list of choices when something is missing.
- **FR-010**: The consent page MUST be served with restrictive browser protections, MUST only
  talk to the sign-in service, and MUST only return the user to a callback registered by the
  client.
- **FR-011**: The backend's database role MUST be able to read, add and change application
  records but never delete them.

### Key Entities

- **User**: the person signed in with Google; owns workspaces.
- **Client**: an assistant application the user has approved.
- **Consent**: the user's approval for one client; can be revoked.

## Success Criteria

- **SC-001**: A new client goes from first call to listing tools using only the published
  discovery information, with one sign-in and one approval from the user.
- **SC-002**: No request can read or change another user's data.
- **SC-003**: After revocation or sign-out, the next call with the old access fails.

## Assumptions

- Sign-in, consent and connector plumbing are stable; feature work does not change them
  (constitution, Principle IV).
- Scopes describe identity only; there are no per-tool permissions. An approved client can use
  all ten tools.
- Clients may register themselves; every grant still needs the user's approval.

## Open Questions

- **Who may sign up**: the product is described as single-user, but any Google account can sign
  in and get its own empty space. Restrict sign-in to an allowed list of emails?
- **Reviewing approved clients**: revocation works, but there is no Impulso page listing the
  clients a user has approved. Needed?
- **Read-only access**: there is no way to approve a client for reading only. Wanted?

## Implementation Reference

- Functions: `apps/supabase/functions/impulso-api` (`handler.ts`, `mcp.ts`, `runtime.ts`),
  `apps/supabase/functions/impulso-auth` (`handler.ts`, `browser/`)
- Shared: `apps/supabase/functions/_shared/auth.ts`, `database.ts`, `http.ts`,
  `finance_contracts.ts`
- Config: `apps/supabase/config.toml` (`[auth.oauth_server]`, `[auth.external.google]`),
  `apps/supabase/schemas/access.sql`
- Tests: `impulso-api/auth_test.ts`, `handler_test.ts`, `mcp_test.ts`,
  `impulso-auth/handler_test.ts`, `impulso-auth/browser/client.test.mjs`,
  `functions/tests/oauth_mcp_integration_test.ts`, `functions/tests/integration_test.ts`
