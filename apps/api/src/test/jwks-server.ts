import { createServer, IncomingMessage, ServerResponse } from 'http';
import { generateKeyPair, exportJWK } from 'jose';

/**
 * Test JWKS server for local JWT verification
 * Generates an RS256 key pair and serves the public key as JWKS
 */

let privateKey: any;
let publicKey: any;
let server: any;

export async function startJWKSServer(port: number = 8765): Promise<{ url: string; privateKey: any }> {
  // Generate RS256 key pair
  const keyPair = await generateKeyPair('RS256');
  privateKey = keyPair.privateKey;
  publicKey = keyPair.publicKey;

  // Export public key as JWK
  const jwk = await exportJWK(publicKey);
  jwk.kid = 'test-key-1';
  jwk.use = 'sig';
  jwk.alg = 'RS256';

  const jwks = {
    keys: [jwk],
  };

  // Create HTTP server to serve JWKS
  server = createServer((req: IncomingMessage, res: ServerResponse) => {
    if (req.url === '/auth/v1/.well-known/jwks.json' || req.url === '/.well-known/jwks.json') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(jwks));
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  await new Promise<void>((resolve) => {
    server.listen(port, () => {
      console.log(`Test JWKS server listening on port ${port}`);
      resolve();
    });
  });

  return {
    url: `http://localhost:${port}`,
    privateKey,
  };
}

export async function stopJWKSServer(): Promise<void> {
  if (server) {
    await new Promise<void>((resolve, reject) => {
      server.close((err: Error) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
}

export function getPrivateKey() {
  return privateKey;
}
