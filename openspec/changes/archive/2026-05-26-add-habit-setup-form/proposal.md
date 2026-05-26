## Why

Selecting `Habit` currently only marks the method inside the custom goal starter, which leaves the user without the detailed setup screen needed to configure how the habit should work. The app needs a Habit-specific form so users can continue from the starter choice into a concrete habit configuration flow inspired by Strides-style habit setup.

## What Changes

- Redirect the user from the custom goal starter form to a Habit setup screen when they select the `Habit` tracking method.
- Add a Habit setup form that shows the selected habit name and supports configuring goal count, time period, start date, due schedule, and optional tracking behaviors.
- Support time period choices for `Day`, `Week`, `Month`, `Quarter`, and `Year`.
- Add a due schedule screen or subflow with weekday frequency selection and routine choices: `Any Time`, `Morning`, `Afternoon`, and `Evening`.
- Add placeholders for `Reminders` and `Tags`, both marked as coming soon.
- Add help affordances for `Bad Habit`, `Set Goal Streak`, and `Log with Notes` using the provided explanatory text.
- Keep this change focused on the Habit setup flow and do not add full reminder or tag management.
- Persist the Habit setup values needed to recreate the configured habit after the user taps `Finish`.

## Capabilities

### New Capabilities
- `habit-setup`: Covers the Habit-specific setup form, its configurable fields, due schedule subflow, coming-soon placeholders, and contextual help text.

### Modified Capabilities
- `tracker-creation-start`: Changes the `Habit` method selection behavior so it continues into Habit setup instead of remaining on the starter form.
- `local-tracker-database`: Adds persistence for Habit-specific setup values associated with a local tracker.

## Impact

- Affects the tracker creation screens under `apps/cross-platorm-app/src/features/tracker`.
- May add feature-owned Habit setup components and route/state structure for the due schedule subflow.
- Updates tests that currently assert selecting a method stays on the starter form.
- Does not require new third-party dependencies.
- Expands the local tracker database schema with Habit configuration fields or a related Habit configuration table.
