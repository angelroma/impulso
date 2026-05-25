import { fireEvent, render } from '@testing-library/react-native';

import { AppProviders } from '../../../application/providers/AppProviders';
import { AddTrackerScreen } from './AddTrackerScreen';

function renderAddTrackerScreen() {
  return render(
    <AppProviders>
      <AddTrackerScreen />
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
