import { sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const trackers = sqliteTable('trackers', {
  createdAt: text('created_at').notNull(),
  id: text('id').primaryKey(),
  method: text('method').notNull(),
  name: text('name').notNull(),
  updatedAt: text('updated_at').notNull(),
});
