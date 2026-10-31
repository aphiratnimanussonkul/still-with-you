import { FastifyPluginAsync } from 'fastify';
import {
  AppError,
  ErrorCode,
  PERSON_SELF_EDITABLE_FIELDS,
  claimPersonSchema,
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
  accountAlreadyLinkedError,
  attachAvatar,
  findLiveLinkedPerson,
  insertPersonRelationship,
  inviteStatusFor,
  isFamilyAccountLiveViolation,
  mapRelationshipKind,
  parseBirthFields,
  parseDeathFields,
  resolvePersonName,
  toPersonResponse,
  uniqueViolationConstraint,
} from '../lib/people.js';

async function requireFamilyMember(familyId: string, accountId: string) {
  const [family] = await db.select().from(families).where(eq(families.id, familyId)).limit(1);
  const member = family ? await findActiveMember(familyId, accountId) : null;
  if (!family || !member) {
    throw new AppError(ErrorCode.NOT_FOUND, 'Family not found', 404);
  }
  return member;
}

async function loadPersonById(id: string) {
  const [person] = await db.select().from(people).where(eq(people.id, id)).limit(1);
  if (!person) {
    throw new AppError(ErrorCode.NOT_FOUND, 'Person not found', 404);
  }
  return person;
}

async function loadLivePerson(id: string) {
  const person = await loadPersonById(id);
  if (person.deletedAt) {
    throw new AppError(ErrorCode.NOT_FOUND, 'Person not found', 404);
  }
  return person;
}

function assertSelfEditableFields(body: unknown) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return;
  }
  const allowed = new Set<string>(PERSON_SELF_EDITABLE_FIELDS);
  for (const key of Object.keys(body as Record<string, unknown>)) {
    if (!allowed.has(key)) {
      throw new AppError(ErrorCode.FORBIDDEN, errorMessages[ErrorCode.FORBIDDEN], 403, key);
    }
  }
}

async function presentPerson(person: typeof people.$inferSelect, viewerAccountId: string) {
  const [pending] = await db
    .select({ id: invites.id })
    .from(invites)
    .where(and(eq(invites.personId, person.id), eq(invites.status, 'pending')))
    .limit(1);
  const memoryCount = await countVisibleMemoriesForPerson(person.id, person.familyId, viewerAccountId);
  return toPersonResponse(person, inviteStatusFor(person, pending?.id ?? null), undefined, memoryCount);
}

async function requirePersonFamilyMember(person: typeof people.$inferSelect, accountId: string) {
  const member = await findActiveMember(person.familyId, accountId);
  if (!member) {
    throw new AppError(ErrorCode.NOT_FOUND, 'Person not found', 404);
  }
  return member;
}

function requireFamilySteward(member: { role: string }) {
  if (!isFamilySteward(member.role)) {
    throw new AppError(ErrorCode.FORBIDDEN, 'This action requires the family steward (admin) role', 403);
  }
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

  // Steward only (`family_members.role = 'admin'`), with or without inline relationship. Non-member → 404.
  fastify.post<{ Params: { fid: string } }>('/families/:fid/people', async (request, reply) => {
    const member = await requireFamilyMember(request.params.fid, request.user!.id);
    requireFamilySteward(member);
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
    return reply.send(await presentPerson(person, request.user!.id));
  });

  // Admin: any field. Linked account (people.account_id = caller): PERSON_SELF_EDITABLE_FIELDS only.
  // Other members → 403; non-member → 404.
  fastify.patch<{ Params: { id: string } }>('/people/:id', async (request, reply) => {
    const person = await loadLivePerson(request.params.id);
    const member = await requirePersonFamilyMember(person, request.user!.id);
    const isAdmin = isFamilySteward(member.role);
    const isSelf = person.accountId === request.user!.id;
    if (!isAdmin) {
      if (!isSelf) {
        throw new AppError(ErrorCode.FORBIDDEN, errorMessages[ErrorCode.FORBIDDEN], 403);
      }
      assertSelfEditableFields(request.body);
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

    return reply.send(await presentPerson(updated, request.user!.id));
  });

  // Admin of the person's family. Links people.account_id to the CALLER (never another account).
  fastify.post<{ Params: { id: string } }>('/people/:id/claim', async (request, reply) => {
    claimPersonSchema.parse(request.body ?? {});
    const person = await loadPersonById(request.params.id);
    const member = await requirePersonFamilyMember(person, request.user!.id);
    requireFamilySteward(member);

    if (person.deletedAt) {
      throw new AppError(ErrorCode.PERSON_DELETED, errorMessages[ErrorCode.PERSON_DELETED], 422);
    }
    if (!person.isLiving) {
      throw new AppError(ErrorCode.PERSON_DECEASED, errorMessages[ErrorCode.PERSON_DECEASED], 422);
    }
    if (person.accountId) {
      throw new AppError(
        ErrorCode.PERSON_ALREADY_CLAIMED,
        errorMessages[ErrorCode.PERSON_ALREADY_CLAIMED],
        409
      );
    }

    const callerId = request.user!.id;
    const existing = await findLiveLinkedPerson(db, person.familyId, callerId);
    if (existing && existing.id !== person.id) {
      throw accountAlreadyLinkedError(existing);
    }

    try {
      const updated = await db.transaction(async (tx) => {
        const linked = await findLiveLinkedPerson(tx, person.familyId, callerId);
        if (linked && linked.id !== person.id) {
          throw accountAlreadyLinkedError(linked);
        }

        const [row] = await tx
          .update(people)
          .set({ accountId: callerId, updatedAt: new Date() })
          .where(and(eq(people.id, person.id), isNull(people.accountId)))
          .returning();

        if (!row) {
          throw new AppError(
            ErrorCode.PERSON_ALREADY_CLAIMED,
            errorMessages[ErrorCode.PERSON_ALREADY_CLAIMED],
            409
          );
        }
        return row;
      });

      return reply.send(await presentPerson(updated, callerId));
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      const constraint = uniqueViolationConstraint(error);
      if (constraint && isFamilyAccountLiveViolation(constraint)) {
        const linked = await findLiveLinkedPerson(db, person.familyId, callerId);
        if (linked && linked.id !== person.id) {
          throw accountAlreadyLinkedError(linked);
        }
        throw new AppError(
          ErrorCode.ACCOUNT_ALREADY_LINKED,
          errorMessages[ErrorCode.ACCOUNT_ALREADY_LINKED],
          409
        );
      }
      throw error;
    }
  });

  // Unlink people.account_id. Linked account or family admin; otherwise 403.
  fastify.delete<{ Params: { id: string } }>('/people/:id/claim', async (request, reply) => {
    const person = await loadLivePerson(request.params.id);
    const member = await requirePersonFamilyMember(person, request.user!.id);
    const isAdmin = isFamilySteward(member.role);
    const isOwner = person.accountId === request.user!.id;
    if (!isAdmin && !isOwner) {
      throw new AppError(ErrorCode.FORBIDDEN, errorMessages[ErrorCode.FORBIDDEN], 403);
    }

    const [updated] = await db
      .update(people)
      .set({ accountId: null, updatedAt: new Date() })
      .where(eq(people.id, person.id))
      .returning();

    return reply.send(await presentPerson(updated, request.user!.id));
  });

  // Steward only. Linked person (`account_id` set) → 409 PERSON_LINKED. Non-member → 404.
  fastify.delete<{ Params: { id: string } }>('/people/:id', async (request, reply) => {
    const person = await loadLivePerson(request.params.id);
    const member = await requirePersonFamilyMember(person, request.user!.id);
    requireFamilySteward(member);
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

  // Steward only (`family_members.role = 'admin'`). Edge creator / member → 403; non-member → 404. No PATCH.
  fastify.post<{ Params: { fid: string } }>('/families/:fid/relationships', async (request, reply) => {
    const member = await requireFamilyMember(request.params.fid, request.user!.id);
    requireFamilySteward(member);
    const body = createRelationshipSchema.parse(request.body);

    let personId = body.person_id;
    let relatedPersonId = body.related_person_id;
    if (body.type === 'spouse' && relatedPersonId < personId) {
      personId = body.related_person_id;
      relatedPersonId = body.person_id;
    }

    const created = await db.transaction(async (tx) => {
      return insertPersonRelationship(tx, {
        familyId: request.params.fid,
        personId,
        relatedPersonId,
        type: body.type,
        createdByAccountId: request.user!.id,
      });
    });

    return reply.status(201).send(toRelationshipResponse(created));
  });

  // Steward only. Edge creator who is not a steward → 403. Non-member / missing → 404.
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
    requireFamilySteward(member);
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
    requireFamilySteward(member);
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
