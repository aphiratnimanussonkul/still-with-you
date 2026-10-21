import { beforeAll, afterAll } from 'vitest';
import { sql as pgSql } from '../lib/db/index.js';
import { startJWKSServer, stopJWKSServer } from './jwks-server.js';

/**
 * Test setup - runs before all tests
 */
beforeAll(async () => {
  // Start test JWKS server
  const jwksInfo = await startJWKSServer(8765);

  // Set environment variables for test
  process.env.SUPABASE_URL = jwksInfo.url;
  process.env.JWKS_URI = `${jwksInfo.url}/.well-known/jwks.json`;
  process.env.JWT_ISSUER = `${jwksInfo.url}/auth/v1`;

  // Clean up test data
  await pgSql`TRUNCATE TABLE family_members, families, accounts, audit_log, invites, outbox CASCADE`;
});

/**
 * Test teardown - runs after all tests
 */
afterAll(async () => {
  await stopJWKSServer();
  await pgSql.end();
});
