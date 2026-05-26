import { createTrackerId, TrackerRepository } from './trackerRepository';
import {
  CreateHabitSetupInput,
  PersistedHabitSetup,
  PersistedTracker,
} from './trackerTypes';

const habitSetupStorageKey = 'impulso.habitSetups';
const trackerStorageKey = 'impulso.trackers';

export function createWebTrackerRepository(): TrackerRepository {
  return {
    async createHabitTracker(input) {
      const timestamp = new Date().toISOString();
      const tracker: PersistedTracker = {
        createdAt: timestamp,
        id: createTrackerId(),
        method: 'habit',
        name: input.name.trim(),
        updatedAt: timestamp,
      };
      const habitSetup = buildPersistedHabitSetup(tracker.id, input.habitSetup);
      const trackers = await this.listTrackers();
      const habitSetups = await listHabitSetups();

      globalThis.localStorage?.setItem(
        trackerStorageKey,
        JSON.stringify([tracker, ...trackers]),
      );
      globalThis.localStorage?.setItem(
        habitSetupStorageKey,
        JSON.stringify([habitSetup, ...habitSetups]),
      );

      return { habitSetup, tracker };
    },

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

    async getHabitSetup(trackerId) {
      const habitSetups = await listHabitSetups();

      return habitSetups.find((setup) => setup.trackerId === trackerId);
    },

    async listTrackers() {
      const storedTrackers =
        globalThis.localStorage?.getItem(trackerStorageKey) ?? '[]';

      return JSON.parse(storedTrackers) as PersistedTracker[];
    },
  };
}

function buildPersistedHabitSetup(
  trackerId: string,
  habitSetup: CreateHabitSetupInput,
): PersistedHabitSetup {
  return {
    ...habitSetup,
    trackerId,
  };
}

async function listHabitSetups() {
  const storedHabitSetups =
    globalThis.localStorage?.getItem(habitSetupStorageKey) ?? '[]';

  return JSON.parse(storedHabitSetups) as PersistedHabitSetup[];
}
