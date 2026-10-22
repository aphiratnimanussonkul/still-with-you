import { FastifyPluginAsync } from 'fastify';
import { AppError, ErrorCode, paginationQuerySchema } from '@still-with-you/contracts';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { db, notifications } from '../lib/db/index.js';
import { decodeEventCursor, encodeEventCursor } from '../lib/cursor.js';
import { toNotificationResponse } from '../lib/notifications.js';

/**
 * GET /v1/me/notifications?cursor= — caller's notifications, newest first
 * POST /v1/notifications/:id/read — owner only; other accounts get 404
 */
const notificationRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/me/notifications', async (request, reply) => {
    const accountId = request.user!.id;
    const query = paginationQuerySchema.parse(request.query);

    const filters = [eq(notifications.accountId, accountId)];
    if (query.cursor) {
      const cursor = decodeEventCursor(query.cursor);
      filters.push(
        sql`(date_trunc('milliseconds', ${notifications.createdAt}), ${notifications.id}) < (${cursor.createdAt}::timestamptz, ${cursor.id}::uuid)`
      );
    }

    const [unread, rows] = await Promise.all([
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(notifications)
        .where(and(eq(notifications.accountId, accountId), isNull(notifications.readAt))),
      db
        .select()
        .from(notifications)
        .where(and(...filters))
        .orderBy(desc(notifications.createdAt), desc(notifications.id))
        .limit(query.limit + 1),
    ]);

    const page = rows.slice(0, query.limit);
    const last = page[page.length - 1];
    return reply.send({
      notifications: page.map(toNotificationResponse),
      next_cursor:
        rows.length > query.limit && last ? encodeEventCursor(last.createdAt, last.id) : null,
      unread_count: unread[0]?.count ?? 0,
    });
  });

  fastify.post<{ Params: { id: string } }>('/notifications/:id/read', async (request, reply) => {
    const accountId = request.user!.id;
    const [row] = await db
      .select()
      .from(notifications)
      .where(eq(notifications.id, request.params.id))
      .limit(1);

    if (!row || row.accountId !== accountId) {
      throw new AppError(ErrorCode.NOT_FOUND, 'Notification not found', 404);
    }

    if (row.readAt) {
      return reply.send(toNotificationResponse(row));
    }

    const [updated] = await db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(and(eq(notifications.id, row.id), eq(notifications.accountId, accountId)))
      .returning();

    return reply.send(toNotificationResponse(updated ?? row));
  });
};

export default notificationRoutes;
