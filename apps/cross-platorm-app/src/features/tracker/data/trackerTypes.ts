import { habitSetups, trackers } from '../../../shared/database';

export const trackingMethods = [
  'habit',
  'average',
  'project',
  'target',
] as const;

export type TrackingMethod = (typeof trackingMethods)[number];

export const habitTimePeriods = [
  'day',
  'week',
  'month',
  'quarter',
  'year',
] as const;

export type HabitTimePeriod = (typeof habitTimePeriods)[number];

export const habitRoutines = [
  'anytime',
  'morning',
  'afternoon',
  'evening',
] as const;

export type HabitRoutine = (typeof habitRoutines)[number];

export const habitWeekdays = ['su', 'm', 't', 'w', 'th', 'f', 's'] as const;

export type HabitWeekday = (typeof habitWeekdays)[number];

export type PersistedTracker = typeof trackers.$inferSelect & {
  method: TrackingMethod;
};

export type PersistedHabitSetup = Omit<
  typeof habitSetups.$inferSelect,
  'routine' | 'timePeriod' | 'weekdays'
> & {
  routine: HabitRoutine;
  timePeriod: HabitTimePeriod;
  weekdays: HabitWeekday[];
};

export type CreateTrackerInput = {
  method: TrackingMethod;
  name: string;
};

export type CreateHabitSetupInput = {
  goalCount: number;
  hasGoalStreak: boolean;
  isBadHabit: boolean;
  logsWithNotes: boolean;
  routine: HabitRoutine;
  startDate: string;
  timePeriod: HabitTimePeriod;
  weekdays: HabitWeekday[];
};

export type CreateHabitTrackerInput = {
  habitSetup: CreateHabitSetupInput;
  name: string;
};
