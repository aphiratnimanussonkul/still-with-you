import { beforeAll, afterAll } from 'vitest';
import { sql as pgSql } from '../lib/db/index.js';
import { initializeTestKeys, getTestJWKS } from './test-keys.js';
import { createLocalJWKSet } from 'jose';
import { guardTestDatabase } from './database-guards.js';
import { env } from '../lib/env.js';

/**
 * Test setup - runs before each test file
 */
beforeAll(async () => {
  // Initialize test RSA keys for JWT
  await initializeTestKeys();

  // Set test JWKS for auth plugin
  const jwks = getTestJWKS();
  const localJWKSet = createLocalJWKSet(jwks);
  
  // Store in global for auth plugin to use
  (global as any).__TEST_JWKS__ = localJWKSet;
  
  // Set test environment
  process.env.SUPABASE_URL = 'http://localhost:54321';
  process.env.JWT_ISSUER = 'http://localhost:54321/auth/v1';
  process.env.NODE_ENV = 'test';

  // Guard against truncating production databases
  const dbUrl = process.env.TEST_DATABASE_URL || env.DATABASE_URL;
  await guardTestDatabase(dbUrl);

  // Clean up test data
  await pgSql`TRUNCATE TABLE family_members, families, accounts, audit_log, invites, outbox CASCADE`;
});

/**
 * Test teardown - runs after each test file
 */
afterAll(async () => {
  // Cleanup handled per test file
});
