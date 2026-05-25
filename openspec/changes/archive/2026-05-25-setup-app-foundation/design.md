## Context

The current Expo application is the generated Nx starter app: `index.js` registers a single `src/app/App.tsx`, and the UI is a large screen component with local React Native styles. There are no active OpenSpec capabilities and no established app-level patterns for routing, shared UI, or forms.

This change establishes the baseline architecture for future feature work in `apps/cross-platorm-app`. It introduces Expo Router for file-based navigation, Tamagui for cross-platform UI primitives and theming, and React Hook Form with Zod for typed form state and validation.

## Goals / Non-Goals

**Goals:**

- Provide a stack-based Expo Router setup without auth route groups.
- Configure Tamagui using the default Tamagui config first, keeping custom brand tokens out of this iteration.
- Add a provider layer that centralizes Tamagui and app-level rendering concerns.
- Add reusable shared UI primitives built around composition instead of feature-specific one-off components.
- Add form adapters that connect Tamagui inputs to React Hook Form while using Zod schemas for validation.
- Keep route files thin by delegating screen behavior to feature or shared modules.

**Non-Goals:**

- No authentication, protected routes, or auth/app route group split.
- No custom design token system beyond Tamagui defaults.
- No backend integration or persisted form submission flow.
- No broad product feature buildout beyond a foundation/demo surface proving the architecture.

## Decisions

### Use Expo Router as the app entry and route boundary

The app will move from manually registering `src/app/App.tsx` to an Expo Router root. Route files will live in `apps/cross-platorm-app/app`, with `app/_layout.tsx` owning the root stack and app providers. In this Nx monorepo, the app entry should create an explicit `ExpoRoot` from `require.context('./app')` so Metro receives the route context reliably.

Alternative considered: keep a single root component and add navigation later. This would delay the route boundary and make early feature screens more likely to accumulate inside one root tree.

### Keep routing simple with a root stack

The first routing shape will use a simple stack with an `index` route. Auth route groups and app shell groups are intentionally excluded until product requirements need them.

Alternative considered: create `(auth)` and `(app)` groups immediately. That would add structure before behavior exists and make the foundation feel heavier than this iteration requires.

### Use Tamagui defaults first

Tamagui will be configured with its default config and provider setup. The implementation should wire the required Metro/Babel/Tamagui configuration and load any required fonts/assets in the provider layer.

Alternative considered: create custom tokens, themes, and brand primitives now. The brand system is not yet defined, so defaults reduce churn while preserving a clear upgrade path.

### Wrap React Hook Form integrations in shared adapters

Feature forms should use typed Zod schemas and React Hook Form, but Tamagui input bindings should be hidden behind shared adapters such as controlled text fields and field error display components. This keeps feature forms declarative and avoids duplicating `Controller` boilerplate.

Alternative considered: use `Controller` directly in every form. That works but spreads low-level wiring across features and makes component behavior harder to standardize.

### Organize by route boundary, shared foundation, and feature ownership

The code layout should separate:

- `app/`: Expo Router route files and layouts only.
- `src/application/`: app composition such as providers. Expo Router can reserve `src/app` as a route root, so application composition lives outside that path.
- `src/shared/ui/`: reusable Tamagui-based primitives.
- `src/shared/forms/`: form adapters and validation helpers.
- `src/features/<feature>/`: feature screens, forms, hooks, and components.

Alternative considered: component folders by type only. That becomes difficult to scale once product features have their own business behavior.

## Risks / Trade-offs

- Tamagui + Nx + Expo Router configuration can be sensitive to Metro/Babel resolution -> verify with typecheck, lint, unit tests, and an Expo web start with a cleared cache.
- Default Tamagui theme may not match the eventual product identity -> keep custom tokens out of scope but avoid hardcoding colors in feature components.
- Form adapters can become too abstract if overbuilt early -> implement only the first text field/error primitives needed to prove the pattern.
- Expo Router changes the app entry path -> keep `index.js` minimal and ensure package/app config points to the correct entry flow.

## Migration Plan

1. Add and configure dependencies for Expo Router, Tamagui, React Hook Form, Zod, and resolver support.
2. Move root rendering to Expo Router with `app/_layout.tsx` and `app/index.tsx`, keeping provider modules outside `src/app` so the root `app/` route directory is unambiguous.
3. Replace generated starter UI with a small foundation screen composed from shared components.
4. Add shared provider, UI, and form adapter modules.
5. Verify Nx project discovery, typecheck, lint, tests, and Expo web startup.

Rollback is straightforward before product features depend on the foundation: revert the dependency/configuration changes and restore the previous `index.js` + `src/app/App.tsx` entry.

## Open Questions

- Which product feature should become the first real feature module after the foundation is in place?
- Should custom brand tokens be proposed as a separate follow-up once visual identity is clearer?

## Validation Notes

- Expo Router is wired through a custom `ExpoRoot` entry because the default `expo-router/entry` did not resolve route context reliably in this Nx workspace during web validation.
- App composition lives under `src/application` because leaving an empty `src/app` path causes Expo Router to prefer that directory over the root `app/` routes.
- `npx expo install --check` reports dependencies are aligned with the installed Expo SDK after pinning React, React DOM, and React Test Renderer to `19.1.0`.
- Chrome validation confirmed the route renders the foundation screen at `http://localhost:8082`; form validation is covered by the automated Jest test because Chrome automation detached while filling Tamagui web inputs after validation rerenders.
