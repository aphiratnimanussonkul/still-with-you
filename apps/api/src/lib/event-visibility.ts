import { and, eq, ne, or, sql, type SQL } from 'drizzle-orm';
import { db, eventPeople, events, people } from './db/index.js';

/** Same visibility as GET /v1/people/{id}/events: non-deleted; archived only for steward or creator. */
export function visibleEventCondition(accountId: string, steward: boolean): SQL {
  if (steward) {
    return ne(events.status, 'deleted');
  }
  return and(
    ne(events.status, 'deleted'),
    or(eq(events.status, 'active'), eq(events.creatorAccountId, accountId))
  )!;
}

export function personMemoryCountExpr(accountId: string, steward: boolean) {
  return sql<number>`(
    select count(*)::int
    from ${eventPeople}
    inner join ${events} on ${events.id} = ${eventPeople.eventId}
    where ${eventPeople.personId} = ${people.id}
      and ${events.familyId} = ${people.familyId}
      and ${visibleEventCondition(accountId, steward)}
  )`;
}

export async function countVisibleMemoriesForPerson(
  personId: string,
  familyId: string,
  accountId: string,
  steward: boolean
): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(eventPeople)
    .innerJoin(events, eq(events.id, eventPeople.eventId))
    .where(
      and(
        eq(eventPeople.personId, personId),
        eq(events.familyId, familyId),
        visibleEventCondition(accountId, steward)
      )
    );
  return Number(row?.count ?? 0);
}
