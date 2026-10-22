import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { db, eventPeople, events, focusPeople, people } from './db/index.js';

export type FocusItem = {
  person: { id: string; display_name: string };
  photo_url: null;
  memory_count: number;
  position: number;
};

export async function listFocusItems(familyId: string, accountId: string): Promise<FocusItem[]> {
  const rows = await db
    .select({
      personId: people.id,
      displayName: people.displayName,
      position: focusPeople.position,
    })
    .from(focusPeople)
    .innerJoin(people, eq(people.id, focusPeople.personId))
    .where(and(eq(focusPeople.accountId, accountId), eq(focusPeople.familyId, familyId)))
    .orderBy(asc(focusPeople.position));

  if (rows.length === 0) {
    return [];
  }

  const ids = rows.map((row) => row.personId);
  const counts = await db
    .select({
      personId: eventPeople.personId,
      count: sql<number>`count(*)::int`,
    })
    .from(eventPeople)
    .innerJoin(events, eq(events.id, eventPeople.eventId))
    .where(and(inArray(eventPeople.personId, ids), eq(events.status, 'active')))
    .groupBy(eventPeople.personId);

  const countByPerson = new Map(counts.map((row) => [row.personId, Number(row.count)]));

  return rows.map((row) => ({
    person: { id: row.personId, display_name: row.displayName },
    photo_url: null,
    memory_count: countByPerson.get(row.personId) ?? 0,
    position: row.position,
  }));
}

export function toFactResponse(row: {
  id: string;
  familyId: string;
  personId: string;
  questionId: string;
  authorAccountId: string;
  answerText: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    family_id: row.familyId,
    person_id: row.personId,
    question_id: row.questionId,
    author_account_id: row.authorAccountId,
    answer_text: row.answerText,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}
