## 1. Dependencies and Configuration

- [x] 1.1 Install Expo Router dependencies compatible with the current Expo SDK.
- [x] 1.2 Install Tamagui packages using the default Tamagui configuration path.
- [x] 1.3 Install React Hook Form, Zod, and `@hookform/resolvers`.
- [x] 1.4 Update Expo app entry/configuration for Expo Router while preserving Nx Expo workflows.
- [x] 1.5 Update Metro/Babel/Tamagui configuration required for native and web rendering.

## 2. Router and Provider Foundation

- [x] 2.1 Create `apps/cross-platorm-app/app/_layout.tsx` with a root stack layout.
- [x] 2.2 Create `apps/cross-platorm-app/app/index.tsx` as the initial route.
- [x] 2.3 Create an app provider module under `src/application/providers` for Tamagui and app-wide rendering concerns.
- [x] 2.4 Remove or retire the generated starter `src/app/App.tsx` entry path after the router route renders successfully.

## 3. Shared UI and Composition Components

- [x] 3.1 Create shared UI primitives under `src/shared/ui` for screen layout, buttons, text, and text input composition.
- [x] 3.2 Ensure shared primitives use Tamagui props and tokens rather than local React Native stylesheet duplication.
- [x] 3.3 Build a small foundation screen by composing shared primitives from the index route.

## 4. Form Foundation

- [x] 4.1 Create shared form adapter modules under `src/shared/forms`.
- [x] 4.2 Implement a controlled text field adapter that connects Tamagui input behavior to React Hook Form.
- [x] 4.3 Add a small Zod-backed example form or form module that proves resolver validation and error rendering.
- [x] 4.4 Keep form schema, form UI, and route rendering separated so future feature forms can reuse the pattern.

## 5. Verification

- [x] 5.1 Verify Nx project discovery still lists the Expo app.
- [x] 5.2 Run typecheck for the Expo app.
- [x] 5.3 Run lint for the Expo app.
- [x] 5.4 Run tests for the Expo app and update starter tests for the new foundation screen.
- [x] 5.5 Start the Expo web target with a cleared cache and confirm the route renders through Tamagui.
- [x] 5.6 Document any remaining setup caveats or follow-up tasks discovered during validation.
