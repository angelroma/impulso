import { AppDatabase, trackers } from '../../../shared/database';
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
