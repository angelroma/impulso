## 1. Route And Screen Structure

- [x] 1.1 Decide whether the custom goal starter form uses a nested Expo Router route or local add-tracker screen state, keeping the user-visible flow aligned with the specs.
- [x] 1.2 Update the add-tracker route content so it delegates to tracker feature-owned screen components under `src/features/tracker`.

## 2. Add Tracker Entry Screen

- [x] 2.1 Replace placeholder add-tracker copy with a selectable `Custom goal` option.
- [x] 2.2 Add supporting text that communicates `Custom goal` can be used for a habit, number, or project.
- [x] 2.3 Wire activation of `Custom goal` to show the custom goal starter form.

## 3. Custom Goal Starter Form

- [x] 3.1 Add an input labeled `Name your goal or habit`.
- [x] 3.2 Add the question `How do you want to track this?`.
- [x] 3.3 Render the `Habit` option with `repeating action` supporting text.
- [x] 3.4 Render the `Average` option with `repeating number` supporting text.
- [x] 3.5 Render the `Project` option with `actions by date` supporting text.
- [x] 3.6 Render the `Target` option with `number by date` supporting text.
- [x] 3.7 Ensure selecting a method does not create a tracker or navigate into type-specific setup.

## 4. Verification

- [x] 4.1 Add or update tests for the add-tracker custom goal option and transition into the starter form.
- [x] 4.2 Add or update tests for the starter input, tracking question, and four method choices.
- [x] 4.3 Run the relevant app test and typecheck commands, documenting any failures that require follow-up.
