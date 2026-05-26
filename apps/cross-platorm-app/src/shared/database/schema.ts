import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const trackers = sqliteTable('trackers', {
  createdAt: text('created_at').notNull(),
  id: text('id').primaryKey(),
  method: text('method').notNull(),
  name: text('name').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const habitSetups = sqliteTable('habit_setups', {
  goalCount: integer('goal_count').notNull(),
  hasGoalStreak: integer('has_goal_streak', { mode: 'boolean' }).notNull(),
  isBadHabit: integer('is_bad_habit', { mode: 'boolean' }).notNull(),
  logsWithNotes: integer('logs_with_notes', { mode: 'boolean' }).notNull(),
  routine: text('routine').notNull(),
  startDate: text('start_date').notNull(),
  timePeriod: text('time_period').notNull(),
  trackerId: text('tracker_id')
    .primaryKey()
    .references(() => trackers.id, { onDelete: 'cascade' }),
  weekdays: text('weekdays').notNull(),
});
