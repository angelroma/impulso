## Why

The app needs a persistent navigation surface so users can move into goal setup and app options without those controls competing with the main screen content. Adding a drawer now establishes the navigation pattern before more feature screens accumulate.

## What Changes

- Add a drawer-based app shell for the Expo app.
- Add a `Goal settings` drawer section with an `Add tracker` submenu item and tracker icon.
- Add an `Options` drawer section with a `Settings` submenu item and settings icon.
- Keep route files thin by delegating reusable drawer content and item presentation to source modules.
- Add any drawer runtime dependencies required by the selected Expo Router / React Navigation integration.

## Capabilities

### New Capabilities

- `app-navigation`: Defines the app drawer shell, grouped drawer sections, submenu items, and expected navigation affordances.

### Modified Capabilities

- None.

## Impact

- Affects the Expo Router root layout and route tree under `apps/cross-platorm-app/app`.
- Adds navigation UI modules under `apps/cross-platorm-app/src`.
- May add React Navigation drawer and gesture-handler dependencies if they are not already declared.
- Requires focused tests for drawer structure and routing behavior, plus existing typecheck, lint, and test workflows.
