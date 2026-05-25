import { PropsWithChildren } from 'react';
import { useColorScheme } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { TamaguiProvider } from 'tamagui';

import tamaguiConfig from '../../../tamagui.config';

export function AppProviders({ children }: PropsWithChildren) {
  const colorScheme = useColorScheme();

  return (
    <TamaguiProvider
      config={tamaguiConfig}
      defaultTheme={colorScheme ?? 'light'}
    >
      <SafeAreaProvider>{children}</SafeAreaProvider>
    </TamaguiProvider>
  );
}
