import { desc } from 'drizzle-orm';

import { AppDatabase, trackers } from '../../../shared/database';
import { CreateTrackerInput, PersistedTracker } from './trackerTypes';

export type TrackerRepository = {
  createTracker(input: CreateTrackerInput): Promise<PersistedTracker>;
  listTrackers(): Promise<PersistedTracker[]>;
};

export function createTrackerRepository(
  database: AppDatabase,
): TrackerRepository {
  return {
    async createTracker(input) {
      const timestamp = new Date().toISOString();
      const tracker: PersistedTracker = {
        createdAt: timestamp,
        id: createTrackerId(),
        method: input.method,
        name: input.name.trim(),
        updatedAt: timestamp,
      };

      database.insert(trackers).values(tracker).run();

      return tracker;
    },

    async listTrackers() {
      const rows = database
        .select()
        .from(trackers)
        .orderBy(desc(trackers.createdAt))
        .all();

      return rows as PersistedTracker[];
    },
  };
}

export function createTrackerId() {
  const randomUUID = globalThis.crypto?.randomUUID;

  if (randomUUID) {
    return randomUUID.call(globalThis.crypto);
  }

  return `${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}
