import { and, asc, eq } from 'drizzle-orm';
import { db, focusPeople, media, people } from './db/index.js';
import { personMemoryCountExpr } from './event-visibility.js';
import { loadVariantKeys, signAvatarImage } from './media/variants.js';

export type FocusItem = {
  person: { id: string; display_name: string; name: string };
  photo_url: string | null;
  photo_url_expires_at: string | null;
  avatar_url: string | null;
  avatar_url_expires_at: string | null;
  avatar_placeholder: string | null;
  full_url: string | null;
  full_url_expires_at: string | null;
  memory_count: number;
  position: number;
};

export async function listFocusItems(familyId: string, accountId: string): Promise<FocusItem[]> {
  const rows = await db
    .select({
      personId: people.id,
      displayName: people.displayName,
      position: focusPeople.position,
      avatar: media,
      memoryCount: personMemoryCountExpr(accountId),
    })
    .from(focusPeople)
    .innerJoin(people, eq(people.id, focusPeople.personId))
    .leftJoin(media, eq(media.id, people.avatarMediaId))
    .where(and(eq(focusPeople.accountId, accountId), eq(focusPeople.familyId, familyId)))
    .orderBy(asc(focusPeople.position));

  const variants = await loadVariantKeys(
    rows.map((row) => row.avatar?.id).filter((id): id is string => Boolean(id))
  );

  return Promise.all(
    rows.map(async (row) => {
      const signed = await signAvatarImage(
        row.avatar,
        row.avatar ? variants.get(row.avatar.id) : undefined
      );
      return {
        person: { id: row.personId, display_name: row.displayName, name: row.displayName },
        photo_url: signed.url,
        photo_url_expires_at: signed.url_expires_at,
        avatar_url: signed.url,
        avatar_url_expires_at: signed.url_expires_at,
        avatar_placeholder: signed.placeholder,
        full_url: signed.full_url,
        full_url_expires_at: signed.full_url_expires_at,
        memory_count: Number(row.memoryCount ?? 0),
        position: row.position,
      };
    })
  );
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
