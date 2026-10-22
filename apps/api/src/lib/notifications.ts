import { and, eq, isNull, sql as dsql } from 'drizzle-orm';
import { db, notifications, sql as pgSql } from './db/index.js';
import { decodeEventCursor } from './cursor.js';

export const NotificationType = {
  CONTRIBUTION_ADDED: 'contribution_added',
  INVITE_ACCEPTED: 'invite_accepted',
} as const;

export type NotificationType = (typeof NotificationType)[keyof typeof NotificationType];

type InsertClient = {
  insert: typeof db.insert;
};

const UUID_RE = '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';

/**
 * Insert a notification unless the recipient is the actor (no self-notify).
 * Store ids only; names are resolved on read so renames show up.
 *
 * Payload is cast in SQL so jsonb is stored as an object. Drizzle's default
 * jsonb serializer otherwise double-encodes a JSON string, which breaks joins.
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
    payload: dsql`${JSON.stringify(input.payload)}::jsonb`,
  });
}

type PresentedRow = {
  id: string;
  account_id: string;
  type: string;
  payload: unknown;
  created_at: Date;
  read_at: Date | null;
  actor_display_name: string | null;
  event_title: string | null;
  event_status: 'active' | 'archived' | 'deleted' | null;
  event_id: string | null;
  family_name: string | null;
  family_id: string | null;
  live_person_id: string | null;
};

function presentRow(row: PresentedRow) {
  const eventGone = !row.event_status || row.event_status === 'deleted';
  const payload =
    row.type === NotificationType.CONTRIBUTION_ADDED
      ? {
          actor_display_name: row.actor_display_name,
          event_title: eventGone ? null : row.event_title,
          event_id: row.event_id,
        }
      : row.type === NotificationType.INVITE_ACCEPTED
        ? {
            actor_display_name: row.actor_display_name,
            family_name: row.family_name,
            family_id: row.family_id,
            person_id: row.live_person_id,
          }
        : row.payload && typeof row.payload === 'object'
          ? row.payload
          : {};

  return {
    id: row.id,
    account_id: row.account_id,
    type: row.type,
    payload,
    created_at: new Date(row.created_at).toISOString(),
    read_at: row.read_at ? new Date(row.read_at).toISOString() : null,
  };
}

/** One joined FROM clause. Unwraps drizzle's jsonb-as-string so id lookups work. */
function presentationFrom() {
  return pgSql`
    from notifications
    cross join lateral (
      select coalesce(
        case jsonb_typeof(notifications.payload)
          when 'object' then notifications.payload
          when 'string' then (
            case
              when left(trim(notifications.payload #>> '{}'), 1) = '{'
              then (notifications.payload #>> '{}')::jsonb
              else '{}'::jsonb
            end
          )
          else '{}'::jsonb
        end,
        '{}'::jsonb
      ) as body
    ) as stored
    left join accounts as notification_actors
      on notification_actors.id = case
        when stored.body->>'actor_account_id' ~ ${UUID_RE}
        then (stored.body->>'actor_account_id')::uuid
      end
    left join events
      on events.id = case
        when stored.body->>'event_id' ~ ${UUID_RE}
        then (stored.body->>'event_id')::uuid
      end
    left join families
      on families.id = case
        when stored.body->>'family_id' ~ ${UUID_RE}
        then (stored.body->>'family_id')::uuid
      end
    left join people
      on people.id = case
        when stored.body->>'person_id' ~ ${UUID_RE}
        then (stored.body->>'person_id')::uuid
      end
      and people.deleted_at is null
  `;
}

function presentedSelect() {
  return pgSql`
    notifications.id,
    notifications.account_id,
    notifications.type,
    stored.body as payload,
    notifications.created_at,
    notifications.read_at,
    notification_actors.display_name as actor_display_name,
    events.title as event_title,
    events.status as event_status,
    case
      when stored.body->>'event_id' ~ ${UUID_RE}
      then stored.body->>'event_id'
    end as event_id,
    families.name as family_name,
    case
      when stored.body->>'family_id' ~ ${UUID_RE}
      then stored.body->>'family_id'
    end as family_id,
    people.id as live_person_id
  `;
}

export async function listPresentedNotifications(
  accountId: string,
  query: { cursor?: string; limit: number }
) {
  const cursor = query.cursor ? decodeEventCursor(query.cursor) : null;
  const rows = cursor
    ? await pgSql<PresentedRow[]>`
        select ${presentedSelect()}
        ${presentationFrom()}
        where notifications.account_id = ${accountId}
          and (date_trunc('milliseconds', notifications.created_at), notifications.id)
            < (${cursor.createdAt}::timestamptz, ${cursor.id}::uuid)
        order by notifications.created_at desc, notifications.id desc
        limit ${query.limit + 1}
      `
    : await pgSql<PresentedRow[]>`
        select ${presentedSelect()}
        ${presentationFrom()}
        where notifications.account_id = ${accountId}
        order by notifications.created_at desc, notifications.id desc
        limit ${query.limit + 1}
      `;

  return rows.map(presentRow);
}

export async function getPresentedNotification(id: string, accountId: string) {
  const rows = await pgSql<PresentedRow[]>`
    select ${presentedSelect()}
    ${presentationFrom()}
    where notifications.id = ${id}::uuid
      and notifications.account_id = ${accountId}::uuid
    limit 1
  `;
  return rows[0] ? presentRow(rows[0]) : null;
}

export async function unreadCountFor(accountId: string): Promise<number> {
  const [row] = await db
    .select({ count: dsql<number>`count(*)::int` })
    .from(notifications)
    .where(and(eq(notifications.accountId, accountId), isNull(notifications.readAt)));
  return row?.count ?? 0;
}
