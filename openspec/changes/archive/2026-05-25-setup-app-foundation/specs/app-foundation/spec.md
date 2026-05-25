## ADDED Requirements

### Requirement: Expo Router App Shell
The app foundation SHALL use Expo Router as the primary routing system with a root stack layout and an index route.

#### Scenario: App starts through router entry
- **WHEN** the Expo app starts
- **THEN** the root Expo Router layout is loaded before rendering the index route

#### Scenario: No auth groups are created
- **WHEN** the route tree is inspected for this iteration
- **THEN** it contains no authentication or protected app route groups

### Requirement: Tamagui Provider Foundation
The app foundation SHALL configure Tamagui with the default Tamagui configuration and provide it at the app root.

#### Scenario: Shared UI renders within provider
- **WHEN** a route renders shared UI components
- **THEN** those components can consume Tamagui configuration from the root provider

#### Scenario: Default theme is used
- **WHEN** the initial foundation screen renders
- **THEN** it uses Tamagui defaults without custom brand tokens

### Requirement: Modular Source Structure
The app foundation SHALL organize code into route files, app providers, shared UI primitives, shared form adapters, and feature-owned modules.

#### Scenario: Route files remain thin
- **WHEN** a route renders a screen
- **THEN** the route delegates reusable behavior and presentation to modules under `src`

#### Scenario: Shared primitives are reusable
- **WHEN** a feature needs common layout, text, button, or input behavior
- **THEN** it can compose shared components instead of duplicating local one-off implementations

### Requirement: Typed Form Foundation
The app foundation SHALL support React Hook Form with Zod schema validation and resolver-based validation.

#### Scenario: Form validates through schema
- **WHEN** a form is submitted with invalid values
- **THEN** validation errors are produced from the Zod schema through React Hook Form resolver integration

#### Scenario: Controlled Tamagui input is reusable
- **WHEN** a feature form uses a shared controlled input
- **THEN** the input receives value, change, blur, and error state from React Hook Form without duplicating controller wiring in the feature

### Requirement: Foundation Verification
The app foundation SHALL remain compatible with Nx project workflows for discovery, type checking, linting, tests, and Expo web startup.

#### Scenario: Nx recognizes the app
- **WHEN** Nx project discovery runs
- **THEN** the Expo app remains listed as an Nx project

#### Scenario: Quality checks pass
- **WHEN** the foundation setup is complete
- **THEN** typecheck, lint, and tests pass or any failures are documented with actionable follow-up
