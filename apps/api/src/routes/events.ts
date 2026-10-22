import { FastifyPluginAsync } from 'fastify';
import {
  AppError,
  ErrorCode,
  EVENT_DELETE_CONFIRM_TEXT,
  createEventSchema,
  updateEventSchema,
  deleteEventSchema,
} from '@still-with-you/contracts';
import { and, eq, ne, sql } from 'drizzle-orm';
import { db, events, contributions, eventPeople, auditLog } from '../lib/db/index.js';
import { findActiveMember, getActiveMember, canManageEvent, isFamilySteward } from '../lib/authz.js';
import { archiveSchedule, isPastDeleteCooling, toEventResponse } from '../lib/event-response.js';

/**
 * Event routes
 * Steward (family_members.role = admin) or creator may edit, archive, restore, delete.
 */
const eventRoutes: FastifyPluginAsync = async (fastify) => {
  async function loadEvent(id: string) {
    const [event] = await db.select().from(events).where(eq(events.id, id)).limit(1);
    if (!event || event.status === 'deleted') {
      throw new AppError(ErrorCode.NOT_FOUND, 'Event not found', 404);
    }
    return event;
  }

  async function requireVisibleEvent(id: string, accountId: string) {
    const event = await loadEvent(id);
    const member = await findActiveMember(event.familyId, accountId);
    if (!member) {
      throw new AppError(ErrorCode.NOT_FOUND, 'Event not found', 404);
    }
    if (event.status === 'archived') {
      const manager = event.creatorAccountId === accountId || isFamilySteward(member.role);
      if (!manager) {
        throw new AppError(ErrorCode.NOT_FOUND, 'Event not found', 404);
      }
    }
    return event;
  }

  // Create event (story required — becomes the first contribution)
  fastify.post<{ Params: { fid: string } }>('/families/:fid/events', async (request, reply) => {
    const { fid } = request.params;
    await getActiveMember(fid, request.user!.id);

    const body = createEventSchema.parse(request.body);

    const [newEvent] = await db
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

    await db.insert(contributions).values({
      familyId: fid,
      ownerAccountId: request.user!.id,
      eventId: newEvent.id,
      originEventId: newEvent.id,
      originEventTitleSnapshot: newEvent.title,
      story: body.story.trim(),
      status: 'published',
    });

    if (body.person_ids.length > 0) {
      await db.insert(eventPeople).values(
        body.person_ids.map((personId) => ({
          eventId: newEvent.id,
          personId,
        }))
      );
    }

    await db.insert(auditLog).values({
      actorAccountId: request.user!.id,
      action: 'event_create',
      targetType: 'event',
      targetId: newEvent.id,
    });

    return reply.status(201).send(toEventResponse(newEvent));
  });

  // List events: active for all members; archived only for creator or steward
  fastify.get<{ Params: { fid: string } }>('/families/:fid/events', async (request, reply) => {
    const { fid } = request.params;
    const member = await getActiveMember(fid, request.user!.id);

    const rows = await db
      .select()
      .from(events)
      .where(and(eq(events.familyId, fid), ne(events.status, 'deleted')));

    const visible = rows.filter(
      (event) =>
        event.status === 'active' ||
        event.creatorAccountId === request.user!.id ||
        isFamilySteward(member.role)
    );

    return reply.send({ events: visible.map(toEventResponse) });
  });

  fastify.get<{ Params: { id: string } }>('/events/:id', async (request, reply) => {
    const event = await requireVisibleEvent(request.params.id, request.user!.id);
    return reply.send(toEventResponse(event));
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

    const [updated] = await db
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
      .where(eq(events.id, event.id))
      .returning();

    await db.insert(auditLog).values({
      actorAccountId: request.user!.id,
      action: 'event_update',
      targetType: 'event',
      targetId: event.id,
    });

    return reply.send(toEventResponse(updated));
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

    return reply.send(toEventResponse(updated));
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

    return reply.send(toEventResponse(updated));
  });

  // Permanent delete (AC-19): archived, cooling elapsed, creator or steward; confirm "ลบเรื่องนี้"
  fastify.post<{ Params: { id: string } }>('/events/:id/delete', async (request, reply) => {
    const { id } = request.params;
    const [event] = await db.select().from(events).where(eq(events.id, id)).limit(1);
    if (!event || event.status === 'deleted') {
      throw new AppError(ErrorCode.NOT_FOUND, 'Event not found', 404);
    }

    const member = await findActiveMember(event.familyId, request.user!.id);
    if (!member) {
      throw new AppError(ErrorCode.NOT_FOUND, 'Event not found', 404);
    }

    // Permission first: neither creator nor steward → 403 FORBIDDEN (no dates)
    const manager = await canManageEvent(event, request.user!.id);
    if (!manager) {
      throw new AppError(ErrorCode.FORBIDDEN, 'You do not have permission to permanently delete this event', 403);
    }

    // Manager but not archived, or cooling period not elapsed → 403 NOT_YET_DELETABLE
    const archivedLongEnough = event.status === 'archived' && isPastDeleteCooling(event.archivedAt);
    if (event.status !== 'archived' || !archivedLongEnough) {
      throw new AppError(
        ErrorCode.NOT_YET_DELETABLE,
        'Event can be permanently deleted only after it has been archived for 7 days',
        403,
        undefined,
        archiveSchedule(event.archivedAt)
      );
    }

    const body = deleteEventSchema.parse(request.body);
    if (body.confirm_text.trim() !== EVENT_DELETE_CONFIRM_TEXT) {
      throw new AppError(ErrorCode.CONFIRM_TEXT_MISMATCH, 'Confirmation text does not match', 400, 'confirm_text');
    }

    await db.transaction(async (tx) => {
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

      await tx
        .update(events)
        .set({
          status: 'deleted',
          title: null,
          description: null,
          location: null,
          deletedAt: new Date(),
          updatedAt: new Date(),
          version: sql`${events.version} + 1`,
        })
        .where(eq(events.id, event.id));

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
