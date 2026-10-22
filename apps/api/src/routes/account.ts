import { FastifyPluginAsync } from 'fastify';
import { db, accounts, auditLog, contributions, events, families, familyMembers } from '../lib/db/index.js';
import { and, desc, eq, isNull, ne, sql } from 'drizzle-orm';
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
 * GET /v1/me/trash
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

  // Caller's restorable trashed stories (web GET /v1/me/trash).
  // Restorable = owner, status trashed, still an active family member,
  // origin event not archived (POST /contributions/:id/restore). No restore
  // deadline column exists on contributions.
  fastify.get('/me/trash', async (request, reply) => {
    const accountId = request.user!.id;
    const rows = await db
      .select({
        id: contributions.id,
        story: contributions.story,
        originEventTitle: events.title,
        familyName: families.name,
        familyId: families.id,
        trashedAt: contributions.trashedAt,
        createdAt: contributions.createdAt,
      })
      .from(contributions)
      .innerJoin(families, eq(families.id, contributions.familyId))
      .innerJoin(events, eq(events.id, contributions.originEventId))
      .innerJoin(
        familyMembers,
        and(
          eq(familyMembers.familyId, contributions.familyId),
          eq(familyMembers.accountId, accountId),
          isNull(familyMembers.leftAt)
        )
      )
      .where(
        and(
          eq(contributions.ownerAccountId, accountId),
          eq(contributions.status, 'trashed'),
          ne(events.status, 'archived')
        )
      )
      .orderBy(
        desc(sql`coalesce(${contributions.trashedAt}, ${contributions.createdAt})`),
        desc(contributions.createdAt)
      );

    return reply.send({
      items: rows.map((row) => ({
        id: row.id,
        story: row.story,
        origin_event_title: row.originEventTitle,
        family_name: row.familyName,
        family_id: row.familyId,
        trashed_at: (row.trashedAt ?? row.createdAt).toISOString(),
      })),
    });
  });
};

export default accountRoutes;
