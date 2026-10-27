import { FastifyPluginAsync } from 'fastify';
import { AppError, ErrorCode, createContributionSchema, updateContributionSchema } from '@still-with-you/contracts';
import { and, desc, eq } from 'drizzle-orm';
import { db, events, contributions, accounts, auditLog } from '../lib/db/index.js';
import { findActiveMember, getActiveMember, assertContributionOwner } from '../lib/authz.js';
import { assertOriginEventVisible, requireVisibleEvent } from '../lib/event-visibility.js';
import { attachMediaToStory, hardDeleteStoryMedia } from '../lib/media/attach.js';
import { presentStoryMedia } from '../lib/media/present.js';
import { insertNotification, NotificationType } from '../lib/notifications.js';

/**
 * Contribution routes — owner-only for edit/trash/restore/purge (AC-24).
 * Family stewards cannot edit or delete other members' stories or media.
 */
const contributionRoutes: FastifyPluginAsync = async (fastify) => {
  async function loadContribution(id: string) {
    const [contrib] = await db.select().from(contributions).where(eq(contributions.id, id)).limit(1);
    if (!contrib || contrib.status === 'purged') {
      throw new AppError(ErrorCode.NOT_FOUND, 'Contribution not found', 404);
    }
    return contrib;
  }

  async function toContributionResponse(
    contrib: typeof contributions.$inferSelect,
    accountId: string,
    ownerDisplayName?: string
  ) {
    const ownerName =
      ownerDisplayName ??
      (
        await db.select({ displayName: accounts.displayName }).from(accounts).where(eq(accounts.id, contrib.ownerAccountId)).limit(1)
      )[0]?.displayName ??
      '';
    return {
      id: contrib.id,
      family_id: contrib.familyId,
      owner_account_id: contrib.ownerAccountId,
      author_id: contrib.ownerAccountId,
      is_mine: contrib.ownerAccountId === accountId,
      owner_display_name: ownerName,
      narrator_person_id: contrib.narratorPersonId,
      event_id: contrib.eventId,
      origin_event_id: contrib.originEventId,
      origin_event_title_snapshot: contrib.originEventTitleSnapshot,
      story: contrib.story,
      status: contrib.status,
      trashed_at: contrib.trashedAt ? contrib.trashedAt.toISOString() : null,
      trash_reason: contrib.trashReason,
      derived_from_contribution_id: contrib.derivedFromContributionId,
      version: contrib.version,
      created_at: contrib.createdAt.toISOString(),
      updated_at: contrib.updatedAt.toISOString(),
      media: await presentStoryMedia(contrib, accountId),
    };
  }

  fastify.get<{ Params: { id: string } }>('/contributions/:id', async (request, reply) => {
    const contrib = await loadContribution(request.params.id);
    const member = await findActiveMember(contrib.familyId, request.user!.id);
    if (!member) {
      throw new AppError(ErrorCode.NOT_FOUND, 'Contribution not found', 404);
    }
    await assertOriginEventVisible(contrib.originEventId, request.user!.id, 'Contribution not found');
    return reply.send(await toContributionResponse(contrib, request.user!.id));
  });

  fastify.get<{ Params: { id: string } }>('/events/:id/contributions', async (request, reply) => {
    const event = await requireVisibleEvent(request.params.id, request.user!.id);

    const rows = await db
      .select({
        contribution: contributions,
        ownerDisplayName: accounts.displayName,
      })
      .from(contributions)
      .innerJoin(accounts, eq(accounts.id, contributions.ownerAccountId))
      .where(and(eq(contributions.eventId, event.id), eq(contributions.status, 'published')))
      .orderBy(desc(contributions.createdAt), desc(contributions.id));

    return reply.send({
      contributions: await Promise.all(
        rows.map((row) => toContributionResponse(row.contribution, request.user!.id, row.ownerDisplayName))
      ),
    });
  });

  // Add contribution — story required (AC-27)
  fastify.post<{ Params: { id: string } }>('/events/:id/contributions', async (request, reply) => {
    const [event] = await db.select().from(events).where(eq(events.id, request.params.id)).limit(1);
    if (!event || event.status === 'deleted') {
      throw new AppError(ErrorCode.NOT_FOUND, 'Event not found', 404);
    }

    await getActiveMember(event.familyId, request.user!.id);

    if (event.status === 'archived' && event.creatorAccountId !== request.user!.id) {
      throw new AppError(ErrorCode.NOT_FOUND, 'Event not found', 404);
    }

    if (event.status !== 'active') {
      throw new AppError(ErrorCode.EVENT_NOT_ACTIVE, 'Event must be active to add a contribution', 409);
    }

    const body = createContributionSchema.parse(request.body);

    const created = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(contributions)
        .values({
          familyId: event.familyId,
          ownerAccountId: request.user!.id,
          narratorPersonId: body.narrator_person_id,
          eventId: event.id,
          originEventId: event.id,
          originEventTitleSnapshot: event.title,
          story: body.story.trim(),
          status: 'published',
        })
        .returning();

      await attachMediaToStory(tx, {
        storyId: row.id,
        familyId: event.familyId,
        authorId: request.user!.id,
        mediaIds: body.media_ids,
        replace: true,
      });

      await tx.insert(auditLog).values({
        actorAccountId: request.user!.id,
        action: 'contribution_create',
        targetType: 'contribution',
        targetId: row.id,
      });

      await insertNotification(tx, {
        accountId: event.creatorAccountId,
        actorAccountId: request.user!.id,
        familyId: event.familyId,
        type: NotificationType.CONTRIBUTION_ADDED,
        eventId: event.id,
        eventTitle: event.title,
      });

      return row;
    });

    return reply.status(201).send(await toContributionResponse(created, request.user!.id));
  });

  fastify.patch<{ Params: { id: string } }>('/contributions/:id', async (request, reply) => {
    const contrib = await loadContribution(request.params.id);
    const member = await findActiveMember(contrib.familyId, request.user!.id);
    if (!member) {
      throw new AppError(ErrorCode.NOT_FOUND, 'Contribution not found', 404);
    }

    await assertOriginEventVisible(contrib.originEventId, request.user!.id, 'Contribution not found');
    assertContributionOwner(contrib.ownerAccountId, request.user!.id);

    const body = updateContributionSchema.parse(request.body);

    const updated = await db.transaction(async (tx) => {
      const [row] = await tx
        .update(contributions)
        .set({
          ...(body.story !== undefined && { story: body.story.trim() }),
          updatedAt: new Date(),
          version: contrib.version + 1,
        })
        .where(eq(contributions.id, contrib.id))
        .returning();

      if (body.media_ids !== undefined) {
        await attachMediaToStory(tx, {
          storyId: contrib.id,
          familyId: contrib.familyId,
          authorId: request.user!.id,
          mediaIds: body.media_ids,
          replace: true,
        });
      }

      await tx.insert(auditLog).values({
        actorAccountId: request.user!.id,
        action: 'contribution_update',
        targetType: 'contribution',
        targetId: contrib.id,
      });

      return row;
    });

    return reply.send(await toContributionResponse(updated, request.user!.id));
  });

  fastify.post<{ Params: { id: string } }>('/contributions/:id/trash', async (request, reply) => {
    const contrib = await loadContribution(request.params.id);
    const member = await findActiveMember(contrib.familyId, request.user!.id);
    if (!member) {
      throw new AppError(ErrorCode.NOT_FOUND, 'Contribution not found', 404);
    }

    await assertOriginEventVisible(contrib.originEventId, request.user!.id, 'Contribution not found');
    assertContributionOwner(contrib.ownerAccountId, request.user!.id);

    const [updated] = await db
      .update(contributions)
      .set({
        status: 'trashed',
        trashedAt: new Date(),
        trashReason: 'owner',
        updatedAt: new Date(),
      })
      .where(eq(contributions.id, contrib.id))
      .returning();

    return reply.send(await toContributionResponse(updated, request.user!.id));
  });

  fastify.post<{ Params: { id: string } }>('/contributions/:id/restore', async (request, reply) => {
    const contrib = await loadContribution(request.params.id);
    const member = await findActiveMember(contrib.familyId, request.user!.id);
    if (!member) {
      throw new AppError(ErrorCode.NOT_FOUND, 'Contribution not found', 404);
    }

    await assertOriginEventVisible(contrib.originEventId, request.user!.id, 'Contribution not found');
    assertContributionOwner(contrib.ownerAccountId, request.user!.id);

    const [origin] = await db.select().from(events).where(eq(events.id, contrib.originEventId)).limit(1);
    if (origin?.status === 'archived') {
      throw new AppError(ErrorCode.SOURCE_ARCHIVED, 'Cannot restore contribution when origin event is archived', 409);
    }

    const [updated] = await db
      .update(contributions)
      .set({
        status: 'published',
        trashedAt: null,
        trashReason: null,
        eventId: origin && origin.status === 'active' ? origin.id : contrib.eventId,
        updatedAt: new Date(),
      })
      .where(eq(contributions.id, contrib.id))
      .returning();

    return reply.send(await toContributionResponse(updated, request.user!.id));
  });

  fastify.delete<{ Params: { id: string } }>('/contributions/:id', async (request, reply) => {
    const contrib = await loadContribution(request.params.id);
    const member = await findActiveMember(contrib.familyId, request.user!.id);
    if (!member) {
      throw new AppError(ErrorCode.NOT_FOUND, 'Contribution not found', 404);
    }

    await assertOriginEventVisible(contrib.originEventId, request.user!.id, 'Contribution not found');
    assertContributionOwner(contrib.ownerAccountId, request.user!.id);

    await db.transaction(async (tx) => {
      await hardDeleteStoryMedia(tx, [contrib.id]);
      await tx
        .update(contributions)
        .set({
          status: 'purged',
          story: null,
          updatedAt: new Date(),
        })
        .where(eq(contributions.id, contrib.id));

      await tx.insert(auditLog).values({
        actorAccountId: request.user!.id,
        action: 'contribution_purge',
        targetType: 'contribution',
        targetId: contrib.id,
      });
    });

    return reply.status(204).send();
  });
};

export default contributionRoutes;
