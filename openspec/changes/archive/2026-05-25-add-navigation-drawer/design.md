## Context

The app currently uses a root Expo Router `Stack` with `headerShown: false` and a single index route that renders the foundation screen. There is no navigation shell yet, so feature entry points would either accumulate on the home screen or require ad hoc route controls.

This change introduces the first persistent navigation pattern: a drawer with grouped sections for goal-related actions and app options.

## Goals / Non-Goals

**Goals:**

- Replace the root stack shell with a drawer-capable app shell.
- Present drawer content as grouped sections: `Goal settings` and `Options`.
- Provide submenu-style drawer items for `Add tracker` and `Settings`, each with a recognizable icon.
- Keep Expo Router route files thin and move reusable drawer presentation into source modules.
- Preserve the existing foundation route while adding navigation entry points for future feature screens.

**Non-Goals:**

- Implement tracker creation workflows or settings forms.
- Add authentication, protected routes, or role-based drawer visibility.
- Define long-term information architecture beyond the requested drawer groups.
- Add branded theme tokens or visual redesign beyond the drawer controls.

## Decisions

### Use Expo Router drawer integration

Use Expo Router's drawer support as the app shell so navigation stays aligned with the existing file-based routing setup. This keeps route ownership in `apps/cross-platorm-app/app` while allowing drawer item rendering to live in source modules.

Alternative considered: build a custom Tamagui overlay drawer without React Navigation. That would avoid a navigation dependency but would duplicate routing, gestures, accessibility, and platform behavior that the navigation stack already provides.

### Add explicit placeholder routes for drawer destinations

Create route entries for `Add tracker` and `Settings` even if the first implementation renders lightweight placeholder screens. This makes drawer interactions testable and prevents the drawer from containing non-functional items.

Alternative considered: render drawer items as disabled placeholders. That would satisfy visual structure but would not establish route contracts for upcoming tracker and settings work.

### Use custom drawer content for grouped sections

Implement a small custom drawer content component that renders section labels and submenu items. The built-in drawer list is useful for flat navigation, but the requested `Goal settings` and `Options` grouping needs explicit structure.

Alternative considered: encode group names in screen labels. That would be quicker but would make the drawer harder to scan and test as the menu grows.

### Keep icons focused and dependency-aware

Prefer an existing compatible icon source if the project already includes one by implementation time. If not, add a focused icon package compatible with React Native and Tamagui, then use a tracker-style icon for `Add tracker` and a settings gear icon for `Settings`.

Alternative considered: hand-draw icons with inline SVG. That would avoid another dependency but would create one-off assets outside a reusable icon system.

## Risks / Trade-offs

- Drawer dependencies can require native gesture setup -> verify Expo web and native-compatible startup after adding packages.
- Placeholder destination screens may feel incomplete -> keep them minimal and clearly scoped until tracker/settings features are proposed.
- A custom drawer content component adds maintenance surface -> keep it data-driven so new sections/items can be added without duplicating layout.
- Web behavior may differ from native drawer gestures -> include web-rendered tests for structure and rely on navigation packages for native gesture behavior.

## Migration Plan

1. Add required drawer and gesture dependencies.
2. Update the root layout to use a drawer shell.
3. Add drawer destination routes for `Add tracker` and `Settings`.
4. Add reusable drawer content modules and focused tests.
5. Run typecheck, lint, tests, and Expo web startup verification.

Rollback is straightforward: restore the root stack layout and remove the new drawer routes/modules if the drawer shell causes startup or navigation regressions.

## Open Questions

- Which tracker icon should be treated as the final product metaphor: target, chart, plus-circle, or activity?
- Should drawer destinations initially be placeholder screens or immediately connect to feature-specific proposals for tracker creation and settings?
