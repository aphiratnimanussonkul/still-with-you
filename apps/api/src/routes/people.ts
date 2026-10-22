import { FastifyPluginAsync } from 'fastify';
import {
  AppError,
  ErrorCode,
  createPersonSchema,
  createRelationshipSchema,
  errorMessages,
  inviteMemberSchema,
  updatePersonSchema,
} from '@still-with-you/contracts';
import { and, asc, eq, isNull, or } from 'drizzle-orm';
import {
  accounts,
  db,
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
import {
  attachAvatar,
  inviteStatusFor,
  parseBirthFields,
  resolvePersonName,
  toPersonResponse,
  wouldCreateParentCycle,
} from '../lib/people.js';
import crypto from 'crypto';

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

    return reply.send({
      people: await Promise.all(
        rows.map((row) =>
          toPersonResponse(row.person, inviteStatusFor(row.person, row.pendingInviteId), row.avatar)
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
        const [updated] = await tx.select().from(people).where(eq(people.id, row.id)).limit(1);
        return updated;
      }
      return row;
    });

    return reply.status(201).send(await toPersonResponse(created, 'none'));
  });

  fastify.get<{ Params: { id: string } }>('/people/:id', async (request, reply) => {
    const person = await loadLivePerson(request.params.id);
    await requirePersonFamilyMember(person, request.user!.id);
    const [pending] = await db
      .select({ id: invites.id })
      .from(invites)
      .where(and(eq(invites.personId, person.id), eq(invites.status, 'pending')))
      .limit(1);
    return reply.send(await toPersonResponse(person, inviteStatusFor(person, pending?.id ?? null)));
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
    return reply.send(await toPersonResponse(updated, inviteStatusFor(updated, pending?.id ?? null)));
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

    if (body.person_id === body.related_person_id) {
      throw new AppError(
        ErrorCode.INVALID_RELATIONSHIP,
        errorMessages[ErrorCode.INVALID_RELATIONSHIP],
        400
      );
    }

    const [left] = await db
      .select()
      .from(people)
      .where(
        and(
          eq(people.id, body.person_id),
          eq(people.familyId, request.params.fid),
          isNull(people.deletedAt)
        )
      )
      .limit(1);
    const [right] = await db
      .select()
      .from(people)
      .where(
        and(
          eq(people.id, body.related_person_id),
          eq(people.familyId, request.params.fid),
          isNull(people.deletedAt)
        )
      )
      .limit(1);

    if (!left) {
      throw new AppError(ErrorCode.INVALID_INPUT, 'person_id must belong to this family', 400, 'person_id');
    }
    if (!right) {
      throw new AppError(
        ErrorCode.INVALID_INPUT,
        'related_person_id must belong to this family',
        400,
        'related_person_id'
      );
    }

    let personId = body.person_id;
    let relatedPersonId = body.related_person_id;
    if (body.type === 'spouse' && relatedPersonId < personId) {
      personId = body.related_person_id;
      relatedPersonId = body.person_id;
    }

    if (body.type === 'parent' && (await wouldCreateParentCycle(db, personId, relatedPersonId))) {
      throw new AppError(
        ErrorCode.INVALID_RELATIONSHIP,
        errorMessages[ErrorCode.INVALID_RELATIONSHIP],
        400
      );
    }

    const [existing] = await db
      .select()
      .from(personRelationships)
      .where(
        and(
          eq(personRelationships.personId, personId),
          eq(personRelationships.relatedPersonId, relatedPersonId),
          eq(personRelationships.type, body.type)
        )
      )
      .limit(1);
    if (existing) {
      throw new AppError(ErrorCode.RELATIONSHIP_EXISTS, errorMessages[ErrorCode.RELATIONSHIP_EXISTS], 409);
    }

    const [created] = await db
      .insert(personRelationships)
      .values({
        familyId: request.params.fid,
        personId,
        relatedPersonId,
        type: body.type,
        createdByAccountId: request.user!.id,
      })
      .returning();

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

    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const [invite] = await db
      .insert(invites)
      .values({
        familyId: person.familyId,
        email: body.email,
        role: 'member',
        invitedBy: request.user!.id,
        personId: person.id,
        tokenHash,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      })
      .returning();

    return reply.status(201).send({
      id: invite.id,
      family_id: invite.familyId,
      person_id: invite.personId,
      email: invite.email,
      status: invite.status,
      token,
      expires_at: invite.expiresAt.toISOString(),
      created_at: invite.createdAt.toISOString(),
    });
  });
};

export default peopleRoutes;
