import { fireEvent, render, waitFor } from '@testing-library/react-native';

import { AppProviders } from '../../../application/providers/AppProviders';
import { TrackerRepository } from '../data';
import { AddTrackerScreen } from './AddTrackerScreen';

function createTrackerRepositoryMock(): TrackerRepository {
  return {
    createHabitTracker: jest.fn(async (input) => ({
      habitSetup: {
        ...input.habitSetup,
        trackerId: 'tracker-id',
      },
      tracker: {
        createdAt: '2026-05-25T20:30:00.000Z',
        id: 'tracker-id',
        method: 'habit' as const,
        name: input.name.trim(),
        updatedAt: '2026-05-25T20:30:00.000Z',
      },
    })),
    createTracker: jest.fn(async (input) => ({
      createdAt: '2026-05-25T20:30:00.000Z',
      id: 'tracker-id',
      method: input.method,
      name: input.name.trim(),
      updatedAt: '2026-05-25T20:30:00.000Z',
    })),
    getHabitSetup: jest.fn(async () => undefined),
    listTrackers: jest.fn(async () => []),
  };
}

function renderAddTrackerScreen(
  trackerRepository = createTrackerRepositoryMock(),
) {
  return render(
    <AppProviders>
      <AddTrackerScreen trackerRepository={trackerRepository} />
    </AppProviders>,
  );
}

test('renders the custom goal entry option', () => {
  const { getByTestId, getByText } = renderAddTrackerScreen();

  expect(getByTestId('add-tracker-screen')).toBeTruthy();
  expect(getByTestId('custom-goal-option')).toBeTruthy();
  expect(getByText('Habit, number, or project')).toBeTruthy();
});

test('opens the custom goal starter form from the custom goal option', () => {
  const { getByTestId, getByText } = renderAddTrackerScreen();

  fireEvent.press(getByTestId('custom-goal-option'));

  expect(getByTestId('custom-goal-starter-screen')).toBeTruthy();
  expect(getByText('Name your goal or habit')).toBeTruthy();
  expect(getByText('How do you want to track this?')).toBeTruthy();
});

test('renders all tracking method choices in the starter form', () => {
  const { getByTestId, getByText } = renderAddTrackerScreen();

  fireEvent.press(getByTestId('custom-goal-option'));

  expect(getByTestId('tracker-method-habit')).toBeTruthy();
  expect(getByText('Habit')).toBeTruthy();
  expect(getByText('repeating action')).toBeTruthy();

  expect(getByTestId('tracker-method-average')).toBeTruthy();
  expect(getByText('Average')).toBeTruthy();
  expect(getByText('repeating number')).toBeTruthy();

  expect(getByTestId('tracker-method-project')).toBeTruthy();
  expect(getByText('Project')).toBeTruthy();
  expect(getByText('actions by date')).toBeTruthy();

  expect(getByTestId('tracker-method-target')).toBeTruthy();
  expect(getByText('Target')).toBeTruthy();
  expect(getByText('number by date')).toBeTruthy();
});

test('selecting habit with a valid name opens habit setup', async () => {
  const { findByTestId, getByPlaceholderText, getByTestId, getByText } =
    renderAddTrackerScreen();

  fireEvent.press(getByTestId('custom-goal-option'));
  fireEvent.changeText(getByPlaceholderText('Read for 20 minutes'), 'Running');
  fireEvent.press(getByTestId('tracker-method-habit'));

  expect(await findByTestId('habit-setup-screen')).toBeTruthy();
  expect(getByText('Running')).toBeTruthy();
  expect(getByText('Step 1 of 2')).toBeTruthy();
  expect(getByTestId('habit-next-button')).toBeTruthy();
});

test('selecting a non-habit method stays on the starter form with coming soon copy', () => {
  const { getByTestId, getByText } = renderAddTrackerScreen();

  fireEvent.press(getByTestId('custom-goal-option'));
  fireEvent.press(getByTestId('tracker-method-average'));

  expect(getByTestId('custom-goal-starter-screen')).toBeTruthy();
  expect(getByText('How do you want to track this?')).toBeTruthy();
  expect(getByText('Average setup is coming soon.')).toBeTruthy();
});

test('does not show a premature create tracker action on the starter form', () => {
  const trackerRepository = createTrackerRepositoryMock();
  const { getByTestId, queryByTestId } =
    renderAddTrackerScreen(trackerRepository);

  fireEvent.press(getByTestId('custom-goal-option'));

  expect(queryByTestId('create-tracker-button')).toBeNull();
  expect(trackerRepository.createTracker).not.toHaveBeenCalled();
});

test('requires a name before opening habit setup', async () => {
  const trackerRepository = createTrackerRepositoryMock();
  const { findByText, getByTestId, queryByTestId } =
    renderAddTrackerScreen(trackerRepository);

  fireEvent.press(getByTestId('custom-goal-option'));
  fireEvent.press(getByTestId('tracker-method-habit'));

  expect(await findByText('Name your goal or habit.')).toBeTruthy();
  expect(queryByTestId('habit-setup-screen')).toBeNull();
  expect(trackerRepository.createHabitTracker).not.toHaveBeenCalled();
});

test('selecting non-habit does not create a tracker from the starter form', () => {
  const trackerRepository = createTrackerRepositoryMock();
  const { getByPlaceholderText, getByTestId } =
    renderAddTrackerScreen(trackerRepository);

  fireEvent.press(getByTestId('custom-goal-option'));
  fireEvent.changeText(
    getByPlaceholderText('Read for 20 minutes'),
    'Read weekly',
  );
  fireEvent.press(getByTestId('tracker-method-average'));

  expect(trackerRepository.createTracker).not.toHaveBeenCalled();
});

test('renders habit setup fields, placeholders, toggles, and help text', async () => {
  const {
    findByTestId,
    findByText,
    getByPlaceholderText,
    getByTestId,
    getByText,
  } = renderAddTrackerScreen();

  fireEvent.press(getByTestId('custom-goal-option'));
  fireEvent.changeText(getByPlaceholderText('Read for 20 minutes'), 'Running');
  fireEvent.press(getByTestId('tracker-method-habit'));

  expect(await findByTestId('habit-setup-screen')).toBeTruthy();
  expect(getByText('Goal')).toBeTruthy();
  expect(getByText('Times')).toBeTruthy();
  expect(getByText('Time Period')).toBeTruthy();
  expect(getByText('Day')).toBeTruthy();
  expect(getByText('Week')).toBeTruthy();
  expect(getByText('Month')).toBeTruthy();
  expect(getByText('Quarter')).toBeTruthy();
  expect(getByText('Year')).toBeTruthy();
  expect(getByText('Start Date')).toBeTruthy();
  expect(getByTestId('habit-start-date-picker')).toBeTruthy();

  fireEvent.press(getByTestId('habit-next-button'));

  expect(getByText('Step 2 of 2')).toBeTruthy();
  expect(getByText('Due')).toBeTruthy();
  expect(getByText('Every Day, Any Time')).toBeTruthy();
  expect(getByText('Reminders')).toBeTruthy();
  expect(getByText('Soon')).toBeTruthy();
  expect(getByText('Tags')).toBeTruthy();
  expect(getByText('Coming soon')).toBeTruthy();
  expect(getByText('Bad Habit')).toBeTruthy();
  expect(getByText('Set Goal Streak')).toBeTruthy();
  expect(getByText('Log with Notes')).toBeTruthy();

  fireEvent.press(getByTestId('habit-bad-habit-toggle-help'));
  expect(
    await findByText(
      'Turning this ON reverses colors for logs and charts for habits you want to break, setting your goal as the limit (e.g. Do the habit 5 times per week, or less).',
    ),
  ).toBeTruthy();
  fireEvent.press(getByTestId('habit-help-close'));

  fireEvent.press(getByTestId('habit-goal-streak-toggle-help'));
  expect(
    await findByText(
      'Turning this ON lets you set a goal for your streak to stay motivated while you build the habit.',
    ),
  ).toBeTruthy();
  fireEvent.press(getByTestId('habit-help-close'));

  fireEvent.press(getByTestId('habit-log-with-notes-toggle-help'));
  expect(
    await findByText(
      "Automatically show the Notes field when logging so you don't have to swipe left to add a note after.",
    ),
  ).toBeTruthy();
});

test('updates habit due schedule controls and summary', async () => {
  const { findByTestId, getByPlaceholderText, getByTestId, getByText } =
    renderAddTrackerScreen();

  fireEvent.press(getByTestId('custom-goal-option'));
  fireEvent.changeText(getByPlaceholderText('Read for 20 minutes'), 'Running');
  fireEvent.press(getByTestId('tracker-method-habit'));

  expect(await findByTestId('habit-setup-screen')).toBeTruthy();
  fireEvent.press(getByTestId('habit-next-button'));
  fireEvent.press(getByTestId('habit-due-row'));

  expect(getByTestId('habit-due-schedule-screen')).toBeTruthy();
  expect(getByText('Frequency')).toBeTruthy();
  expect(getByText('Routine')).toBeTruthy();
  expect(getByTestId('habit-weekday-su')).toBeTruthy();
  expect(getByTestId('habit-weekday-m')).toBeTruthy();
  expect(getByTestId('habit-weekday-t')).toBeTruthy();
  expect(getByTestId('habit-weekday-w')).toBeTruthy();
  expect(getByTestId('habit-weekday-th')).toBeTruthy();
  expect(getByTestId('habit-weekday-f')).toBeTruthy();
  expect(getByTestId('habit-weekday-s')).toBeTruthy();
  expect(getByText('Morning')).toBeTruthy();
  expect(getByText('Afternoon')).toBeTruthy();
  expect(getByText('Evening')).toBeTruthy();

  fireEvent.press(getByTestId('habit-weekday-su'));
  fireEvent.press(getByTestId('habit-routine-morning'));
  fireEvent.press(getByTestId('habit-due-back-button'));

  expect(getByText('M, T, W, Th, F, S, Morning')).toBeTruthy();
});

test('finishes habit setup by creating a persisted habit tracker', async () => {
  const trackerRepository = createTrackerRepositoryMock();
  const { findByTestId, getByPlaceholderText, getByTestId, getByText } =
    renderAddTrackerScreen(trackerRepository);

  fireEvent.press(getByTestId('custom-goal-option'));
  fireEvent.changeText(getByPlaceholderText('Read for 20 minutes'), 'Running');
  fireEvent.press(getByTestId('tracker-method-habit'));

  expect(await findByTestId('habit-setup-screen')).toBeTruthy();
  fireEvent.changeText(getByTestId('habit-goal-input'), '3');
  fireEvent.press(getByTestId('habit-time-period-week'));
  fireEvent.press(getByTestId('habit-next-button'));
  fireEvent.press(getByTestId('habit-bad-habit-toggle'));
  fireEvent.press(getByTestId('habit-goal-streak-toggle'));
  fireEvent.press(getByTestId('habit-log-with-notes-toggle'));
  fireEvent.press(getByTestId('habit-finish-button'));

  await waitFor(() => {
    expect(trackerRepository.createHabitTracker).toHaveBeenCalledWith({
      habitSetup: {
        goalCount: 3,
        hasGoalStreak: true,
        isBadHabit: true,
        logsWithNotes: true,
        routine: 'anytime',
        startDate: expect.any(String),
        timePeriod: 'week',
        weekdays: ['su', 'm', 't', 'w', 'th', 'f', 's'],
      },
      name: 'Running',
    });
  });
  expect(getByText('Created tracker "Running".')).toBeTruthy();
});

test('validates habit goal before finishing setup', async () => {
  const trackerRepository = createTrackerRepositoryMock();
  const { findByText, findByTestId, getByPlaceholderText, getByTestId } =
    renderAddTrackerScreen(trackerRepository);

  fireEvent.press(getByTestId('custom-goal-option'));
  fireEvent.changeText(getByPlaceholderText('Read for 20 minutes'), 'Running');
  fireEvent.press(getByTestId('tracker-method-habit'));

  expect(await findByTestId('habit-setup-screen')).toBeTruthy();
  fireEvent.changeText(getByTestId('habit-goal-input'), '0');
  fireEvent.press(getByTestId('habit-next-button'));

  expect(await findByText('Goal must be at least 1 time.')).toBeTruthy();
  expect(trackerRepository.createHabitTracker).not.toHaveBeenCalled();
});
