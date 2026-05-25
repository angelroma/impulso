import { fireEvent, render, waitFor } from '@testing-library/react-native';

import { AppProviders } from '../../../application/providers/AppProviders';
import { FoundationHomeScreen } from './FoundationHomeScreen';

function renderFoundationScreen() {
  return render(
    <AppProviders>
      <FoundationHomeScreen />
    </AppProviders>,
  );
}

test('renders the foundation screen', () => {
  const { getByTestId, getByText } = renderFoundationScreen();

  expect(getByTestId('foundation-heading')).toHaveTextContent('Impulso');
  expect(getByText('Expo Router stack layout')).toBeTruthy();
});

test('validates the foundation form with zod-backed rules', async () => {
  const { getByText, getByPlaceholderText, findByText } =
    renderFoundationScreen();

  fireEvent.press(getByText('Validate'));

  expect(await findByText('Enter at least 2 characters.')).toBeTruthy();
  expect(
    await findByText('Describe the goal in at least 8 characters.'),
  ).toBeTruthy();

  fireEvent.changeText(getByPlaceholderText('A future teammate'), 'Mina');
  fireEvent.changeText(
    getByPlaceholderText('Set up the app foundation'),
    'Ship a clean app foundation',
  );
  fireEvent.press(getByText('Validate'));

  await waitFor(() => {
    expect(getByText('Foundation form validated for Mina.')).toBeTruthy();
  });
});
