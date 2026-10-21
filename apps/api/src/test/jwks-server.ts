import { createServer, IncomingMessage, ServerResponse } from 'http';
import { generateKeyPair, exportJWK } from 'jose';

/**
 * Test JWKS server for local JWT verification
 * Generates an RS256 key pair and serves the public key as JWKS
 */

let privateKey: any;
let publicKey: any;
let server: any;
let isRunning = false;

export async function startJWKSServer(port: number = 8765): Promise<{ url: string; privateKey: any }> {
  // Return existing server if already running
  if (isRunning && privateKey) {
    return {
      url: `http://localhost:${port}`,
      privateKey,
    };
  }

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

  await new Promise<void>((resolve, reject) => {
    server.listen(port, (err?: Error) => {
      if (err) {
        // Port already in use, another test file started the server
        console.log(`JWKS server already running on port ${port}`);
        isRunning = true;
        resolve();
      } else {
        console.log(`Test JWKS server listening on port ${port}`);
        isRunning = true;
        resolve();
      }
    });
    server.on('error', (err: any) => {
      if (err.code === 'EADDRINUSE') {
        // Port already in use, that's okay
        console.log(`JWKS server already running on port ${port}`);
        isRunning = true;
        resolve();
      } else {
        reject(err);
      }
    });
  });

  return {
    url: `http://localhost:${port}`,
    privateKey,
  };
}

export async function stopJWKSServer(): Promise<void> {
  if (server && isRunning) {
    await new Promise<void>((resolve, reject) => {
      server.close((err: Error) => {
        if (err) {
          // Server already closed, that's okay
          resolve();
        } else {
          isRunning = false;
          resolve();
        }
      });
    });
  }
}

export function getPrivateKey() {
  return privateKey;
}
