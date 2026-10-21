import { FastifyPluginAsync, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { env } from '../lib/env.js';
import { db, account } from '../lib/db/index.js';
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

const JWKS = createRemoteJWKSet(new URL(env.JWKS_URI));

/**
 * JWT authentication plugin
 * Verifies Supabase access tokens via JWKS
 */
const authPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.decorateRequest('user', null);

  fastify.addHook('onRequest', async (request: FastifyRequest) => {
    // Skip auth for health check
    if (request.url === '/health') {
      return;
    }

    const authorization = request.headers.authorization;
    if (!authorization || !authorization.startsWith('Bearer ')) {
      throw new AppError(ErrorCode.UNAUTHENTICATED, 'Missing or invalid authorization header', 401);
    }

    const token = authorization.slice(7);

    try {
      // Verify JWT using Supabase JWKS
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

      let [userAccount] = await db.select().from(account).where(eq(account.authId, authId)).limit(1);

      // Create account if it doesn't exist (first login)
      if (!userAccount) {
        if (!email) {
          throw new AppError(ErrorCode.UNAUTHENTICATED, 'Email required for account creation', 401);
        }

        const displayName = (payload.user_metadata as any)?.full_name || email.split('@')[0];

        [userAccount] = await db
          .insert(account)
          .values({
            authId,
            email,
            displayName,
          })
          .returning();
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

export default fp(authPlugin, {
  name: 'auth',
});
