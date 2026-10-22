import { and, eq, inArray } from 'drizzle-orm';
import { AppError, ErrorCode } from '@still-with-you/contracts';
import { db, people } from './db/index.js';

type QueryClient = Pick<typeof db, 'select'>;

/**
 * Every person_id must belong to the given family.
 * Rejects with the existing validation error (INVALID_INPUT) and field person_ids.
 */
export async function assertPeopleInFamily(
  client: QueryClient,
  familyId: string,
  personIds: string[]
): Promise<void> {
  const unique = [...new Set(personIds)];
  if (unique.length === 0) {
    return;
  }

  const rows = await client
    .select({ id: people.id })
    .from(people)
    .where(and(eq(people.familyId, familyId), inArray(people.id, unique)));

  if (rows.length !== unique.length) {
    throw new AppError(
      ErrorCode.INVALID_INPUT,
      'Every person_id must belong to this family',
      400,
      'person_ids'
    );
  }
}
