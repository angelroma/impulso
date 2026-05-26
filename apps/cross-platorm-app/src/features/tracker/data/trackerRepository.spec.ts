import { AppDatabase, habitSetups, trackers } from '../../../shared/database';
import { createTrackerRepository } from './trackerRepository';

test('creates a tracker with id and timestamps', async () => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-05-25T20:30:00.000Z'));

  const run = jest.fn();
  const values = jest.fn(() => ({ run }));
  const insert = jest.fn(() => ({ values }));
  const database = { insert } as unknown as AppDatabase;
  const repository = createTrackerRepository(database);

  const tracker = await repository.createTracker({
    method: 'habit',
    name: ' Read for 20 minutes ',
  });

  expect(insert).toHaveBeenCalledWith(trackers);
  expect(values).toHaveBeenCalledWith({
    createdAt: '2026-05-25T20:30:00.000Z',
    id: expect.any(String),
    method: 'habit',
    name: 'Read for 20 minutes',
    updatedAt: '2026-05-25T20:30:00.000Z',
  });
  expect(run).toHaveBeenCalled();
  expect(tracker).toMatchObject({
    createdAt: '2026-05-25T20:30:00.000Z',
    method: 'habit',
    name: 'Read for 20 minutes',
    updatedAt: '2026-05-25T20:30:00.000Z',
  });

  jest.useRealTimers();
});

test('creates a habit tracker with persisted setup values', async () => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-05-25T20:30:00.000Z'));

  const run = jest.fn();
  const values = jest.fn(() => ({ run }));
  const insert = jest.fn(() => ({ values }));
  const database = { insert } as unknown as AppDatabase;
  const repository = createTrackerRepository(database);

  const result = await repository.createHabitTracker({
    habitSetup: {
      goalCount: 3,
      hasGoalStreak: true,
      isBadHabit: false,
      logsWithNotes: true,
      routine: 'morning',
      startDate: '2026-05-25',
      timePeriod: 'week',
      weekdays: ['m', 'w', 'f'],
    },
    name: ' Running ',
  });

  expect(insert).toHaveBeenNthCalledWith(1, trackers);
  expect(insert).toHaveBeenNthCalledWith(2, habitSetups);
  expect(values).toHaveBeenNthCalledWith(1, {
    createdAt: '2026-05-25T20:30:00.000Z',
    id: expect.any(String),
    method: 'habit',
    name: 'Running',
    updatedAt: '2026-05-25T20:30:00.000Z',
  });
  expect(values).toHaveBeenNthCalledWith(2, {
    goalCount: 3,
    hasGoalStreak: true,
    isBadHabit: false,
    logsWithNotes: true,
    routine: 'morning',
    startDate: '2026-05-25',
    timePeriod: 'week',
    trackerId: result.tracker.id,
    weekdays: '["m","w","f"]',
  });
  expect(result).toMatchObject({
    habitSetup: {
      goalCount: 3,
      hasGoalStreak: true,
      isBadHabit: false,
      logsWithNotes: true,
      routine: 'morning',
      startDate: '2026-05-25',
      timePeriod: 'week',
      weekdays: ['m', 'w', 'f'],
    },
    tracker: {
      method: 'habit',
      name: 'Running',
    },
  });

  jest.useRealTimers();
});

test('reads a persisted habit setup by tracker id', async () => {
  const get = jest.fn(() => ({
    goalCount: 1,
    hasGoalStreak: false,
    isBadHabit: true,
    logsWithNotes: false,
    routine: 'evening',
    startDate: '2026-05-25',
    timePeriod: 'day',
    trackerId: 'tracker-id',
    weekdays: '["su","m"]',
  }));
  const where = jest.fn(() => ({ get }));
  const from = jest.fn(() => ({ where }));
  const select = jest.fn(() => ({ from }));
  const database = { select } as unknown as AppDatabase;
  const repository = createTrackerRepository(database);

  await expect(repository.getHabitSetup('tracker-id')).resolves.toEqual({
    goalCount: 1,
    hasGoalStreak: false,
    isBadHabit: true,
    logsWithNotes: false,
    routine: 'evening',
    startDate: '2026-05-25',
    timePeriod: 'day',
    trackerId: 'tracker-id',
    weekdays: ['su', 'm'],
  });
  expect(select).toHaveBeenCalledWith();
  expect(from).toHaveBeenCalledWith(habitSetups);
});
