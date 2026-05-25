import {
  createTrackerId,
  TrackerRepository,
} from './trackerRepository';
import { PersistedTracker } from './trackerTypes';

const trackerStorageKey = 'impulso.trackers';

export function createWebTrackerRepository(): TrackerRepository {
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
      const trackers = await this.listTrackers();

      globalThis.localStorage?.setItem(
        trackerStorageKey,
        JSON.stringify([tracker, ...trackers]),
      );

      return tracker;
    },

    async listTrackers() {
      const storedTrackers =
        globalThis.localStorage?.getItem(trackerStorageKey) ?? '[]';

      return JSON.parse(storedTrackers) as PersistedTracker[];
    },
  };
}
