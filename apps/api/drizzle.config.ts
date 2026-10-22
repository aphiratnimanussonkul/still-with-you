import type { Config } from 'drizzle-kit';
import { env } from './src/lib/env.js';

export default {
  schema: './src/lib/db/schema.ts',
  out: './drizzle',
  driver: 'pg',
  dbCredentials: {
    connectionString: env.DATABASE_URL,
  },
} satisfies Config;
