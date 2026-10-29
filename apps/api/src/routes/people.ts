import { FastifyPluginAsync } from 'fastify';
import {
  AppError,
  ErrorCode,
  createPersonSchema,
  createRelationshipSchema,
  errorMessages,
  inviteMemberSchema,
  paginationQuerySchema,
  updatePersonSchema,
} from '@still-with-you/contracts';
import { and, asc, desc, eq, isNull, or, sql } from 'drizzle-orm';
import {
  accounts,
  db,
  eventPeople,
  events,
  families,
  focusPeople,
  invites,
  media,
  people,
  personFacts,
  personRelationships,
  questionSkips,
} from '../lib/db/index.js';
import { findActiveMember, isFamilySteward } from '../lib/authz.js';
import { decodeEventCursor, encodeEventCursor } from '../lib/cursor.js';
import { presentEventRows } from '../lib/event-response.js';
import {
  countVisibleMemoriesForPerson,
  personMemoryCountExpr,
  visibleEventCondition,
} from '../lib/event-visibility.js';
import { loadVariantKeys } from '../lib/media/variants.js';
import { inviteExpiresAt, mintInviteToken, publicInviteUrl } from '../lib/invites.js';
import {
  attachAvatar,
  insertPersonRelationship,
  inviteStatusFor,
  mapRelationshipKind,
  parseBirthFields,
  parseDeathFields,
  resolvePersonName,
  toPersonResponse,
} from '../lib/people.js';

async function requireFamilyMember(familyId: string, accountId: string) {
  const [family] = await db.select().from(families).where(eq(families.id, familyId)).limit(1);
  const member = family ? await findActiveMember(familyId, accountId) : null;
  if (!family || !member) {
    throw new AppError(ErrorCode.NOT_FOUND, 'Family not found', 404);
  }
  return member;
}

async function loadLivePerson(id: string) {
  const [person] = await db.select().from(people).where(eq(people.id, id)).limit(1);
  if (!person || person.deletedAt) {
    throw new AppError(ErrorCode.NOT_FOUND, 'Person not found', 404);
  }
  return person;
}

async function requirePersonFamilyMember(person: typeof people.$inferSelect, accountId: string) {
  const member = await findActiveMember(person.familyId, accountId);
  if (!member) {
    throw new AppError(ErrorCode.NOT_FOUND, 'Person not found', 404);
  }
  return member;
}

function canEditPerson(
  person: typeof people.$inferSelect,
  member: { role: string; accountId: string },
  accountId: string
) {
  return (
    person.createdByAccountId === accountId ||
    isFamilySteward(member.role) ||
    person.accountId === accountId
  );
}

function canDeletePerson(
  person: typeof people.$inferSelect,
  member: { role: string },
  accountId: string
) {
  return person.createdByAccountId === accountId || isFamilySteward(member.role);
}

function toRelationshipResponse(row: typeof personRelationships.$inferSelect) {
  return {
    id: row.id,
    family_id: row.familyId,
    person_id: row.personId,
    related_person_id: row.relatedPersonId,
    type: row.type,
    created_by_account_id: row.createdByAccountId,
    created_at: row.createdAt.toISOString(),
  };
}

const peopleRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Params: { fid: string } }>('/families/:fid/people', async (request, reply) => {
    await requireFamilyMember(request.params.fid, request.user!.id);

    const rows = await db
      .select({
        person: people,
        pendingInviteId: invites.id,
        avatar: media,
        memoryCount: personMemoryCountExpr(request.user!.id),
      })
      .from(people)
      .leftJoin(invites, and(eq(invites.personId, people.id), eq(invites.status, 'pending')))
      .leftJoin(media, eq(media.id, people.avatarMediaId))
      .where(and(eq(people.familyId, request.params.fid), isNull(people.deletedAt)))
      .orderBy(asc(people.displayName));

    const edges = await db
      .select()
      .from(personRelationships)
      .where(eq(personRelationships.familyId, request.params.fid));

    const variants = await loadVariantKeys(
      rows.map((row) => row.avatar?.id).filter((id): id is string => Boolean(id))
    );

    return reply.send({
      people: await Promise.all(
        rows.map((row) =>
          toPersonResponse(
            row.person,
            inviteStatusFor(row.person, row.pendingInviteId),
            row.avatar,
            Number(row.memoryCount ?? 0),
            row.avatar ? variants.get(row.avatar.id) : undefined
          )
        )
      ),
      relationships: edges.map(toRelationshipResponse),
    });
  });

  fastify.post<{ Params: { fid: string } }>('/families/:fid/people', async (request, reply) => {
    await requireFamilyMember(request.params.fid, request.user!.id);
    const body = createPersonSchema.parse(request.body);
    const { displayName } = resolvePersonName(body, true);
    const birth = parseBirthFields(body);
    const death = parseDeathFields(body, {
      isLiving: true,
      deathDate: null,
      deathDatePrecision: null,
      birthDate: birth.birthDate === undefined ? null : birth.birthDate,
    });

    const created = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(people)
        .values({
          familyId: request.params.fid,
          displayName: displayName!,
          familyName: body.family_name === undefined ? null : body.family_name,
          relationLabel: body.relation_label ?? null,
          gender: body.gender === undefined ? null : body.gender,
          birthDate: birth.birthDate === undefined ? null : birth.birthDate,
          birthDatePrecision: birth.precision ?? 'day',
          isLiving: death.isLiving,
          deathDate: death.deathDate,
          deathDatePrecision: death.deathPrecision,
          bio: body.bio === undefined ? null : body.bio,
          createdByAccountId: request.user!.id,
        })
        .returning();

      if (body.avatar_media_id) {
        await attachAvatar(tx, {
          personId: row.id,
          familyId: request.params.fid,
          mediaId: body.avatar_media_id,
        });
      }

      let relationship: typeof personRelationships.$inferSelect | null = null;
      if (body.relationship) {
        const mapped = mapRelationshipKind(body.relationship.kind, row.id, body.relationship.person_id);
        relationship = await insertPersonRelationship(tx, {
          familyId: request.params.fid,
          personId: mapped.personId,
          relatedPersonId: mapped.relatedPersonId,
          type: mapped.type,
          createdByAccountId: request.user!.id,
          missingPersonField: 'relationship.person_id',
        });
      }

      const [person] = await tx.select().from(people).where(eq(people.id, row.id)).limit(1);
      return { person: person!, relationship };
    });

    return reply.status(201).send({
      person: await toPersonResponse(created.person, 'none'),
      relationship: created.relationship ? toRelationshipResponse(created.relationship) : null,
    });
  });

  fastify.get<{ Params: { id: string } }>('/people/:id', async (request, reply) => {
    const person = await loadLivePerson(request.params.id);
    await requirePersonFamilyMember(person, request.user!.id);
    const [pending] = await db
      .select({ id: invites.id })
      .from(invites)
      .where(and(eq(invites.personId, person.id), eq(invites.status, 'pending')))
      .limit(1);
    const memoryCount = await countVisibleMemoriesForPerson(person.id, person.familyId, request.user!.id);
    return reply.send(
      await toPersonResponse(person, inviteStatusFor(person, pending?.id ?? null), undefined, memoryCount)
    );
  });

  fastify.patch<{ Params: { id: string } }>('/people/:id', async (request, reply) => {
    const person = await loadLivePerson(request.params.id);
    const member = await requirePersonFamilyMember(person, request.user!.id);
    if (!canEditPerson(person, member, request.user!.id)) {
      throw new AppError(ErrorCode.FORBIDDEN, 'You do not have permission to edit this person', 403);
    }

    const body = updatePersonSchema.parse(request.body);
    const name = resolvePersonName(body, false);
    const birth = parseBirthFields(body);
    const nextBirth = birth.birthDate === undefined ? person.birthDate : birth.birthDate;
    const death = parseDeathFields(body, {
      isLiving: person.isLiving,
      deathDate: person.deathDate,
      deathDatePrecision: (person.deathDatePrecision as 'day' | 'year' | null) ?? null,
      birthDate: nextBirth,
    });

    const updated = await db.transaction(async (tx) => {
      if (body.avatar_media_id !== undefined) {
        await attachAvatar(tx, {
          personId: person.id,
          familyId: person.familyId,
          mediaId: body.avatar_media_id,
        });
      }

      const [row] = await tx
        .update(people)
        .set({
          ...(name.displayName !== undefined && { displayName: name.displayName }),
          ...(body.family_name !== undefined && { familyName: body.family_name }),
          ...(body.relation_label !== undefined && { relationLabel: body.relation_label }),
          ...(body.gender !== undefined && { gender: body.gender }),
          ...(birth.birthDate !== undefined && { birthDate: birth.birthDate }),
          ...(birth.precision !== undefined && { birthDatePrecision: birth.precision }),
          ...(body.is_living !== undefined || body.death_date !== undefined || body.death_date_precision !== undefined
            ? {
                isLiving: death.isLiving,
                deathDate: death.deathDate,
                deathDatePrecision: death.deathPrecision,
              }
            : {}),
          ...(body.bio !== undefined && { bio: body.bio }),
          updatedAt: new Date(),
        })
        .where(eq(people.id, person.id))
        .returning();
      return row;
    });

    const [pending] = await db
      .select({ id: invites.id })
      .from(invites)
      .where(and(eq(invites.personId, person.id), eq(invites.status, 'pending')))
      .limit(1);
    const memoryCount = await countVisibleMemoriesForPerson(
      updated.id,
      updated.familyId,
      request.user!.id
    );
    return reply.send(
      await toPersonResponse(updated, inviteStatusFor(updated, pending?.id ?? null), undefined, memoryCount)
    );
  });

  fastify.delete<{ Params: { id: string } }>('/people/:id', async (request, reply) => {
    const person = await loadLivePerson(request.params.id);
    const member = await requirePersonFamilyMember(person, request.user!.id);
    if (!canDeletePerson(person, member, request.user!.id)) {
      throw new AppError(ErrorCode.FORBIDDEN, 'You do not have permission to delete this person', 403);
    }
    if (person.accountId) {
      throw new AppError(ErrorCode.PERSON_LINKED, errorMessages[ErrorCode.PERSON_LINKED], 409);
    }

    await db.transaction(async (tx) => {
      await tx.delete(personFacts).where(eq(personFacts.personId, person.id));
      await tx.delete(focusPeople).where(eq(focusPeople.personId, person.id));
      await tx.delete(questionSkips).where(eq(questionSkips.personId, person.id));
      await tx
        .delete(personRelationships)
        .where(
          or(
            eq(personRelationships.personId, person.id),
            eq(personRelationships.relatedPersonId, person.id)
          )
        );
      await tx
        .update(people)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(eq(people.id, person.id));
    });

    return reply.status(204).send();
  });

  fastify.post<{ Params: { fid: string } }>('/families/:fid/relationships', async (request, reply) => {
    await requireFamilyMember(request.params.fid, request.user!.id);
    const body = createRelationshipSchema.parse(request.body);

    let personId = body.person_id;
    let relatedPersonId = body.related_person_id;
    if (body.type === 'spouse' && relatedPersonId < personId) {
      personId = body.related_person_id;
      relatedPersonId = body.person_id;
    }

    const created = await insertPersonRelationship(db, {
      familyId: request.params.fid,
      personId,
      relatedPersonId,
      type: body.type,
      createdByAccountId: request.user!.id,
    });

    return reply.status(201).send(toRelationshipResponse(created));
  });

  fastify.delete<{ Params: { id: string } }>('/relationships/:id', async (request, reply) => {
    const [edge] = await db
      .select()
      .from(personRelationships)
      .where(eq(personRelationships.id, request.params.id))
      .limit(1);
    if (!edge) {
      throw new AppError(ErrorCode.NOT_FOUND, 'Relationship not found', 404);
    }
    const member = await findActiveMember(edge.familyId, request.user!.id);
    if (!member) {
      throw new AppError(ErrorCode.NOT_FOUND, 'Relationship not found', 404);
    }
    if (!isFamilySteward(member.role) && edge.createdByAccountId !== request.user!.id) {
      throw new AppError(ErrorCode.FORBIDDEN, 'You do not have permission to delete this relationship', 403);
    }
    await db.delete(personRelationships).where(eq(personRelationships.id, edge.id));
    return reply.status(204).send();
  });

  fastify.post<{ Params: { id: string } }>('/people/:id/invites', async (request, reply) => {
    const [person] = await db.select().from(people).where(eq(people.id, request.params.id)).limit(1);
    if (!person) {
      throw new AppError(ErrorCode.NOT_FOUND, 'Person not found', 404);
    }
    if (person.deletedAt) {
      throw new AppError(ErrorCode.INVITE_INVALID, errorMessages[ErrorCode.INVITE_INVALID], 410);
    }
    const member = await requirePersonFamilyMember(person, request.user!.id);
    if (!isFamilySteward(member.role)) {
      throw new AppError(ErrorCode.FORBIDDEN, 'This action requires the family steward (admin) role', 403);
    }
    if (person.accountId) {
      throw new AppError(
        ErrorCode.PERSON_ALREADY_LINKED,
        errorMessages[ErrorCode.PERSON_ALREADY_LINKED],
        409
      );
    }

    const body = inviteMemberSchema.parse(request.body);
    const [account] = await db.select().from(accounts).where(eq(accounts.email, body.email)).limit(1);
    if (!account) {
      throw new AppError(ErrorCode.NOT_FOUND, 'Account with this email not found', 404);
    }

    const [pending] = await db
      .select()
      .from(invites)
      .where(
        and(eq(invites.familyId, person.familyId), eq(invites.email, body.email), eq(invites.status, 'pending'))
      )
      .limit(1);
    if (pending) {
      throw new AppError(ErrorCode.FORBIDDEN, 'Invite already pending for this email', 403);
    }

    const { token, tokenHash } = mintInviteToken();
    const [invite] = await db
      .insert(invites)
      .values({
        familyId: person.familyId,
        email: body.email,
        role: 'member',
        invitedBy: request.user!.id,
        personId: person.id,
        tokenHash,
        expiresAt: inviteExpiresAt(),
      })
      .returning();

    return reply.status(201).send({
      id: invite.id,
      family_id: invite.familyId,
      person_id: invite.personId,
      email: invite.email,
      status: invite.status,
      url: publicInviteUrl(token),
      expires_at: invite.expiresAt.toISOString(),
      created_at: invite.createdAt.toISOString(),
    });
  });

  // Family members only. Archived events follow /families/{id}/events: creator only.
  fastify.get<{ Params: { id: string } }>('/people/:id/events', async (request, reply) => {
    const person = await loadLivePerson(request.params.id);
    await requirePersonFamilyMember(person, request.user!.id);
    const query = paginationQuerySchema.parse(request.query);

    const filters = [
      eq(eventPeople.personId, person.id),
      eq(events.familyId, person.familyId),
      visibleEventCondition(request.user!.id),
    ];
    if (query.cursor) {
      const cursor = decodeEventCursor(query.cursor);
      // Truncate to milliseconds so JS Date cursors match timestamptz values.
      filters.push(
        sql`(date_trunc('milliseconds', ${events.createdAt}), ${events.id}) < (${cursor.createdAt}::timestamptz, ${cursor.id}::uuid)`
      );
    }

    const rows = await db
      .select({
        event: events,
        creatorDisplayName: accounts.displayName,
      })
      .from(events)
      .innerJoin(eventPeople, eq(eventPeople.eventId, events.id))
      .leftJoin(accounts, eq(accounts.id, events.creatorAccountId))
      .where(and(...filters))
      .orderBy(desc(events.createdAt), desc(events.id))
      .limit(query.limit + 1);

    const page = rows.slice(0, query.limit);
    const last = page[page.length - 1];
    return reply.send({
      events: await presentEventRows(page),
      next_cursor:
        rows.length > query.limit && last ? encodeEventCursor(last.event.createdAt, last.event.id) : null,
    });
  });
};

export default peopleRoutes;
