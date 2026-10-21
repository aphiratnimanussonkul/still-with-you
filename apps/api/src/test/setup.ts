import { beforeAll, afterAll } from 'vitest';
import { sql as pgSql } from '../lib/db/index.js';
import { initializeTestKeys, getTestJWKS } from './test-keys.js';
import { createLocalJWKSet } from 'jose';

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

  // Clean up test data
  await pgSql`TRUNCATE TABLE family_members, families, accounts, audit_log, invites, outbox CASCADE`;
});

/**
 * Test teardown - runs after each test file
 */
afterAll(async () => {
  // Cleanup handled per test file
});
