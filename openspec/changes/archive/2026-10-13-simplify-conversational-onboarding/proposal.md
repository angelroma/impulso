# Proposal

## Why

The current conversational setup asks users to invent a workspace name and supply an IANA time zone. Impulso should offer useful choices and a human-readable time-zone suggestion so a user can complete setup with a short confirmation instead of knowing technical identifiers.

## What Changes

- Guide clients to call `get_session` first and offer setup only when onboarding is required.
- Offer three concise workspace names, with one recommendation and a custom-name option. Initial English suggestions are `Orbit` (recommended), `Momentum`, and `Launchpad`; preserve a name the user already supplied.
- Suggest a time zone from available user/client context, giving precedence to the user's stated preference. When context is missing or ambiguous, ask for a city and, when necessary, country or region.
- Explain the proposed zone with a familiar city or regional label. Let users continue, choose another name, or describe a different location without typing an IANA identifier.
- Present the resolved display name, workspace name, and time zone together and wait for acceptance before calling `onboard`. Keep the canonical IANA value inside the existing tool contract.
- Add protocol regression checks and conversational acceptance cases, and update setup documentation.

## Capabilities

### New Capabilities

- `conversational-onboarding`: Session-aware account setup with workspace-name choices, contextual time-zone suggestions, natural-language corrections, and confirmation before creation. This formalizes and improves the existing implementation; the project currently has no main capability specs.

### Modified Capabilities

None.

## Impact

- Primary implementation surface: server instructions and tool descriptions in `apps/supabase/functions/impulso-api/mcp.ts`.
- Verification surfaces: `mcp_test.ts`, existing onboarding validation/integration coverage, and a small conversational acceptance checklist.
- Documentation surfaces: `README.md` and `docs/edge-functions.md`.
- Keep both existing tool names and their input/output shapes compatible. Keep the transactional onboarding service, authorization boundary, and idempotency behavior.
- No database migration, SQL routine, extra tool, external location service, browser onboarding form, OAuth permission, or Finance/Health operation is needed. This change does not provision the current user's account.
