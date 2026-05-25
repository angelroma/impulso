## Why

The Expo app is still using the generated Nx starter screen and has no shared UI, routing, or form architecture. Establishing the foundation now will keep future feature work modular, typed, and consistent across native and web targets.

## What Changes

- Replace the generated single-screen app shell with an Expo Router stack-based foundation.
- Add Tamagui as the default UI system using its default configuration for this iteration.
- Add React Hook Form with Zod schema validation and resolver support for typed, reusable form workflows.
- Introduce a modular source layout for app providers, shared UI primitives, form adapters, and feature-owned screens/components.
- Add initial composition-oriented components that keep route files thin and encourage feature modules to compose shared primitives.
- Keep authentication route groups out of scope for this iteration.

## Capabilities

### New Capabilities

- `app-foundation`: Defines the baseline app routing, provider, UI, and form architecture for future feature development.

### Modified Capabilities

- None.

## Impact

- Affects the Expo app under `apps/cross-platorm-app`.
- Adds runtime dependencies for Expo Router, Tamagui, React Hook Form, Zod, and React Hook Form resolvers.
- Updates Expo entry/configuration, Metro/Babel/Tamagui setup, and TypeScript-aware app structure.
- Replaces generated starter UI with maintainable foundation components and route files.
