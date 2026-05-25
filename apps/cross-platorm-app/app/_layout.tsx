import { Stack } from 'expo-router';

import { AppProviders } from '../src/application/providers/AppProviders';

export default function RootLayout() {
  return (
    <AppProviders>
      <Stack
        screenOptions={{
          headerShown: false,
        }}
      />
    </AppProviders>
  );
}
