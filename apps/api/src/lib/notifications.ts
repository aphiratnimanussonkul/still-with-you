import { db, notifications } from './db/index.js';

export const NotificationType = {
  CONTRIBUTION_ADDED: 'contribution_added',
  INVITE_ACCEPTED: 'invite_accepted',
} as const;

export type NotificationType = (typeof NotificationType)[keyof typeof NotificationType];

type InsertClient = {
  insert: typeof db.insert;
};

type NotificationRow = typeof notifications.$inferSelect;

/**
 * Insert a notification unless the recipient is the actor (no self-notify).
 */
export async function insertNotification(
  client: InsertClient,
  input: {
    accountId: string;
    actorAccountId: string;
    type: NotificationType;
    payload: Record<string, unknown>;
  }
) {
  if (!input.accountId || input.accountId === input.actorAccountId) {
    return;
  }
  await client.insert(notifications).values({
    accountId: input.accountId,
    type: input.type,
    payload: input.payload,
  });
}

export function toNotificationResponse(row: NotificationRow) {
  return {
    id: row.id,
    account_id: row.accountId,
    type: row.type,
    payload: (row.payload ?? {}) as Record<string, unknown>,
    created_at: row.createdAt.toISOString(),
    read_at: row.readAt ? row.readAt.toISOString() : null,
  };
}
