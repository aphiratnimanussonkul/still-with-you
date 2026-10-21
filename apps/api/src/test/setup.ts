import { beforeAll, afterAll } from 'vitest';
import { sql as pgSql } from '../lib/db/index.js';

/**
 * Test setup - runs before all tests
 */
beforeAll(async () => {
  // Clean up test data
  await pgSql`TRUNCATE TABLE family_members, families, accounts, audit_logs, invites CASCADE`;
});

/**
 * Test teardown - runs after all tests
 */
afterAll(async () => {
  await pgSql.end();
});
