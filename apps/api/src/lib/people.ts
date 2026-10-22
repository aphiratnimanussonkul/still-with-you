import { and, eq, inArray, isNull } from 'drizzle-orm';
import {
  AppError,
  ErrorCode,
  errorMessages,
  MEDIA_READ_TTL_SECONDS,
  type CreatePerson,
  type UpdatePerson,
} from '@still-with-you/contracts';
import { db, media, people, personRelationships } from './db/index.js';
import { asYmd, computeAge, isFutureBirthDate, normalizeBirthDate, type BirthDatePrecision } from './age.js';
import { getMediaStorage } from './media/storage.js';

type QueryClient = Pick<typeof db, 'select' | 'update'>;

export type PersonRow = typeof people.$inferSelect;

/**
 * Every person_id must belong to the given family and not be soft-deleted.
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
    .where(
      and(eq(people.familyId, familyId), inArray(people.id, unique), isNull(people.deletedAt))
    );

  if (rows.length !== unique.length) {
    throw new AppError(
      ErrorCode.INVALID_INPUT,
      'Every person_id must belong to this family',
      400,
      'person_ids'
    );
  }
}

export function resolvePersonName(
  body: { display_name?: string; name?: string },
  required: boolean
): { displayName: string | undefined; field: 'display_name' | 'name' } {
  const usedDisplay = body.display_name !== undefined;
  const usedName = body.name !== undefined;
  const field: 'display_name' | 'name' = usedDisplay || !usedName ? 'display_name' : 'name';
  const raw = usedDisplay ? body.display_name : body.name;
  const displayName = raw?.trim();
  if (required && !displayName) {
    throw new AppError(ErrorCode.NAME_REQUIRED, errorMessages[ErrorCode.NAME_REQUIRED], 400, field);
  }
  if (raw !== undefined && !displayName) {
    throw new AppError(ErrorCode.NAME_REQUIRED, errorMessages[ErrorCode.NAME_REQUIRED], 400, field);
  }
  return { displayName, field };
}

export function parseBirthFields(body: CreatePerson | UpdatePerson): {
  birthDate: string | null | undefined;
  precision: BirthDatePrecision | undefined;
} {
  const precision: BirthDatePrecision | undefined =
    body.birth_date_precision ??
    (body.birth_date && /^\d{4}$/.test(body.birth_date) ? 'year' : undefined);

  if (body.birth_date === undefined) {
    return { birthDate: undefined, precision };
  }
  if (body.birth_date === null) {
    return { birthDate: null, precision: precision ?? 'day' };
  }
  const resolvedPrecision: BirthDatePrecision = precision ?? 'day';
  const normalized = normalizeBirthDate(body.birth_date, resolvedPrecision);
  if (normalized && isFutureBirthDate(normalized)) {
    throw new AppError(
      ErrorCode.INVALID_BIRTH_DATE,
      errorMessages[ErrorCode.INVALID_BIRTH_DATE],
      400,
      'birth_date'
    );
  }
  return { birthDate: normalized, precision: resolvedPrecision };
}

export async function assertAvatarMedia(
  client: QueryClient,
  opts: {
    mediaId: string;
    familyId: string;
    personId?: string;
  }
): Promise<typeof media.$inferSelect> {
  const [row] = await client
    .select()
    .from(media)
    .where(and(eq(media.id, opts.mediaId), isNull(media.deletedAt)))
    .limit(1);

  if (!row) {
    throw new AppError(ErrorCode.INVALID_INPUT, 'avatar_media_id is unknown', 400, 'avatar_media_id');
  }

  if (row.purpose !== 'avatar' || row.familyId !== opts.familyId) {
    throw new AppError(
      ErrorCode.UPLOAD_MISMATCH,
      'Avatar media must have purpose avatar and belong to this family',
      422,
      'avatar_media_id'
    );
  }

  if (row.status !== 'uploaded' && row.status !== 'ready') {
    throw new AppError(
      ErrorCode.MEDIA_NOT_READY,
      'Avatar is not ready to attach',
      409,
      undefined,
      { media_ids: [row.id] }
    );
  }

  if (row.personId && row.personId !== opts.personId) {
    throw new AppError(
      ErrorCode.INVALID_INPUT,
      'Avatar is already attached to another person',
      400,
      'avatar_media_id'
    );
  }

  return row;
}

export async function attachAvatar(
  client: QueryClient,
  opts: {
    personId: string;
    familyId: string;
    mediaId: string | null;
  }
): Promise<void> {
  const [person] = await client.select().from(people).where(eq(people.id, opts.personId)).limit(1);
  const previousId = person?.avatarMediaId ?? null;

  if (opts.mediaId === null) {
    if (previousId) {
      await client
        .update(media)
        .set({ personId: null, deletedAt: new Date() })
        .where(eq(media.id, previousId));
    }
    await client
      .update(people)
      .set({ avatarMediaId: null, updatedAt: new Date() })
      .where(eq(people.id, opts.personId));
    return;
  }

  await assertAvatarMedia(client, {
    mediaId: opts.mediaId,
    familyId: opts.familyId,
    personId: opts.personId,
  });

  if (previousId && previousId !== opts.mediaId) {
    await client
      .update(media)
      .set({ personId: null, deletedAt: new Date() })
      .where(eq(media.id, previousId));
  }

  await client
    .update(media)
    .set({ personId: opts.personId, deletedAt: null })
    .where(eq(media.id, opts.mediaId));

  await client
    .update(people)
    .set({ avatarMediaId: opts.mediaId, updatedAt: new Date() })
    .where(eq(people.id, opts.personId));
}

export async function wouldCreateParentCycle(
  client: QueryClient,
  parentId: string,
  childId: string
): Promise<boolean> {
  if (parentId === childId) return true;
  const visited = new Set<string>();
  const queue = [parentId];
  while (queue.length > 0) {
    const current = queue.pop()!;
    if (current === childId) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    const parents = await client
      .select({ personId: personRelationships.personId })
      .from(personRelationships)
      .where(
        and(eq(personRelationships.relatedPersonId, current), eq(personRelationships.type, 'parent'))
      );
    for (const row of parents) {
      queue.push(row.personId);
    }
  }
  return false;
}

export async function toPersonResponse(
  person: PersonRow,
  inviteStatus: 'none' | 'pending' | 'linked',
  avatarRow?: typeof media.$inferSelect | null
) {
  let avatarUrl: string | null = null;
  let row = avatarRow;
  if (row === undefined && person.avatarMediaId) {
    const [found] = await db
      .select()
      .from(media)
      .where(and(eq(media.id, person.avatarMediaId), isNull(media.deletedAt)))
      .limit(1);
    row = found ?? null;
  }
  if (row?.id && (row.status === 'uploaded' || row.status === 'ready')) {
    const signed = await getMediaStorage().createSignedReadUrl(row.storageKey, MEDIA_READ_TTL_SECONDS);
    avatarUrl = signed.signedUrl;
  }

  return {
    id: person.id,
    family_id: person.familyId,
    display_name: person.displayName,
    name: person.displayName,
    family_name: person.familyName,
    relation_label: person.relationLabel,
    gender: person.gender,
    birth_date: person.birthDate ? asYmd(person.birthDate) : null,
    birth_date_precision: person.birthDatePrecision,
    age: computeAge(person.birthDate ?? null, person.birthDatePrecision),
    bio: person.bio,
    avatar_media_id: person.avatarMediaId,
    avatar_url: avatarUrl,
    account_id: person.accountId,
    invite_status: inviteStatus,
    created_by_account_id: person.createdByAccountId,
    created_at: person.createdAt.toISOString(),
    updated_at: person.updatedAt.toISOString(),
    deleted_at: person.deletedAt ? person.deletedAt.toISOString() : null,
  };
}

export function inviteStatusFor(
  person: Pick<PersonRow, 'accountId'>,
  pendingInviteId: string | null
): 'none' | 'pending' | 'linked' {
  if (person.accountId) return 'linked';
  if (pendingInviteId) return 'pending';
  return 'none';
}
