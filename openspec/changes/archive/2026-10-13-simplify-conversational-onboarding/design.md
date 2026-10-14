# Design

## Context

See `proposal.md` for motivation and `specs/conversational-onboarding/spec.md` for the behavioral contract.

`apps/supabase/functions/impulso-api/mcp.ts` currently advertises only `get_session` and `onboard`. Its initialization instructions tell the client to confirm three fields, including an IANA time zone, but provide no naming suggestions or friendly location flow. Each MCP request uses its own stateless server instance.

`get_session` returns the scoped identity and onboarding status. Neither that response nor `VerifiedIdentity` contains location, time zone, or display-name context. The assistant can use relevant information actually available in its client or conversation; the Edge Function cannot independently discover it.

The existing TypeScript onboarding service validates names, normalizes time zones through `Intl`, verifies the zone against PostgreSQL's native catalog, and creates resources with session checks, locks, audit records, and idempotent receipts. Those guarantees already support the resolved values this flow needs.

## Goals / Non-Goals

**Goals:** Keep the conversation easy, define the source and precedence of suggestions, and preserve the existing validated write contract. Require one concise review of all resolved values rather than separate confirmation prompts for every field.

**Non-Goals:** Add location tracking, city-search infrastructure, profile enrichment, persistence for incomplete conversations, an onboarding web form, or new finance/health capabilities. Do not edit the database, OAuth configuration, or existing account preferences as a side effect.

## Decisions

### 1. Improve the existing MCP guidance without adding another tool

Update initialization instructions and relevant descriptions in `mcp.ts`. Keep `get_session` input/output shapes and `onboard`'s four strict inputs unchanged. Replace the outdated reference to a "local version" with environment-neutral wording while preserving the fact that only account setup is currently available.

The client orchestrates the conversation; the Edge Function receives only final accepted values. A new preparation tool, draft table, or browser step would add state without giving the backend the user's client context. These alternatives are unnecessary for this change.

### 2. Provide a small stable menu with an easy recommendation

When the user has not chosen a workspace name, explain its purpose in one sentence and present `Orbit` (recommended), `Momentum`, and `Launchpad`, plus the ability to supply a custom name. Accept a displayed number, a name, or acceptance of the explicitly recommended choice. Preserve an already supplied custom name. Ask for the user's display name only when it is missing; do not derive it from email.

All authored guidance, tool descriptions, technical documentation, and system-generated defaults remain in English. User-provided names retain their language and content, with only the service's existing whitespace normalization. The conversational assistant can explain the choices to the user without treating internal identifiers as required user input.

### 3. Resolve time-zone hints in the conversation with explicit precedence

Use, in order:

1. The user's explicit preference or unambiguous relevant city/country.
2. A valid time-zone hint actually available from the current client context.
3. A short question asking for a city and any necessary country or region.

The client hint is a preference suggestion, not verified residence or an authorization claim. Never infer location from language, email, IP, the assistant execution host, or the Supabase region. Never assume a zone is available just because another client exposed one previously. Do not silently fall back to UTC. Do not add location permissions or forward raw client context to the backend.

The assistant resolves a stated city to an IANA identifier and shows a familiar city or regional label. If a city is ambiguous or a mapping is uncertain, ask for a region/country or nearby major city. A country covering several zones or a fixed offset alone is insufficient. Use named zones rather than fixed offsets so seasonal time changes remain supported.

A correction such as "I live in Madrid, Spain" replaces a Mexico City suggestion with the proposed `Europe/Madrid` value internally. Existing runtime and PostgreSQL validation remain authoritative for the final identifier; do not broaden the write endpoint to accept arbitrary place names.

### 4. Review the complete proposal once before writing

Keep pending choices in conversation context. Once the display name, workspace choice, and zone are resolved, present a compact review and a clear continue/change choice. For example:

> I'll set up your profile as Alex, name your workspace Orbit, and use Mexico City time. Would you like to continue or change anything? You can name another city if needed.

This example assumes Alex was supplied by the user and Mexico City time was available as a valid suggestion. It is not a global default. A location correction triggers a revised review; choosing a name alone or cancelling never calls `onboard`.

After acceptance, send only the existing fields with the canonical IANA identifier. Identical retries reuse the same UUID and payload. A changed submission needs a fresh UUID; an uncertain prior result must first be checked with `get_session`. The onboarding endpoint already recovers an authorized existing workspace without renaming it, and this change adds no preference-update operation.

### 5. Separate protocol coverage from conversational behavior checks

Extend `mcp_test.ts` to verify that initialization/discovery deliver the intended guidance and retain strict, compatible tools. Retain existing session, authorization, normalization, and retry coverage. Add a short scenario checklist in `docs/edge-functions.md` covering the recommended name, custom names, missing/conflicting context, ambiguous locations, a city correction, acceptance, cancellation, and an already-complete account.

Protocol tests can verify what the server advertises and accepts; they cannot prove every external assistant follows instructions. Validate the conversational scenarios through a representative connected client without submitting a real account write during this proposal. Use existing disposable local fixtures for write regression checks during implementation.

## Risks / Trade-offs

- [Clients can ignore server instructions] -> Make tool descriptions consistent, test the advertised guidance, and review a representative conversation. Keep all authorization and input validation on the server; do not describe prompt instructions as a server-enforced consent mechanism.
- [Context is absent, stale, or conflicts with a preference] -> State the proposed city-based time and wait for acceptance; prefer the user's correction and ask one targeted question when unresolved.
- [The assistant maps a place incorrectly] -> Clarify ambiguous places, use a final city-based review, validate the IANA identifier server-side, and avoid building an unsupported global city catalog.
- [Retries or changed choices create confusion] -> Preserve the current UUID/payload rules and check session state before retrying changed values after an uncertain result.

## Migration Plan

Implement the guidance, tests, and documentation after this proposal is reviewed. Run the existing Nx function checks and disposable local OAuth/MCP integration suite. Re-deploy only `impulso-api` to the already configured remote Impulso project when applying this change; no schema or authorization-site publication is required. Refresh client discovery or reconnect only if needed to obtain updated metadata. Roll back by redeploying the previous function bundle; no data migration or preference rewrite is involved.
