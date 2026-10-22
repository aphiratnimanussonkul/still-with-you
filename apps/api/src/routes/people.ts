import { FastifyPluginAsync } from 'fastify';
import { AppError, ErrorCode, createPersonSchema } from '@still-with-you/contracts';
import { asc, eq } from 'drizzle-orm';
import { db, families, people } from '../lib/db/index.js';
import { findActiveMember } from '../lib/authz.js';

function toPersonResponse(
  person: typeof people.$inferSelect,
  relationLabel: string | null = null
) {
  return {
    id: person.id,
    family_id: person.familyId,
    name: person.displayName,
    relation_label: relationLabel,
    account_id: person.accountId,
  };
}

async function requireFamilyMember(familyId: string, accountId: string) {
  const [family] = await db.select().from(families).where(eq(families.id, familyId)).limit(1);
  const member = family ? await findActiveMember(familyId, accountId) : null;
  if (!family || !member) {
    throw new AppError(ErrorCode.NOT_FOUND, 'Family not found', 404);
  }
  return family;
}

const peopleRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Params: { fid: string } }>('/families/:fid/people', async (request, reply) => {
    await requireFamilyMember(request.params.fid, request.user!.id);

    const rows = await db
      .select()
      .from(people)
      .where(eq(people.familyId, request.params.fid))
      .orderBy(asc(people.displayName));

    return reply.send({
      people: rows.map((row) => toPersonResponse(row)),
    });
  });

  fastify.post<{ Params: { fid: string } }>('/families/:fid/people', async (request, reply) => {
    await requireFamilyMember(request.params.fid, request.user!.id);
    const body = createPersonSchema.parse(request.body);

    const [created] = await db
      .insert(people)
      .values({
        familyId: request.params.fid,
        displayName: body.name.trim(),
      })
      .returning();

    return reply.status(201).send(toPersonResponse(created, body.relation_label ?? null));
  });

  fastify.get<{ Params: { id: string } }>('/people/:id', async (request, reply) => {
    const [person] = await db.select().from(people).where(eq(people.id, request.params.id)).limit(1);
    if (!person) {
      throw new AppError(ErrorCode.NOT_FOUND, 'Person not found', 404);
    }
    const member = await findActiveMember(person.familyId, request.user!.id);
    if (!member) {
      throw new AppError(ErrorCode.NOT_FOUND, 'Person not found', 404);
    }
    return reply.send(toPersonResponse(person));
  });
};

export default peopleRoutes;
