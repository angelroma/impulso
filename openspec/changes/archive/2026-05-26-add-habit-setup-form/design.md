## Context

The app currently routes users from `Add tracker` to a custom goal starter form where they enter a name and choose a tracking method. Selecting `Habit` currently behaves like the other methods: it marks the choice in place and lets the starter submit a basic tracker record. The desired product direction is different for Habit: choosing it should continue into a richer setup screen inspired by Strides, including goal, period, due schedule, and optional behavior toggles.

The existing local tracker database stores only base tracker records. Habit setup introduces method-specific values, so this change needs a small persistence extension while keeping reminders and tags out of scope.

## Goals / Non-Goals

**Goals:**
- Continue from the custom goal starter to a Habit setup form when `Habit` is selected.
- Preserve the starter habit name as the Habit setup screen title and eventual tracker name.
- Let users configure a habit goal count, time period, start date, due frequency/routine, and the Bad Habit, Set Goal Streak, and Log with Notes toggles.
- Persist the base tracker and its Habit-specific configuration when the user taps `Finish`.
- Show coming-soon placeholders for Reminders and Tags.
- Keep Habit setup UI feature-owned under the tracker feature.

**Non-Goals:**
- Implement Average, Project, or Target setup forms.
- Implement reminder scheduling, notification permissions, or tag management.
- Clone Strides branding or visual design exactly.
- Add analytics, sync, or cloud persistence.

## Decisions

1. Route Habit selection into a dedicated feature-owned setup state.

The current `AddTrackerScreen` already uses local state to show the custom goal starter, so the first implementation can add a Habit setup state or child component without forcing a route hierarchy migration. If the route tree is refactored later, the Habit setup component should remain reusable.

Alternative considered: add a new Expo Router file immediately. That gives stronger URL/back-stack semantics, but it also expands route structure before the app has multiple type-specific setup screens.

2. Store Habit-specific configuration separately from the base tracker record.

The base tracker table should continue to represent shared tracker identity: id, name, method, and timestamps. Habit-only fields fit better in a related Habit configuration record keyed by tracker id so Average, Project, and Target can add their own configuration later without widening the base table with nullable fields.

Alternative considered: add all Habit fields directly to `trackers`. That is simpler now, but it makes the base table method-specific and awkward as more tracker types arrive.

3. Treat Reminders and Tags as visible disabled rows.

Users should see where these settings will live, but the rows should clearly communicate `Soon` or `Coming soon` and must not open empty screens. This keeps the screen shape aligned with the reference without pretending unsupported features exist.

Alternative considered: hide Reminders and Tags until implemented. That keeps the form smaller, but the user explicitly asked for placeholders.

4. Use modal-style help for the question-mark affordances.

The reference screenshots show help as a small overlay with a blue title bar and explanatory body. A lightweight modal or alert-like component can satisfy the behavior while staying consistent with existing React Native/Tamagui primitives.

Alternative considered: inline helper text under each row. That is easier, but it changes the requested interaction and makes the setup form visually heavier.

5. Present Habit setup as a short wizard and use modal surfaces for option-heavy rows.

The Habit setup flow has two distinct decisions: basic definition, then schedule/logging preferences. Splitting those into wizard steps keeps the screen focused and gives future tracker types a clear branching pattern. Option-heavy rows such as `Due` should open modal surfaces so the user can make a bounded choice without losing their place in the wizard.

Alternative considered: keep every field on one scrollable form. That is simple, but it becomes crowded quickly and makes future type-specific setup flows harder to reason about.

6. Use native date controls.

Start date selection should use `@react-native-community/datetimepicker` on native platforms and a native browser date input on web. This avoids plain text date entry while preserving platform-appropriate behavior.

Alternative considered: keep a text field with an ISO date value. That is easy to persist, but it is error-prone and does not feel native.

7. Keep tracker creation out of the starter form.

The starter form now exists to capture the name and route the user into a method-specific setup path. Showing a `Create tracker` action there competes with the wizard and creates two possible completion points. The primary action should live at the bottom of the active wizard step, with final creation only available on the last step.

Alternative considered: keep direct creation for non-Habit methods. That preserved older behavior, but it made the flow inconsistent before those method-specific setup screens exist.

## Risks / Trade-offs

- Habit setup persistence increases migration scope -> Keep Habit fields in a separate configuration table and add focused repository tests.
- Local state navigation can become crowded inside `AddTrackerScreen` -> Extract Habit setup into feature-owned components even if the initial transition uses local state.
- Date and frequency controls can become platform-specific quickly -> Start with simple selectable controls and stable serialized values, then improve native pickers later.
- Coming-soon rows may look actionable -> Render them as disabled rows with clear secondary text.
