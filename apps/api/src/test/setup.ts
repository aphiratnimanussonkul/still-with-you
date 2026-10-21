import { beforeAll, afterAll } from 'vitest';
import { sql as pgSql } from '../lib/db/index.js';

/**
 * Test setup - runs before each test file
 */
beforeAll(async () => {
  // Clean up test data
  await pgSql`TRUNCATE TABLE family_members, families, accounts, audit_log, invites, outbox CASCADE`;
});

/**
 * Test teardown - runs after each test file
 */
afterAll(async () => {
  // Cleanup is handled per test file, but we don't close the connection yet
  // Connection will be closed in global teardown
});
