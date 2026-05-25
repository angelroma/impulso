import type { ReactNode } from 'react';

jest.mock('expo/src/winter/ImportMetaRegistry', () => ({
  ImportMetaRegistry: {
    get url() {
      return null;
    },
  },
}));

jest.mock(
  'react-native-safe-area-context',
  () => {
    const React = require('react');
    const { View } = require('react-native');

    return {
      SafeAreaProvider: ({ children }: { children?: ReactNode }) =>
        React.createElement(React.Fragment, null, children),
      SafeAreaView: View,
      initialWindowMetrics: {
        frame: { height: 0, width: 0, x: 0, y: 0 },
        insets: { bottom: 0, left: 0, right: 0, top: 0 },
      },
      useSafeAreaFrame: () => ({ height: 0, width: 0, x: 0, y: 0 }),
      useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }),
    };
  },
);

if (typeof global.structuredClone === 'undefined') {
  global.structuredClone = (object) => JSON.parse(JSON.stringify(object));
}
