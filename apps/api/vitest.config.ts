import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./src/test/setup.ts'],
    env: {
      DATABASE_URL: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:54322/postgres',
      WEB_ORIGIN: 'http://localhost:5173',
      STORAGE_BUCKET: 'private-media',
      NODE_ENV: 'test',
    },
  },
});
