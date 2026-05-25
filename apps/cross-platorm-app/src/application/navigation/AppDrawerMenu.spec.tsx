import { render } from '@testing-library/react-native';

import { AppProviders } from '../providers/AppProviders';
import { appDrawerSections } from './appDrawerItems';
import { AppDrawerMenu } from './AppDrawerMenu';

jest.mock('expo-router', () => ({
  Link: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('@expo/vector-icons', () => {
  const React = require('react');
  const { Text } = require('react-native');

  return {
    MaterialCommunityIcons: ({
      name,
      testID,
    }: {
      name: string;
      testID?: string;
    }) => React.createElement(Text, { testID }, name),
  };
});

function renderDrawerMenu() {
  const result = render(
    <AppProviders>
      <AppDrawerMenu activeRoute="add-tracker" />
    </AppProviders>,
  );

  return result;
}

test('renders grouped drawer sections with icon-backed submenu items', () => {
  const { getByTestId, getByText } = renderDrawerMenu();

  expect(getByText('Goal settings')).toBeTruthy();
  expect(getByText('Add tracker')).toBeTruthy();
  expect(getByTestId('drawer-add-tracker-icon')).toHaveTextContent('target');

  expect(getByText('Options')).toBeTruthy();
  expect(getByText('Settings')).toBeTruthy();
  expect(getByTestId('drawer-settings-icon')).toHaveTextContent('cog-outline');
});

test('defines route destinations for drawer item activation', () => {
  expect(appDrawerSections[0].items[0]).toMatchObject({
    href: '/add-tracker',
    route: 'add-tracker',
  });
  expect(appDrawerSections[1].items[0]).toMatchObject({
    href: '/settings',
    route: 'settings',
  });
});
