import { FastifyPluginAsync } from 'fastify';
import {
  AppError,
  ErrorCode,
  EVENT_DELETE_CONFIRM_TEXT,
  createEventSchema,
  updateEventSchema,
  deleteEventSchema,
  errorMessages,
} from '@still-with-you/contracts';
import { and, eq, sql } from 'drizzle-orm';
import { db, events, contributions, eventPeople, auditLog, accounts } from '../lib/db/index.js';
import { getActiveMember, canManageEvent } from '../lib/authz.js';
import { archiveSchedule, presentEvent, presentEventRows } from '../lib/event-response.js';
import { requireVisibleEvent, visibleEventCondition } from '../lib/event-visibility.js';
import { assertPeopleInFamily } from '../lib/people.js';
import { attachMediaToStory, hardDeleteStoryMedia } from '../lib/media/attach.js';

/**
 * Event routes
 * Steward or creator may edit and archive active events (canManageEvent).
 * Archived events are visible to and restorable by the creator only.
 */
const eventRoutes: FastifyPluginAsync = async (fastify) => {
  // Create event (story required — becomes the first contribution)
  fastify.post<{ Params: { fid: string } }>('/families/:fid/events', async (request, reply) => {
    const { fid } = request.params;
    await getActiveMember(fid, request.user!.id);

    const body = createEventSchema.parse(request.body);

    const newEvent = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(events)
        .values({
          familyId: fid,
          creatorAccountId: request.user!.id,
          title: body.title,
          description: body.description,
          occurredFrom: body.occurred_from,
          occurredTo: body.occurred_to,
          datePrecision: body.date_precision,
          location: body.location,
          status: 'active',
        })
        .returning();

      const [story] = await tx
        .insert(contributions)
        .values({
          familyId: fid,
          ownerAccountId: request.user!.id,
          eventId: created.id,
          originEventId: created.id,
          originEventTitleSnapshot: created.title,
          story: body.story.trim(),
          status: 'published',
        })
        .returning();

      await attachMediaToStory(tx, {
        storyId: story.id,
        familyId: fid,
        authorId: request.user!.id,
        mediaIds: body.media_ids,
        replace: true,
      });

      await assertPeopleInFamily(tx, fid, body.person_ids);
      if (body.person_ids.length > 0) {
        await tx.insert(eventPeople).values(
          body.person_ids.map((personId) => ({
            eventId: created.id,
            personId,
          }))
        );
      }

      await tx.insert(auditLog).values({
        actorAccountId: request.user!.id,
        action: 'event_create',
        targetType: 'event',
        targetId: created.id,
      });

      return created;
    });

    return reply.status(201).send(await presentEvent(newEvent));
  });

  // List events: active for all members; archived only for creator_account_id
  fastify.get<{ Params: { fid: string } }>('/families/:fid/events', async (request, reply) => {
    const { fid } = request.params;
    await getActiveMember(fid, request.user!.id);

    const rows = await db
      .select({
        event: events,
        creatorDisplayName: accounts.displayName,
      })
      .from(events)
      .leftJoin(accounts, eq(accounts.id, events.creatorAccountId))
      .where(and(eq(events.familyId, fid), visibleEventCondition(request.user!.id)));

    return reply.send({ events: await presentEventRows(rows) });
  });

  fastify.get<{ Params: { id: string } }>('/events/:id', async (request, reply) => {
    const event = await requireVisibleEvent(request.params.id, request.user!.id);
    return reply.send(await presentEvent(event));
  });

  fastify.patch<{ Params: { id: string } }>('/events/:id', async (request, reply) => {
    const event = await requireVisibleEvent(request.params.id, request.user!.id);
    await getActiveMember(event.familyId, request.user!.id);

    if (!(await canManageEvent(event, request.user!.id))) {
      throw new AppError(ErrorCode.FORBIDDEN, 'You do not have permission to manage this event', 403);
    }

    if (event.status !== 'active') {
      throw new AppError(ErrorCode.EVENT_NOT_ACTIVE, 'Event must be active to edit', 409);
    }

    const body = updateEventSchema.parse(request.body);

    if (body.version === undefined) {
      const userAgent = request.headers['user-agent'];
      // Root logger (not request.log) so we do not attach req IP or other PII.
      fastify.log.warn(
        {
          event: 'event_patch_missing_version',
          event_id: event.id,
          account_id: request.user!.id,
          user_agent: Array.isArray(userAgent) ? userAgent[0] ?? null : userAgent ?? null,
        },
        'event_patch_missing_version'
      );
    }

    const updated = await db.transaction(async (tx) => {
      const [row] = await tx
        .update(events)
        .set({
          ...(body.title !== undefined && { title: body.title }),
          ...(body.description !== undefined && { description: body.description }),
          ...(body.occurred_from !== undefined && { occurredFrom: body.occurred_from }),
          ...(body.occurred_to !== undefined && { occurredTo: body.occurred_to }),
          ...(body.date_precision !== undefined && { datePrecision: body.date_precision }),
          ...(body.location !== undefined && { location: body.location }),
          updatedAt: new Date(),
          version: sql`${events.version} + 1`,
        })
        .where(and(eq(events.id, event.id), eq(events.version, body.version)))
        .returning();

      if (!row) {
        const [current] = await tx
          .select({ version: events.version })
          .from(events)
          .where(eq(events.id, event.id))
          .limit(1);
        throw new AppError(
          ErrorCode.EVENT_EDIT_CONFLICT,
          errorMessages[ErrorCode.EVENT_EDIT_CONFLICT],
          409,
          undefined,
          { current_version: current?.version ?? event.version }
        );
      }

      if (body.person_ids !== undefined) {
        await assertPeopleInFamily(tx, event.familyId, body.person_ids);
        await tx.delete(eventPeople).where(eq(eventPeople.eventId, event.id));
        if (body.person_ids.length > 0) {
          await tx.insert(eventPeople).values(
            body.person_ids.map((personId) => ({
              eventId: event.id,
              personId,
            }))
          );
        }
      }

      await tx.insert(auditLog).values({
        actorAccountId: request.user!.id,
        action: 'event_update',
        targetType: 'event',
        targetId: event.id,
      });

      return row;
    });

    return reply.send(await presentEvent(updated));
  });

  fastify.post<{ Params: { id: string } }>('/events/:id/archive', async (request, reply) => {
    const event = await requireVisibleEvent(request.params.id, request.user!.id);
    await getActiveMember(event.familyId, request.user!.id);

    if (!(await canManageEvent(event, request.user!.id))) {
      throw new AppError(ErrorCode.FORBIDDEN, 'You do not have permission to manage this event', 403);
    }

    // Re-archiving overwrites archived_at (no auto-delete job)
    const [updated] = await db
      .update(events)
      .set({
        status: 'archived',
        archivedAt: new Date(),
        updatedAt: new Date(),
        version: sql`${events.version} + 1`,
      })
      .where(eq(events.id, event.id))
      .returning();

    await db.insert(auditLog).values({
      actorAccountId: request.user!.id,
      action: 'event_archive',
      targetType: 'event',
      targetId: event.id,
    });

    return reply.send(await presentEvent(updated));
  });

  fastify.post<{ Params: { id: string } }>('/events/:id/unarchive', async (request, reply) => {
    const event = await requireVisibleEvent(request.params.id, request.user!.id);
    await getActiveMember(event.familyId, request.user!.id);

    if (!(await canManageEvent(event, request.user!.id))) {
      throw new AppError(ErrorCode.FORBIDDEN, 'You do not have permission to manage this event', 403);
    }

    const [updated] = await db
      .update(events)
      .set({
        status: 'active',
        archivedAt: null,
        updatedAt: new Date(),
        version: sql`${events.version} + 1`,
      })
      .where(eq(events.id, event.id))
      .returning();

    await db.insert(auditLog).values({
      actorAccountId: request.user!.id,
      action: 'event_unarchive',
      targetType: 'event',
      targetId: event.id,
    });

    return reply.send(await presentEvent(updated));
  });

  // Permanent delete (AC-19): archived, cooling elapsed, creator or steward; confirm "ลบเรื่องนี้".
  // Archived events the caller cannot see (including a steward who is not the creator) → 404.
  fastify.post<{ Params: { id: string } }>('/events/:id/delete', async (request, reply) => {
    const { id } = request.params;
    const event = await requireVisibleEvent(id, request.user!.id);

    // Permission first: neither creator nor steward → 403 FORBIDDEN (no dates)
    const manager = await canManageEvent(event, request.user!.id);
    if (!manager) {
      throw new AppError(ErrorCode.FORBIDDEN, 'You do not have permission to permanently delete this event', 403);
    }

    const body = deleteEventSchema.parse(request.body);
    if (body.confirm_text.trim() !== EVENT_DELETE_CONFIRM_TEXT) {
      throw new AppError(ErrorCode.CONFIRM_TEXT_MISMATCH, 'Confirmation text does not match', 400, 'confirm_text');
    }

    await db.transaction(async (tx) => {
      // Claim with the DB clock before any side effects
      const [claimed] = await tx
        .update(events)
        .set({
          status: 'deleted',
          title: null,
          description: null,
          location: null,
          deletedAt: sql`now()`,
          updatedAt: sql`now()`,
          version: sql`${events.version} + 1`,
        })
        .where(
          and(
            eq(events.id, event.id),
            eq(events.status, 'archived'),
            sql`${events.archivedAt} <= now() - interval '7 days'`
          )
        )
        .returning();

      if (!claimed) {
        const [current] = await tx.select().from(events).where(eq(events.id, event.id)).limit(1);
        throw new AppError(
          ErrorCode.NOT_YET_DELETABLE,
          'Event can be permanently deleted only after it has been archived for 7 days',
          403,
          undefined,
          archiveSchedule(current?.archivedAt ?? null)
        );
      }

      const eventStories = await tx
        .select({ id: contributions.id })
        .from(contributions)
        .where(eq(contributions.originEventId, event.id));

      await hardDeleteStoryMedia(
        tx,
        eventStories.map((row) => row.id)
      );

      await tx
        .update(contributions)
        .set({
          status: 'trashed',
          eventId: null,
          trashedAt: new Date(),
          trashReason: 'event_deleted',
          updatedAt: new Date(),
        })
        .where(eq(contributions.eventId, event.id));

      await tx.insert(auditLog).values({
        actorAccountId: request.user!.id,
        action: 'event_delete',
        targetType: 'event',
        targetId: event.id,
      });
    });

    return reply.status(204).send();
  });
};

export default eventRoutes;
