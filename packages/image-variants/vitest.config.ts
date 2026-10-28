import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@still-with-you/contracts': path.resolve(__dirname, '../contracts/src/index.ts'),
    },
  },
  test: {
    environment: 'node',
  },
});
