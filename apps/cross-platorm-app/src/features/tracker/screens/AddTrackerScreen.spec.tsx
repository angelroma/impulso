import { fireEvent, render, waitFor } from '@testing-library/react-native';

import { AppProviders } from '../../../application/providers/AppProviders';
import { TrackerRepository } from '../data';
import { AddTrackerScreen } from './AddTrackerScreen';

function createTrackerRepositoryMock(): TrackerRepository {
  return {
    createTracker: jest.fn(async (input) => ({
      createdAt: '2026-05-25T20:30:00.000Z',
      id: 'tracker-id',
      method: input.method,
      name: input.name.trim(),
      updatedAt: '2026-05-25T20:30:00.000Z',
    })),
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

test('selecting a method stays on the starter form', () => {
  const { getByTestId, getByText } = renderAddTrackerScreen();

  fireEvent.press(getByTestId('custom-goal-option'));
  fireEvent.press(getByTestId('tracker-method-habit'));

  expect(getByTestId('custom-goal-starter-screen')).toBeTruthy();
  expect(getByText('How do you want to track this?')).toBeTruthy();
});

test('creates a local tracker from valid starter fields', async () => {
  const trackerRepository = createTrackerRepositoryMock();
  const { getByPlaceholderText, getByTestId, getByText } =
    renderAddTrackerScreen(trackerRepository);

  fireEvent.press(getByTestId('custom-goal-option'));
  fireEvent.changeText(
    getByPlaceholderText('Read for 20 minutes'),
    'Read daily',
  );
  fireEvent.press(getByTestId('tracker-method-habit'));
  fireEvent.press(getByTestId('create-tracker-button'));

  await waitFor(() => {
    expect(trackerRepository.createTracker).toHaveBeenCalledWith({
      method: 'habit',
      name: 'Read daily',
    });
  });
  expect(getByText('Created tracker "Read daily".')).toBeTruthy();
});

test('requires a goal name and tracking method before creating a tracker', async () => {
  const trackerRepository = createTrackerRepositoryMock();
  const { findByText, getByTestId } = renderAddTrackerScreen(trackerRepository);

  fireEvent.press(getByTestId('custom-goal-option'));
  fireEvent.press(getByTestId('create-tracker-button'));

  expect(await findByText('Name your goal or habit.')).toBeTruthy();
  expect(await findByText('Choose a tracking method.')).toBeTruthy();
  expect(trackerRepository.createTracker).not.toHaveBeenCalled();
});
