import { and, eq, inArray, isNull, sql as dsql } from 'drizzle-orm';
import {
  db,
  notifications,
  familyMembers,
  accounts,
  families,
  people,
  events,
  sql as pgSql,
} from './db/index.js';
import { decodeEventCursor } from './cursor.js';
import { eventIsVisibleTo } from './event-visibility.js';

export const NotificationType = {
  CONTRIBUTION_ADDED: 'contribution_added',
  INVITE_ACCEPTED: 'invite_accepted',
} as const;

export type NotificationType = (typeof NotificationType)[keyof typeof NotificationType];

type NotificationDb = {
  insert: typeof db.insert;
  select: typeof db.select;
};

const UUID_RE = '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';

/**
 * Insert a notification unless the recipient is the actor or is no longer an
 * active member of the family. Snapshot names now; GET returns that payload.
 */
export async function insertNotification(
  client: NotificationDb,
  input: {
    accountId: string | null;
    actorAccountId: string;
    familyId: string;
    type: typeof NotificationType.CONTRIBUTION_ADDED;
    eventId: string;
    eventTitle: string | null;
  } | {
    accountId: string | null;
    actorAccountId: string;
    familyId: string;
    type: typeof NotificationType.INVITE_ACCEPTED;
    personId: string | null;
  }
) {
  if (!input.accountId || input.accountId === input.actorAccountId) {
    return;
  }

  const [member] = await client
    .select({ accountId: familyMembers.accountId })
    .from(familyMembers)
    .where(
      and(
        eq(familyMembers.familyId, input.familyId),
        eq(familyMembers.accountId, input.accountId),
        isNull(familyMembers.leftAt)
      )
    )
    .limit(1);
  if (!member) {
    return;
  }

  const [actor] = await client
    .select({ displayName: accounts.displayName })
    .from(accounts)
    .where(eq(accounts.id, input.actorAccountId))
    .limit(1);
  const actorDisplayName = actor?.displayName ?? '';

  const payload =
    input.type === NotificationType.CONTRIBUTION_ADDED
      ? {
          actor_display_name: actorDisplayName,
          event_title: input.eventTitle ?? '',
          event_id: input.eventId,
          family_id: input.familyId,
        }
      : await snapshotInvitePayload(client, {
          actorDisplayName,
          familyId: input.familyId,
          personId: input.personId,
        });

  await client.insert(notifications).values({
    accountId: input.accountId,
    type: input.type,
    payload: jsonbObject(payload),
  });
}

/** Embed JSON as a jsonb object literal. Drizzle/postgres.js otherwise store a string. */
function jsonbObject(value: Record<string, unknown>) {
  return dsql.raw(`'${JSON.stringify(value).replace(/'/g, "''")}'::jsonb`);
}

async function snapshotInvitePayload(
  client: NotificationDb,
  input: { actorDisplayName: string; familyId: string; personId: string | null }
) {
  const [family] = await client
    .select({ name: families.name })
    .from(families)
    .where(eq(families.id, input.familyId))
    .limit(1);

  let personId: string | null = input.personId;
  let personDisplayName: string | null = null;
  if (personId) {
    const [person] = await client
      .select({
        id: people.id,
        displayName: people.displayName,
        deletedAt: people.deletedAt,
      })
      .from(people)
      .where(eq(people.id, personId))
      .limit(1);
    if (!person || person.deletedAt) {
      personId = null;
    } else {
      personDisplayName = person.displayName;
    }
  }

  return {
    actor_display_name: input.actorDisplayName,
    family_name: family?.name ?? '',
    family_id: input.familyId,
    person_id: personId,
    person_display_name: personDisplayName,
  };
}

function parsePayload(payload: unknown): Record<string, unknown> {
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    return payload as Record<string, unknown>;
  }
  if (typeof payload === 'string') {
    try {
      const parsed = JSON.parse(payload) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return {};
    }
  }
  return {};
}

type ListedRow = {
  id: string;
  type: string;
  payload: unknown;
  created_at: Date;
  read_at: Date | null;
};

type EventVisibility = { status: string; creatorAccountId: string | null };

function presentItem(
  row: ListedRow,
  accountId: string,
  eventsById: Map<string, EventVisibility>
) {
  const payload = parsePayload(row.payload);
  if (row.type === NotificationType.CONTRIBUTION_ADDED && typeof payload.event_id === 'string') {
    const event = eventsById.get(payload.event_id);
    if (event && (event.status === 'archived' || event.status === 'deleted') && !eventIsVisibleTo(event, accountId)) {
      payload.event_title = '';
    }
  }
  return {
    id: row.id,
    type: row.type,
    payload,
    created_at: new Date(row.created_at).toISOString(),
    read_at: row.read_at ? new Date(row.read_at).toISOString() : null,
  };
}

async function loadEventVisibility(eventIds: string[]): Promise<Map<string, EventVisibility>> {
  const unique = [...new Set(eventIds)];
  const map = new Map<string, EventVisibility>();
  if (unique.length === 0) return map;
  const rows = await db
    .select({
      id: events.id,
      status: events.status,
      creatorAccountId: events.creatorAccountId,
    })
    .from(events)
    .where(inArray(events.id, unique));
  for (const row of rows) {
    map.set(row.id, row);
  }
  return map;
}

function eventIdsFromRows(rows: ListedRow[]): string[] {
  return rows.flatMap((row) => {
    const payload = parsePayload(row.payload);
    return row.type === NotificationType.CONTRIBUTION_ADDED && typeof payload.event_id === 'string'
      ? [payload.event_id]
      : [];
  });
}

async function presentItems(rows: ListedRow[], accountId: string) {
  const eventsById = await loadEventVisibility(eventIdsFromRows(rows));
  return rows.map((row) => presentItem(row, accountId, eventsById));
}

function payloadFamilyId() {
  return pgSql`
    case
      when jsonb_typeof(notifications.payload) = 'object'
        and notifications.payload->>'family_id' ~ ${UUID_RE}
      then (notifications.payload->>'family_id')::uuid
      when jsonb_typeof(notifications.payload) = 'string'
        and left(trim(notifications.payload #>> '{}'), 1) = '{'
        and ((notifications.payload #>> '{}')::jsonb)->>'family_id' ~ ${UUID_RE}
      then (((notifications.payload #>> '{}')::jsonb)->>'family_id')::uuid
    end
  `;
}

function memberFamilyFilter(accountId: string) {
  return pgSql`
    notifications.account_id = ${accountId}
    and exists (
      select 1
      from family_members
      where family_members.account_id = notifications.account_id
        and family_members.left_at is null
        and family_members.family_id = ${payloadFamilyId()}
    )
  `;
}

export async function listPresentedNotifications(
  accountId: string,
  query: { cursor?: string; limit: number }
) {
  const cursor = query.cursor ? decodeEventCursor(query.cursor) : null;
  const rows = cursor
    ? await pgSql<ListedRow[]>`
        select notifications.id, notifications.type, notifications.payload,
               notifications.created_at, notifications.read_at
        from notifications
        where ${memberFamilyFilter(accountId)}
          and (date_trunc('milliseconds', notifications.created_at), notifications.id)
            < (${cursor.createdAt}::timestamptz, ${cursor.id}::uuid)
        order by notifications.created_at desc, notifications.id desc
        limit ${query.limit + 1}
      `
    : await pgSql<ListedRow[]>`
        select notifications.id, notifications.type, notifications.payload,
               notifications.created_at, notifications.read_at
        from notifications
        where ${memberFamilyFilter(accountId)}
        order by notifications.created_at desc, notifications.id desc
        limit ${query.limit + 1}
      `;

  return presentItems(rows, accountId);
}

export async function getPresentedNotification(id: string, accountId: string) {
  const rows = await pgSql<ListedRow[]>`
    select notifications.id, notifications.type, notifications.payload,
           notifications.created_at, notifications.read_at
    from notifications
    where notifications.id = ${id}::uuid
      and notifications.account_id = ${accountId}::uuid
    limit 1
  `;
  if (!rows[0]) return null;
  const [presented] = await presentItems(rows, accountId);
  return presented;
}

export async function unreadCountFor(accountId: string): Promise<number> {
  const rows = await pgSql<{ count: number }[]>`
    select count(*)::int as count
    from notifications
    where ${memberFamilyFilter(accountId)}
      and notifications.read_at is null
  `;
  return rows[0]?.count ?? 0;
}
