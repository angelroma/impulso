import { PropsWithChildren } from 'react';
import { Platform, useColorScheme } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { TamaguiProvider } from 'tamagui';

import tamaguiConfig from '../../../tamagui.config';
import { AppDatabase, DatabaseProvider } from '../../shared/database';

type AppProvidersProps = PropsWithChildren<{
  databaseClient?: AppDatabase;
  runDatabaseMigrations?: boolean;
}>;

export function AppProviders({
  children,
  databaseClient,
  runDatabaseMigrations,
}: AppProvidersProps) {
  const colorScheme = useColorScheme();

  return (
    <TamaguiProvider
      config={tamaguiConfig}
      defaultTheme={colorScheme ?? 'light'}
    >
      <SafeAreaProvider>
        {Platform.OS === 'web' ? (
          children
        ) : (
          <DatabaseProvider
            databaseClient={databaseClient}
            runMigrations={runDatabaseMigrations}
          >
            {children}
          </DatabaseProvider>
        )}
      </SafeAreaProvider>
    </TamaguiProvider>
  );
}
