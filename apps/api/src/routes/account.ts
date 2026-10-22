import { FastifyPluginAsync } from 'fastify';
import { db, accounts, auditLog } from '../lib/db/index.js';
import { eq } from 'drizzle-orm';
import { updateConsentSchema } from '@still-with-you/contracts';

function toAccountResponse(userAccount: typeof accounts.$inferSelect) {
  return {
    id: userAccount.id,
    email: userAccount.email,
    display_name: userAccount.displayName,
    marketing_consent: userAccount.marketingConsent,
    marketing_consent_at: userAccount.marketingConsentAt?.toISOString() ?? null,
    consent_answered_at: userAccount.consentAnsweredAt?.toISOString() ?? null,
    created_at: userAccount.createdAt.toISOString(),
  };
}

/**
 * Account and consent routes
 * GET /v1/me
 * PATCH /v1/me/consent
 */
const accountRoutes: FastifyPluginAsync = async (fastify) => {
  // Get current account
  fastify.get('/me', async (request, reply) => {
    const [userAccount] = await db.select().from(accounts).where(eq(accounts.id, request.user!.id)).limit(1);

    return reply.send(toAccountResponse(userAccount));
  });

  // Update marketing consent
  fastify.patch('/me/consent', async (request, reply) => {
    const body = updateConsentSchema.parse(request.body);

    // Get current value
    const [current] = await db.select().from(accounts).where(eq(accounts.id, request.user!.id)).limit(1);

    const now = new Date();
    const valueChanged = current.marketingConsent !== body.marketing_consent;
    const updates: {
      marketingConsent: boolean;
      marketingConsentAt?: Date;
      consentAnsweredAt?: Date;
    } = { marketingConsent: body.marketing_consent };

    // marketing_consent_at is the time the value last changed
    if (valueChanged) {
      updates.marketingConsentAt = now;
    }
    // consent_answered_at is set on the first answer (true or false) and then kept
    if (!current.consentAnsweredAt) {
      updates.consentAnsweredAt = now;
    }

    const [updated] = await db
      .update(accounts)
      .set(updates)
      .where(eq(accounts.id, request.user!.id))
      .returning();

    // Write audit log only if value changed (no content)
    if (valueChanged) {
      await db.insert(auditLog).values({
        actorAccountId: request.user!.id,
        action: 'consent_update',
        targetType: 'account',
        targetId: request.user!.id,
      });
    }

    return reply.send(toAccountResponse(updated));
  });
};

export default accountRoutes;
