import { FastifyPluginAsync } from 'fastify';
import {
  AppError,
  ErrorCode,
  notificationIdParamSchema,
  paginationQuerySchema,
} from '@still-with-you/contracts';
import { and, eq, isNull } from 'drizzle-orm';
import { db, notifications } from '../lib/db/index.js';
import { encodeEventCursor } from '../lib/cursor.js';
import {
  getPresentedNotification,
  listPresentedNotifications,
  unreadCountFor,
} from '../lib/notifications.js';

/**
 * GET /v1/me/notifications?cursor= — caller's notifications, newest first
 * POST /v1/notifications/:id/read — owner only; other accounts get 404
 */
const notificationRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/me/notifications', async (request, reply) => {
    const accountId = request.user!.id;
    const query = paginationQuerySchema.parse(request.query);

    const [unread, presented] = await Promise.all([
      unreadCountFor(accountId),
      listPresentedNotifications(accountId, query),
    ]);

    const page = presented.slice(0, query.limit);
    const last = page[page.length - 1];
    return reply.send({
      notifications: page,
      next_cursor: presented.length > query.limit && last ? encodeEventCursor(new Date(last.created_at), last.id) : null,
      unread_count: unread,
    });
  });

  fastify.post<{ Params: { id: string } }>('/notifications/:id/read', async (request, reply) => {
    const parsed = notificationIdParamSchema.safeParse(request.params);
    if (!parsed.success) {
      throw new AppError(ErrorCode.NOT_FOUND, 'Notification not found', 404);
    }
    const accountId = request.user!.id;
    const [row] = await db
      .select({ id: notifications.id, accountId: notifications.accountId, readAt: notifications.readAt })
      .from(notifications)
      .where(eq(notifications.id, parsed.data.id))
      .limit(1);

    if (!row || row.accountId !== accountId) {
      throw new AppError(ErrorCode.NOT_FOUND, 'Notification not found', 404);
    }

    if (!row.readAt) {
      await db
        .update(notifications)
        .set({ readAt: new Date() })
        .where(and(eq(notifications.id, row.id), eq(notifications.accountId, accountId), isNull(notifications.readAt)));
    }

    const presented = await getPresentedNotification(row.id, accountId);
    if (!presented) {
      throw new AppError(ErrorCode.NOT_FOUND, 'Notification not found', 404);
    }
    return reply.send(presented);
  });
};

export default notificationRoutes;
