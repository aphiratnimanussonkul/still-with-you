import { FastifyPluginAsync, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { env } from '../lib/env.js';
import { db, accounts } from '../lib/db/index.js';
import { eq } from 'drizzle-orm';
import { AppError, ErrorCode } from '@still-with-you/contracts';

declare module 'fastify' {
  interface FastifyRequest {
    user?: {
      id: string;
      authId: string;
      email: string | null;
      displayName: string;
    };
  }
}

/**
 * JWT authentication plugin
 * Verifies Supabase access tokens via JWKS
 */
const authPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.decorateRequest('user', null);

  // Use test JWKS in test environment, otherwise remote JWKS
  let JWKS: ReturnType<typeof createRemoteJWKSet> | null = null;

  fastify.addHook('onRequest', async (request: FastifyRequest) => {
    // Initialize JWKS on first request
    if (!JWKS) {
      // In test environment, use injected local JWKS
      if (env.NODE_ENV === 'test' && (global as any).__TEST_JWKS__) {
        JWKS = (global as any).__TEST_JWKS__;
      } else {
        // Production: use remote JWKS
        JWKS = createRemoteJWKSet(new URL(env.JWKS_URI));
      }
    }
    // Skip auth for health check and public invite preview (token is the secret).
    // POST /v1/invites/:token/accept still requires login.
    if (isPublicUnauthenticated(request.method, request.url)) {
      return;
    }

    const authorization = request.headers.authorization;
    if (!authorization || !authorization.startsWith('Bearer ')) {
      throw new AppError(ErrorCode.UNAUTHENTICATED, 'Missing or invalid authorization header', 401);
    }

    const token = authorization.slice(7);

    try {
      // Verify JWT using JWKS
      if (!JWKS) {
        throw new AppError(ErrorCode.UNAUTHENTICATED, 'JWKS not initialized', 401);
      }

      const { payload } = await jwtVerify(token, JWKS, {
        issuer: env.JWT_ISSUER,
        audience: 'authenticated',
      });

      if (!payload.sub) {
        throw new AppError(ErrorCode.UNAUTHENTICATED, 'Invalid token payload', 401);
      }

      // Get or create account from database
      const authId = payload.sub;
      const email = payload.email as string | undefined;

      if (!email) {
        throw new AppError(ErrorCode.UNAUTHENTICATED, 'Email required for authentication', 401);
      }

      const displayName = (payload.user_metadata as any)?.full_name || email.split('@')[0];

      // Upsert account (insert if not exists, otherwise do nothing)
      await db
        .insert(accounts)
        .values({
          authId,
          email,
          displayName,
        })
        .onConflictDoNothing({ target: accounts.authId });

      // Fetch the account
      const [userAccount] = await db.select().from(accounts).where(eq(accounts.authId, authId)).limit(1);

      if (!userAccount) {
        throw new AppError(ErrorCode.UNAUTHENTICATED, 'Failed to load account', 401);
      }

      // Attach user to request
      request.user = {
        id: userAccount.id,
        authId: userAccount.authId,
        email: userAccount.email,
        displayName: userAccount.displayName,
      };
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      fastify.log.error({ error }, 'JWT verification failed');
      throw new AppError(ErrorCode.UNAUTHENTICATED, 'Invalid or expired token', 401);
    }
  });
};

function isPublicUnauthenticated(method: string, url: string): boolean {
  const pathname = url.split('?')[0] ?? '';
  if (pathname === '/health') {
    return true;
  }
  return method === 'GET' && /^\/v1\/invites\/[^/]+$/.test(pathname);
}

export default fp(authPlugin, {
  name: 'auth',
});
