## 1. Data Model And Repository

- [x] 1.1 Add a Habit setup persistence model keyed by tracker id with goal count, time period, start date, weekdays, routine, Bad Habit, Set Goal Streak, and Log with Notes fields.
- [x] 1.2 Generate or update local Drizzle migrations for the Habit setup persistence model.
- [x] 1.3 Extend tracker data types and repository inputs/results to create a Habit tracker with its setup values through the repository boundary.
- [x] 1.4 Add repository tests for saving and reading persisted Habit setup values.

## 2. Habit Setup Flow

- [x] 2.1 Extract or add feature-owned Habit setup screen components under the tracker feature.
- [x] 2.2 Update the custom goal starter so selecting `Habit` with a valid name opens the Habit setup form instead of staying on the starter form.
- [x] 2.3 Keep `Average`, `Project`, and `Target` selection and submission behavior in the starter form.
- [x] 2.4 Add a `Finish` action that validates Habit setup and creates the local Habit tracker through the repository.

## 3. Habit Setup Form

- [x] 3.1 Add Habit setup fields for goal count, time period, start date, and due schedule summary.
- [x] 3.2 Add time period choices for `Day`, `Week`, `Month`, `Quarter`, and `Year`.
- [x] 3.3 Add disabled `Reminders` and `Tags` rows with `Soon` or `Coming soon` placeholder text.
- [x] 3.4 Add toggles for `Bad Habit`, `Set Goal Streak`, and `Log with Notes`.
- [x] 3.5 Add help affordances and modal text for `Bad Habit`, `Set Goal Streak`, and `Log with Notes`.

## 4. Due Schedule Subflow

- [x] 4.1 Add a due schedule view or subcomponent opened from the Habit setup `Due` row.
- [x] 4.2 Add weekday frequency controls for `Su`, `M`, `T`, `W`, `Th`, `F`, and `S`.
- [x] 4.3 Add routine choices for `Any Time`, `Morning`, `Afternoon`, and `Evening`.
- [x] 4.4 Update the Habit setup `Due` summary when the selected weekdays or routine changes.

## 5. Verification

- [x] 5.1 Update AddTrackerScreen tests for Habit selection opening Habit setup and non-Habit methods staying in the starter flow.
- [x] 5.2 Add Habit setup screen tests for fields, placeholders, toggles, help text, due schedule controls, and finish behavior.
- [x] 5.3 Run the relevant app unit tests and typecheck commands.
- [x] 5.4 Run OpenSpec validation/status checks for `add-habit-setup-form`.

## 6. Wizard And Native Controls Refinement

- [x] 6.1 Convert Habit setup into a two-step wizard with basics followed by schedule and logging preferences.
- [x] 6.2 Replace the plain Start Date text field with native date controls on native platforms and web.
- [x] 6.3 Present Due schedule choices in a modal surface instead of replacing the Habit setup screen.
- [x] 6.4 Update tests and visual checks for the wizard, native date control, and Due modal.
- [x] 6.5 Remove the starter-level create action and move wizard primary actions to bottom buttons.
