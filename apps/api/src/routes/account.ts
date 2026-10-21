import { FastifyPluginAsync } from 'fastify';
import { db, account, auditLog } from '../lib/db/index.js';
import { eq } from 'drizzle-orm';
import { updateConsentSchema } from '@still-with-you/contracts';

/**
 * Account and consent routes
 * GET /v1/me
 * PATCH /v1/me/consent
 */
const accountRoutes: FastifyPluginAsync = async (fastify) => {
  // Get current account
  fastify.get('/me', async (request, reply) => {
    const [userAccount] = await db.select().from(account).where(eq(account.id, request.user!.id)).limit(1);

    return reply.send({
      id: userAccount.id,
      email: userAccount.email,
      display_name: userAccount.displayName,
      marketing_consent: userAccount.marketingConsent,
      marketing_consent_at: userAccount.marketingConsentAt?.toISOString() || null,
      created_at: userAccount.createdAt.toISOString(),
    });
  });

  // Update marketing consent
  fastify.patch('/me/consent', async (request, reply) => {
    const body = updateConsentSchema.parse(request.body);

    // Update consent
    const [updated] = await db
      .update(account)
      .set({
        marketingConsent: body.marketing_consent,
        marketingConsentAt: new Date(),
      })
      .where(eq(account.id, request.user!.id))
      .returning();

    // Write audit log (no content)
    await db.insert(auditLog).values({
      actorAccountId: request.user!.id,
      action: 'consent_update',
      targetType: 'account',
      targetId: request.user!.id,
    });

    return reply.send({
      id: updated.id,
      email: updated.email,
      display_name: updated.displayName,
      marketing_consent: updated.marketingConsent,
      marketing_consent_at: updated.marketingConsentAt?.toISOString() || null,
      created_at: updated.createdAt.toISOString(),
    });
  });
};

export default accountRoutes;
