import { AppError, ErrorCode } from '@still-with-you/contracts';
import { and, eq, ne, or, sql, type SQL } from 'drizzle-orm';
import { findActiveMember } from './authz.js';
import { db, eventPeople, events, people } from './db/index.js';

type EventRow = typeof events.$inferSelect;

/** Active for every family member; archived only for `creator_account_id`. Never deleted. */
export function visibleEventCondition(accountId: string): SQL {
  return and(
    ne(events.status, 'deleted'),
    or(eq(events.status, 'active'), eq(events.creatorAccountId, accountId))
  )!;
}

export function eventIsVisibleTo(
  event: { status: string; creatorAccountId: string | null },
  accountId: string
): boolean {
  if (event.status === 'deleted') return false;
  if (event.status === 'archived') return event.creatorAccountId === accountId;
  return event.status === 'active';
}

export function personMemoryCountExpr(accountId: string) {
  return sql<number>`(
    select count(*)::int
    from ${eventPeople}
    inner join ${events} on ${events.id} = ${eventPeople.eventId}
    where ${eventPeople.personId} = ${people.id}
      and ${events.familyId} = ${people.familyId}
      and ${visibleEventCondition(accountId)}
  )`;
}

export async function countVisibleMemoriesForPerson(
  personId: string,
  familyId: string,
  accountId: string
): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(eventPeople)
    .innerJoin(events, eq(events.id, eventPeople.eventId))
    .where(
      and(
        eq(eventPeople.personId, personId),
        eq(events.familyId, familyId),
        visibleEventCondition(accountId)
      )
    );
  return Number(row?.count ?? 0);
}

export async function loadLiveEvent(id: string): Promise<EventRow> {
  const [event] = await db.select().from(events).where(eq(events.id, id)).limit(1);
  if (!event || event.status === 'deleted') {
    throw new AppError(ErrorCode.NOT_FOUND, 'Event not found', 404);
  }
  return event;
}

/**
 * Family member, not deleted, and archived only for the event creator.
 * Everyone else (steward, member, contributor) gets 404.
 */
export async function requireVisibleEvent(id: string, accountId: string): Promise<EventRow> {
  const event = await loadLiveEvent(id);
  await assertEventVisible(event, accountId, 'Event not found');
  return event;
}

export async function assertEventVisible(
  event: { familyId: string; status: string; creatorAccountId: string | null },
  accountId: string,
  notFoundMessage: string
): Promise<void> {
  const member = await findActiveMember(event.familyId, accountId);
  if (!member) {
    throw new AppError(ErrorCode.NOT_FOUND, notFoundMessage, 404);
  }
  if (!eventIsVisibleTo(event, accountId)) {
    throw new AppError(ErrorCode.NOT_FOUND, notFoundMessage, 404);
  }
}

/** Hide a contribution when its origin event is archived and the caller is not the event creator. */
export async function assertOriginEventVisible(
  originEventId: string,
  accountId: string,
  notFoundMessage: string
): Promise<EventRow | null> {
  const [origin] = await db.select().from(events).where(eq(events.id, originEventId)).limit(1);
  if (!origin || origin.status === 'deleted') {
    return origin ?? null;
  }
  if (origin.status === 'archived' && origin.creatorAccountId !== accountId) {
    throw new AppError(ErrorCode.NOT_FOUND, notFoundMessage, 404);
  }
  return origin;
}
