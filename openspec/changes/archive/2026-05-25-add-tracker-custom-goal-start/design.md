## Context

The app already has a drawer shell with an `Add tracker` item that routes to `/add-tracker`. That destination currently renders lightweight placeholder copy, while the shared UI and form foundations are already available through Tamagui, React Hook Form, and reusable input/button components.

This change turns the add-tracker destination into the first step of tracker creation without committing to the full data model or type-specific workflows. The user begins from a `Custom goal` option, then reaches a starter form that captures the goal or habit name and presents the available tracking methods.

## Goals / Non-Goals

**Goals:**
- Make `/add-tracker` useful by showing a selectable `Custom goal` starting option.
- Present clear copy that frames a custom goal as a habit, number, or project.
- Move the user from the option screen to a starter form after selecting `Custom goal`.
- Render the starter form input and four tracking method choices exactly within this iteration's scope.
- Keep route files thin and feature behavior owned under `src/features/tracker`.

**Non-Goals:**
- Persist tracker data.
- Submit or create a tracker.
- Add detailed forms for habit, average, project, or target configuration.
- Add validation beyond what is needed to render the starter form safely.
- Redesign drawer navigation.

## Decisions

1. Keep `/add-tracker` as the drawer entry point and implement the initial chooser there.

The existing drawer contract already routes users to `/add-tracker`, so the first screen should become the tracker creation entry point instead of adding another drawer item. This preserves current navigation behavior and keeps the change focused.

Alternative considered: add a new drawer item for custom goals. That would duplicate intent in the drawer and make the first tracker creation workflow feel like app navigation rather than a task flow.

2. Prefer a nested route for the custom-goal starter form if Expo Router structure stays simple.

A nested route such as `/add-tracker/custom-goal` gives the starter form an addressable screen and native back behavior. If implementing the nested route introduces awkward file structure for the current app, local screen state inside `AddTrackerScreen` is acceptable for this iteration as long as the user-visible flow and tests remain the same.

Alternative considered: always use local component state. That is faster, but future tracker type setup screens will likely benefit from route-level separation.

3. Represent tracking methods as selectable options without downstream behavior.

The form should present `Habit`, `Average`, `Project`, and `Target` as choices with their short descriptions. Selection can update local UI state for accessibility and testability, but it must not navigate into type-specific setup or save data yet.

Alternative considered: leave method options as static text. That would satisfy display requirements, but making them selectable establishes the next interaction contract without expanding scope.

## Risks / Trade-offs

- Future tracker setup may need a different route hierarchy -> Keep components feature-owned and small so route structure can evolve.
- The "2 options" wording from exploration is ambiguous because only `Custom goal` was defined -> Implement only the defined option and avoid inventing a second workflow.
- Selecting a tracking method without a next step could feel incomplete -> Use neutral UI state and avoid submit language until later iterations add per-type configuration.
