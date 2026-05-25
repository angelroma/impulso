## Why

The add-tracker drawer destination currently proves navigation but does not yet help a user begin defining what they want to track. This change gives the route a first usable creation step while deliberately postponing the deeper per-tracker setup workflows.

## What Changes

- Replace the add-tracker placeholder content with a starting screen that presents a `Custom goal` option.
- Show `Custom goal` with supporting copy indicating it can become a habit, number, or project tracker.
- When the user selects `Custom goal`, move them to a starter form for naming the goal or habit.
- The starter form asks `How do you want to track this?` and presents four tracking methods:
  - `Habit` - repeating action
  - `Average` - repeating number
  - `Project` - actions by date
  - `Target` - number by date
- Stop this iteration at method selection; detailed method-specific forms, validation rules, persistence, and tracker creation are out of scope.

## Capabilities

### New Capabilities
- `tracker-creation-start`: Covers the initial add-tracker chooser and starter form used before any specific tracker type is configured.

### Modified Capabilities
- `app-navigation`: The existing add-tracker route remains the drawer destination, but its reachable route content changes from placeholder copy to the first tracker creation step.

## Impact

- Affects the `add-tracker` route and tracker feature screen modules.
- May introduce one nested tracker creation route or local screen state for the custom-goal starter form.
- Uses existing shared Tamagui UI and form primitives where appropriate.
- Adds focused tests for the add-tracker chooser, custom-goal transition, starter input, and tracking method options.
