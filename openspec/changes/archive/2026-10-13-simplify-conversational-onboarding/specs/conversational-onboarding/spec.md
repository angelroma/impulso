# Spec Delta

## Purpose

Help new Impulso users configure their personal workspace through a short conversation with useful name choices, understandable time-zone suggestions, and confirmation before account setup.

## ADDED Requirements

### Requirement: Setup follows the current account state

The assistant SHALL consult `get_session` before offering initial setup. It SHALL offer setup when the status is `required`, skip setup when it is `complete`, and explain an `unavailable` status without attempting creation.

#### Scenario: First use requires setup

- **WHEN** a user asks Impulso to do something and their session reports onboarding as `required`
- **THEN** the assistant guides them through initial setup while retaining the original request as context
- **AND** it does not claim that the original request has been completed

#### Scenario: Setup is complete or unavailable

- **WHEN** the session reports onboarding as `complete` or `unavailable`
- **THEN** the assistant does not offer to create another initial workspace
- **AND** it explains unavailability when that is the reported state

### Requirement: Workspace naming offers a small ready-made choice

When a workspace name has not been supplied, the assistant SHALL explain that the workspace organizes the user's data and offer exactly three short English suggestions: `Orbit`, `Momentum`, and `Launchpad`. It SHALL recommend `Orbit`, allow selection by name or displayed number, and allow a custom name without requiring one.

#### Scenario: User prefers a suggested name

- **WHEN** the user selects `Momentum`, its displayed number, or the recommended option
- **THEN** the assistant resolves that selection to the corresponding workspace name
- **AND** the user is not asked to invent or retype a name
- **AND** selecting a name alone does not authorize account creation

### Requirement: User-provided names are preserved

The assistant SHALL ask for a display name only when it is missing and SHALL include it in the final review. It SHALL use explicitly supplied display and workspace names without translating or replacing them with generated suggestions, subject to the existing name validation and surrounding-whitespace normalization.

#### Scenario: User supplies a custom workspace name

- **WHEN** the user supplies `Mi Universo` as the workspace name
- **THEN** the final review and onboarding request preserve `Mi Universo`
- **AND** English default names do not replace the user's choice

#### Scenario: Display name is missing

- **WHEN** the user has selected a workspace but has not supplied a display name
- **THEN** the assistant asks how they want to be addressed before completing setup
- **AND** it does not invent a name from an email address or assume profile details that were not supplied

### Requirement: Time-zone suggestions use available relevant context

The assistant SHALL prefer an explicit user time-zone preference or unambiguous stated location over a client-provided time-zone hint. It SHALL present a valid contextual zone as a suggestion using a city or regional label and offer to continue or change it. It MUST NOT present a hint as proof of the user's location.

#### Scenario: Client provides a usable zone

- **WHEN** the client provides `America/Mexico_City` and no conflicting user preference exists
- **THEN** the assistant suggests Mexico City time and asks whether to continue or change it
- **AND** it does not require the user to type `America/Mexico_City`

#### Scenario: User preference overrides a client hint

- **WHEN** the client suggests Mexico City time and the user says to use Madrid, Spain
- **THEN** the assistant proposes Madrid time for review
- **AND** the client hint is not used for creation

### Requirement: Missing or uncertain location receives a focused clarification

When no reliable suggestion is available, the assistant SHALL ask for a city and any necessary country or region. Ambiguous cities, multi-zone countries, fixed offsets, and uncertain mappings SHALL receive a focused clarification. The assistant MUST NOT silently default to UTC or infer a zone from email, language, IP address, or server location.

#### Scenario: No user or client context exists

- **WHEN** no usable time-zone hint or explicit location is available
- **THEN** the assistant asks which city and country to use for the user's time
- **AND** onboarding is not submitted with a guessed zone

#### Scenario: Place is ambiguous

- **WHEN** the user replies with an ambiguous city or a country containing multiple time zones
- **THEN** the assistant asks for the relevant region or city before proposing a zone
- **AND** no arbitrary matching zone is selected

### Requirement: Location corrections use everyday language

The assistant SHALL accept a city or region as a time-zone correction and resolve it to an appropriate IANA identifier before calling `onboard`. It SHALL confirm the result using a city or regional label. When a mapping cannot be resolved confidently, it SHALL ask for clarification without requiring the user to learn or enter an IANA identifier.

#### Scenario: User corrects the suggested location

- **WHEN** the user responds to the suggestion with `I live in Madrid, Spain`
- **THEN** the assistant updates the review to Madrid time
- **AND** an accepted onboarding request uses `Europe/Madrid` internally

#### Scenario: A location cannot be resolved confidently

- **WHEN** a location reply does not identify a reliable time-zone mapping
- **THEN** the assistant asks for a country, region, or nearby major city
- **AND** it does not repeatedly ask the user to supply an IANA identifier

### Requirement: Creation requires acceptance of the resolved setup

Before creating resources, the assistant SHALL present a concise review containing the resolved display name, workspace name, and human-readable time zone, and ask whether to continue or change them. It SHALL call `onboard` only after acceptance of all resolved values. A correction SHALL be reflected in a revised review before creation; cancellation SHALL perform no write.

#### Scenario: User accepts the complete review

- **WHEN** all three values are shown and the user replies to continue
- **THEN** the assistant calls `onboard` with those accepted values
- **AND** it does not ask the user to repeat the same values or confirm each one separately

#### Scenario: User changes or declines the review

- **WHEN** the user requests a different location or workspace name, or cancels setup
- **THEN** the assistant does not call `onboard` for the previous review
- **AND** a correction is shown in a revised review, while cancellation leaves account resources uncreated

### Requirement: Guided setup preserves the existing tool contract

The tools SHALL retain their existing names and input/output shapes. `onboard` SHALL receive a UUID `request_id`, accepted `display_name`, accepted `workspace_name`, and validated canonical IANA `timezone`. Identical retries SHALL reuse the request ID and payload; changed submitted values SHALL use a fresh request ID. No contextual hints SHALL replace authenticated identity or authorization.

#### Scenario: Canonical input is submitted after friendly confirmation

- **WHEN** the user accepts a review using a city-based label
- **THEN** the tool request carries a valid canonical IANA zone rather than the city label
- **AND** the existing backend validates the names, time zone, session, and access rules

#### Scenario: A request is retried

- **WHEN** an accepted onboarding call is retried after an uncertain response
- **THEN** the assistant reuses the same request ID and unchanged resolved payload
- **AND** a later changed submission uses a new request ID and does not silently rename or relocate an existing workspace
