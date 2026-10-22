import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@still-with-you/contracts': path.resolve(__dirname, '../../packages/contracts/src/index.ts'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./src/test/setup.ts'],
    fileParallelism: false,
    env: {
      TEST_DATABASE_URL: process.env.TEST_DATABASE_URL || 'postgresql://postgres:postgres@localhost:54322/swy_test',
      DATABASE_URL: process.env.TEST_DATABASE_URL || 'postgresql://postgres:postgres@localhost:54322/swy_test',
      SUPABASE_URL: 'http://localhost:54321',
      SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
      WEB_ORIGIN: 'http://localhost:5173',
      STORAGE_BUCKET: 'private-media',
      NODE_ENV: 'test',
    },
  },
});
