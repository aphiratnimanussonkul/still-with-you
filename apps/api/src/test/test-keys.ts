import { generateKeyPair, exportJWK } from 'jose';

/**
 * Test RSA key pair for JWT signing
 * Generated once and shared across all tests
 */
let privateKey: any;
let publicKey: any;
let jwks: any;

export async function initializeTestKeys() {
  if (privateKey) return { privateKey, publicKey, jwks };

  // Generate RS256 key pair
  const keyPair = await generateKeyPair('RS256');
  privateKey = keyPair.privateKey;
  publicKey = keyPair.publicKey;

  // Export public key as JWK
  const jwk = await exportJWK(publicKey);
  jwk.kid = 'test-key-1';
  jwk.use = 'sig';
  jwk.alg = 'RS256';

  jwks = {
    keys: [jwk],
  };

  return { privateKey, publicKey, jwks };
}

export function getTestPrivateKey() {
  if (!privateKey) {
    throw new Error('Test keys not initialized. Call initializeTestKeys first.');
  }
  return privateKey;
}

export function getTestJWKS() {
  if (!jwks) {
    throw new Error('Test keys not initialized. Call initializeTestKeys first.');
  }
  return jwks;
}
