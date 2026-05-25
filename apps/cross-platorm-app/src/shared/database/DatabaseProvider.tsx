import { createContext, PropsWithChildren, useContext, useMemo } from 'react';
import { Text, View } from 'react-native';
import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';

import { AppDatabase, getAppDatabase } from './database';
import migrations from './drizzle/migrations';

const DatabaseContext = createContext<AppDatabase | undefined>(undefined);

type DatabaseProviderProps = PropsWithChildren<{
  databaseClient?: AppDatabase;
  runMigrations?: boolean;
}>;

export function DatabaseProvider({
  children,
  databaseClient,
  runMigrations = process.env.NODE_ENV !== 'test',
}: DatabaseProviderProps) {
  const databaseState = useMemo(() => {
    try {
      return {
        database:
          databaseClient ??
          (process.env.NODE_ENV === 'test'
            ? ({} as AppDatabase)
            : getAppDatabase()),
      };
    } catch (error) {
      return { error: normalizeDatabaseError(error) };
    }
  }, [databaseClient]);

  if (databaseState.error) {
    return <DatabaseInitializationError error={databaseState.error} />;
  }

  const database = databaseState.database;

  if (!runMigrations) {
    return (
      <DatabaseContext.Provider value={database}>
        {children}
      </DatabaseContext.Provider>
    );
  }

  return (
    <MigratedDatabaseProvider database={database}>
      {children}
    </MigratedDatabaseProvider>
  );
}

function DatabaseInitializationError({ error }: { error: Error }) {
  return (
    <View testID="database-error-screen">
      <Text>Database initialization failed.</Text>
      <Text>{error.message}</Text>
    </View>
  );
}

function MigratedDatabaseProvider({
  children,
  database,
}: PropsWithChildren<{ database: AppDatabase }>) {
  const migration = useMigrations(database, migrations);

  if (migration.error) {
    return <DatabaseInitializationError error={migration.error} />;
  }

  if (!migration.success) {
    return (
      <View testID="database-loading-screen">
        <Text>Preparing local data...</Text>
      </View>
    );
  }

  return (
    <DatabaseContext.Provider value={database}>
      {children}
    </DatabaseContext.Provider>
  );
}

function normalizeDatabaseError(error: unknown) {
  return error instanceof Error
    ? error
    : new Error('Unknown database initialization error.');
}

export function useDatabase() {
  const database = useContext(DatabaseContext);

  if (!database) {
    throw new Error('useDatabase must be used within DatabaseProvider.');
  }

  return database;
}
