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
    env: {
      DATABASE_URL: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:54322/postgres',
      WEB_ORIGIN: 'http://localhost:5173',
      STORAGE_BUCKET: 'private-media',
      NODE_ENV: 'test',
    },
  },
});
