import { startJWKSServer } from './jwks-server.js';

/**
 * Global setup - runs once before all test files
 */
export default async function() {
  // Start test JWKS server
  const jwksInfo = await startJWKSServer(8765);

  // Set environment variables for all tests
  process.env.SUPABASE_URL = jwksInfo.url;
  process.env.JWKS_URI = `${jwksInfo.url}/.well-known/jwks.json`;
  process.env.JWT_ISSUER = `${jwksInfo.url}/auth/v1`;

  console.log('Global setup complete: JWKS server started');
}
