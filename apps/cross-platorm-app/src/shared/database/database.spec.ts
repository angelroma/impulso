import { drizzle } from 'drizzle-orm/expo-sqlite';
import { openDatabaseSync } from 'expo-sqlite';

import { createDatabaseClient } from './database';
import * as schema from './schema';

jest.mock('expo-sqlite', () => ({
  openDatabaseSync: jest.fn(() => ({ name: 'sqlite-client' })),
}));

jest.mock('drizzle-orm/expo-sqlite', () => ({
  drizzle: jest.fn(() => ({ name: 'drizzle-client' })),
}));

test('creates an Expo SQLite backed Drizzle database client', () => {
  const database = createDatabaseClient('test.db');

  expect(openDatabaseSync).toHaveBeenCalledWith('test.db', {
    enableChangeListener: true,
  });
  expect(drizzle).toHaveBeenCalledWith(
    { name: 'sqlite-client' },
    { schema },
  );
  expect(database).toEqual({ name: 'drizzle-client' });
});
