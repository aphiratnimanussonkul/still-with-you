import { stopJWKSServer } from './jwks-server.js';

/**
 * Global teardown - runs once after all test files
 */
export default async function() {
  // Stop test JWKS server
  await stopJWKSServer();

  console.log('Global teardown complete: JWKS server stopped');
}
