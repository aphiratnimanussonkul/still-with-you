import { FastifyPluginAsync } from 'fastify';
import { db, accounts, familyMembers, families, contributions, media, contributionRevisions, auditLog } from '../lib/db/index.js';
import { eq, and, isNull, sql } from 'drizzle-orm';
import { AppError, ErrorCode } from '@still-with-you/contracts';
import { hardDeleteMediaRows, hardDeleteStoryMedia } from '../lib/media/attach.js';

/**
 * Account deletion with comprehensive purge
 * DELETE /v1/me - Delete account and purge all data
 */
const accountDeletionRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.delete('/me', async (request, reply) => {
    const accountId = request.user!.id;

    // Execute entire deletion in a transaction
    await db.transaction(async (tx) => {
      // 1. Check last-admin constraints
      // Get families where user is an active member
      const userMemberships = await tx
        .select({
          familyId: familyMembers.familyId,
          role: familyMembers.role,
        })
        .from(familyMembers)
        .where(and(eq(familyMembers.accountId, accountId), isNull(familyMembers.leftAt)));

      const familyIds = userMemberships.map((m) => m.familyId);

      if (familyIds.length > 0) {
        // Lock all affected families FOR UPDATE to prevent races
        for (const familyId of familyIds) {
          await tx.select().from(families).where(eq(families.id, familyId)).for('update');
        }

        // For each family, check if user is last admin with other members
        for (const membership of userMemberships) {
          if (membership.role === 'admin') {
            // Count other active members
            const [result] = await tx
              .select({ count: sql<number>`count(*)::int` })
              .from(familyMembers)
              .where(
                and(
                  eq(familyMembers.familyId, membership.familyId),
                  isNull(familyMembers.leftAt),
                  sql`${familyMembers.accountId} != ${accountId}`
                )
              );

            const otherMembersCount = result?.count || 0;

            if (otherMembersCount > 0) {
              // Other members exist, check if any other admin
              const [adminResult] = await tx
                .select({ count: sql<number>`count(*)::int` })
                .from(familyMembers)
                .where(
                  and(
                    eq(familyMembers.familyId, membership.familyId),
                    eq(familyMembers.role, 'admin'),
                    isNull(familyMembers.leftAt),
                    sql`${familyMembers.accountId} != ${accountId}`
                  )
                );

              const otherAdminsCount = adminResult?.count || 0;

              if (otherAdminsCount === 0) {
                // This is last admin with other members - block deletion
                const [familyData] = await tx
                  .select({ name: families.name })
                  .from(families)
                  .where(eq(families.id, membership.familyId));

                throw new AppError(
                  ErrorCode.LAST_ADMIN,
                  `Cannot delete account: you are the last admin of "${familyData?.name || 'a family'}" which has other members. Promote another admin first.`,
                  409
                );
              }
            }
          }
        }
      }

      // 2. Purge all user's contributions
      const userContributions = await tx
        .select({ id: contributions.id })
        .from(contributions)
        .where(eq(contributions.ownerAccountId, accountId));

      const unattached = await tx
        .select({ id: media.id, storageKey: media.storageKey, thumbKey: media.thumbKey })
        .from(media)
        .where(eq(media.uploaderAccountId, accountId));
      await hardDeleteMediaRows(tx, unattached);

      for (const contrib of userContributions) {
        await hardDeleteStoryMedia(tx, [contrib.id]);

        // Hard delete revisions
        await tx.delete(contributionRevisions).where(eq(contributionRevisions.contributionId, contrib.id));

        // Mark contribution as purged (clear content)
        await tx
          .update(contributions)
          .set({
            status: 'purged',
            story: null,
          })
          .where(eq(contributions.id, contrib.id));

        // Audit log (ID only, no content)
        await tx.insert(auditLog).values({
          actorAccountId: accountId,
          action: 'contribution_purge',
          targetType: 'contribution',
          targetId: contrib.id,
        });
      }

      // 3. Delete families where user is sole member
      for (const familyId of familyIds) {
        const [memberCount] = await tx
          .select({ count: sql<number>`count(*)::int` })
          .from(familyMembers)
          .where(and(eq(familyMembers.familyId, familyId), isNull(familyMembers.leftAt)));

        if (memberCount?.count === 1) {
          // User is sole member, delete the family
          // Cascade will handle family_members, events, contributions, etc.
          await tx.delete(families).where(eq(families.id, familyId));

          // Audit log
          await tx.insert(auditLog).values({
            actorAccountId: accountId,
            action: 'family_delete',
            targetType: 'family',
            targetId: familyId,
          });
        }
      }

      // 4. Final audit log BEFORE deleting account (actor still exists)
      await tx.insert(auditLog).values({
        actorAccountId: accountId,
        action: 'account_delete',
        targetType: 'account',
        targetId: accountId,
      });

      // 5. Delete account (cascade handles family_members, notifications, etc.)
      await tx.delete(accounts).where(eq(accounts.id, accountId));
    });

    return reply.status(204).send();
  });
};

export default accountDeletionRoutes;
