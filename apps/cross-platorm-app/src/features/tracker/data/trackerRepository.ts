import { desc, eq } from 'drizzle-orm';

import { AppDatabase, habitSetups, trackers } from '../../../shared/database';
import {
  CreateHabitTrackerInput,
  CreateTrackerInput,
  HabitRoutine,
  HabitTimePeriod,
  HabitWeekday,
  PersistedHabitSetup,
  PersistedTracker,
} from './trackerTypes';

export type TrackerRepository = {
  createHabitTracker(
    input: CreateHabitTrackerInput,
  ): Promise<{ habitSetup: PersistedHabitSetup; tracker: PersistedTracker }>;
  createTracker(input: CreateTrackerInput): Promise<PersistedTracker>;
  getHabitSetup(trackerId: string): Promise<PersistedHabitSetup | undefined>;
  listTrackers(): Promise<PersistedTracker[]>;
};

export function createTrackerRepository(
  database: AppDatabase,
): TrackerRepository {
  return {
    async createHabitTracker(input) {
      const tracker = buildTracker({
        method: 'habit',
        name: input.name,
      });
      const habitSetupRow = {
        ...input.habitSetup,
        trackerId: tracker.id,
        weekdays: serializeWeekdays(input.habitSetup.weekdays),
      };

      database.insert(trackers).values(tracker).run();
      database.insert(habitSetups).values(habitSetupRow).run();

      return {
        habitSetup: deserializeHabitSetup(habitSetupRow),
        tracker,
      };
    },

    async createTracker(input) {
      const tracker = buildTracker(input);

      database.insert(trackers).values(tracker).run();

      return tracker;
    },

    async getHabitSetup(trackerId) {
      const row = database
        .select()
        .from(habitSetups)
        .where(eq(habitSetups.trackerId, trackerId))
        .get();

      return row ? deserializeHabitSetup(row) : undefined;
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

function buildTracker(input: CreateTrackerInput): PersistedTracker {
  const timestamp = new Date().toISOString();

  return {
    createdAt: timestamp,
    id: createTrackerId(),
    method: input.method,
    name: input.name.trim(),
    updatedAt: timestamp,
  };
}

function serializeWeekdays(weekdays: HabitWeekday[]) {
  return JSON.stringify(weekdays);
}

function deserializeHabitSetup(
  row: typeof habitSetups.$inferSelect,
): PersistedHabitSetup {
  return {
    ...row,
    routine: row.routine as HabitRoutine,
    timePeriod: row.timePeriod as HabitTimePeriod,
    weekdays: JSON.parse(row.weekdays) as HabitWeekday[],
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
