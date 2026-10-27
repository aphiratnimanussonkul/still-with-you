import { and, eq, inArray, isNull } from 'drizzle-orm';
import {
  AppError,
  ErrorCode,
  errorMessages,
  AVATAR_TRANSFORM,
  MEDIA_AVATAR_COVER_TTL_SECONDS,
  type CreatePerson,
  type PersonRelationshipKind,
  type UpdatePerson,
} from '@still-with-you/contracts';
import { db, media, people, personRelationships } from './db/index.js';
import {
  asYmd,
  compareYmd,
  computePersonAge,
  isFutureBirthDate,
  normalizeBirthDate,
  type BirthDatePrecision,
} from './age.js';
import { env } from './env.js';
import { getMediaStorage } from './media/storage.js';

type QueryClient = Pick<typeof db, 'select' | 'update' | 'insert'>;

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

function invalidDeath(field: 'death_date' | 'death_date_precision' | 'is_living' = 'death_date'): never {
  throw new AppError(
    ErrorCode.INVALID_DEATH_DATE,
    errorMessages[ErrorCode.INVALID_DEATH_DATE],
    400,
    field
  );
}

export function parseDeathFields(
  body: CreatePerson | UpdatePerson,
  current: {
    isLiving: boolean;
    deathDate: string | Date | null;
    deathDatePrecision: BirthDatePrecision | null;
    birthDate: string | Date | null;
  }
): {
  isLiving: boolean;
  deathDate: string | null;
  deathPrecision: BirthDatePrecision | null;
} {
  const isLiving = body.is_living ?? current.isLiving;

  let deathDate: string | null;
  let deathPrecision: BirthDatePrecision | null;

  if (body.death_date === undefined) {
    deathDate = current.deathDate ? asYmd(current.deathDate) : null;
    deathPrecision =
      body.death_date_precision === undefined
        ? current.deathDatePrecision
        : body.death_date_precision;
  } else if (body.death_date === null) {
    deathDate = null;
    deathPrecision = null;
  } else {
    const inferred: BirthDatePrecision = /^\d{4}$/.test(body.death_date) ? 'year' : 'day';
    deathPrecision = body.death_date_precision ?? inferred;
    deathDate = normalizeBirthDate(body.death_date, deathPrecision);
  }

  if (body.death_date === undefined && body.death_date_precision !== undefined) {
    if (body.death_date_precision === null) {
      deathDate = null;
      deathPrecision = null;
    } else if (!deathDate) {
      invalidDeath('death_date_precision');
    }
  }

  if (deathDate && !deathPrecision) invalidDeath('death_date_precision');
  if (!deathDate && deathPrecision) invalidDeath('death_date_precision');
  if (deathDate && isLiving) invalidDeath('death_date');
  if (deathDate && isFutureBirthDate(deathDate)) invalidDeath('death_date');

  const birthDate = current.birthDate ? asYmd(current.birthDate) : null;
  if (deathDate && birthDate && compareYmd(deathDate, birthDate) < 0) {
    invalidDeath('death_date');
  }

  return { isLiving, deathDate, deathPrecision };
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

export function mapRelationshipKind(
  kind: PersonRelationshipKind,
  newPersonId: string,
  otherPersonId: string
): { personId: string; relatedPersonId: string; type: 'parent' | 'spouse' } {
  if (kind === 'parent_of') {
    return { personId: newPersonId, relatedPersonId: otherPersonId, type: 'parent' };
  }
  if (kind === 'child_of') {
    return { personId: otherPersonId, relatedPersonId: newPersonId, type: 'parent' };
  }
  const [personId, relatedPersonId] =
    otherPersonId < newPersonId ? [otherPersonId, newPersonId] : [newPersonId, otherPersonId];
  return { personId, relatedPersonId, type: 'spouse' };
}

export async function insertPersonRelationship(
  client: QueryClient,
  input: {
    familyId: string;
    personId: string;
    relatedPersonId: string;
    type: 'parent' | 'spouse';
    createdByAccountId: string;
    missingPersonField?: string;
  }
) {
  let personId = input.personId;
  let relatedPersonId = input.relatedPersonId;
  if (input.type === 'spouse' && relatedPersonId < personId) {
    personId = input.relatedPersonId;
    relatedPersonId = input.personId;
  }

  if (personId === relatedPersonId) {
    throw new AppError(
      ErrorCode.INVALID_RELATIONSHIP,
      errorMessages[ErrorCode.INVALID_RELATIONSHIP],
      400
    );
  }

  const [left] = await client
    .select({ id: people.id })
    .from(people)
    .where(
      and(eq(people.id, personId), eq(people.familyId, input.familyId), isNull(people.deletedAt))
    )
    .limit(1);
  const [right] = await client
    .select({ id: people.id })
    .from(people)
    .where(
      and(
        eq(people.id, relatedPersonId),
        eq(people.familyId, input.familyId),
        isNull(people.deletedAt)
      )
    )
    .limit(1);

  if (!left) {
    throw new AppError(
      ErrorCode.INVALID_INPUT,
      'person_id must belong to this family',
      400,
      input.missingPersonField ?? 'person_id'
    );
  }
  if (!right) {
    throw new AppError(
      ErrorCode.INVALID_INPUT,
      'related_person_id must belong to this family',
      400,
      input.missingPersonField ?? 'related_person_id'
    );
  }

  if (input.type === 'parent' && (await wouldCreateParentCycle(client, personId, relatedPersonId))) {
    throw new AppError(
      ErrorCode.INVALID_RELATIONSHIP,
      errorMessages[ErrorCode.INVALID_RELATIONSHIP],
      400
    );
  }

  const [existing] = await client
    .select({ id: personRelationships.id })
    .from(personRelationships)
    .where(
      and(
        eq(personRelationships.personId, personId),
        eq(personRelationships.relatedPersonId, relatedPersonId),
        eq(personRelationships.type, input.type)
      )
    )
    .limit(1);
  if (existing) {
    throw new AppError(ErrorCode.RELATIONSHIP_EXISTS, errorMessages[ErrorCode.RELATIONSHIP_EXISTS], 409);
  }

  const [created] = await client
    .insert(personRelationships)
    .values({
      familyId: input.familyId,
      personId,
      relatedPersonId,
      type: input.type,
      createdByAccountId: input.createdByAccountId,
    })
    .returning();
  return created;
}

export async function signAvatarUrl(row: typeof media.$inferSelect | null | undefined): Promise<string | null> {
  if (!row || row.deletedAt) return null;
  if (row.purpose !== 'avatar') return null;
  if (row.status !== 'uploaded' && row.status !== 'ready') return null;
  const signed = await getMediaStorage().createSignedReadUrl(
    row.storageKey,
    MEDIA_AVATAR_COVER_TTL_SECONDS,
    env.MEDIA_IMAGE_TRANSFORMS ? AVATAR_TRANSFORM : undefined
  );
  return signed.signedUrl;
}

export async function toPersonResponse(
  person: PersonRow,
  inviteStatus: 'none' | 'pending' | 'linked',
  avatarRow?: typeof media.$inferSelect | null,
  memoryCount = 0
) {
  let row = avatarRow;
  if (row === undefined && person.avatarMediaId) {
    const [found] = await db
      .select()
      .from(media)
      .where(and(eq(media.id, person.avatarMediaId), isNull(media.deletedAt)))
      .limit(1);
    row = found ?? null;
  }
  const avatarUrl = await signAvatarUrl(row);

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
    is_living: person.isLiving,
    death_date: person.deathDate ? asYmd(person.deathDate) : null,
    death_date_precision: (person.deathDatePrecision as BirthDatePrecision | null) ?? null,
    age: computePersonAge({
      isLiving: person.isLiving,
      birthDate: person.birthDate ?? null,
      birthPrecision: person.birthDatePrecision,
      deathDate: person.deathDate ?? null,
      deathPrecision: (person.deathDatePrecision as BirthDatePrecision | null) ?? null,
    }),
    bio: person.bio,
    avatar_media_id: person.avatarMediaId,
    avatar_url: avatarUrl,
    memory_count: memoryCount,
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
