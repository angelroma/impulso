import { drizzle, ExpoSQLiteDatabase } from 'drizzle-orm/expo-sqlite';
import { openDatabaseSync } from 'expo-sqlite';

import * as schema from './schema';

export type AppDatabase = ExpoSQLiteDatabase<typeof schema>;

let appDatabase: AppDatabase | undefined;

export function createDatabaseClient(
  databaseName = 'impulso.db',
): AppDatabase {
  const sqliteDatabase = openDatabaseSync(databaseName, {
    enableChangeListener: true,
  });

  return drizzle(sqliteDatabase, { schema });
}

export function getAppDatabase(): AppDatabase {
  appDatabase ??= createDatabaseClient();

  return appDatabase;
}
