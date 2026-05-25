import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'sqlite',
  driver: 'expo',
  out: './src/shared/database/drizzle',
  schema: './src/shared/database/schema.ts',
});
