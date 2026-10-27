import { FastifyPluginAsync } from 'fastify';
import {
  AppError,
  ErrorCode,
  FOCUS_MAX_PER_FAMILY,
  HOME_RECENT_MEMORIES_LIMIT,
  updateFocusSchema,
} from '@still-with-you/contracts';
import { and, desc, eq, ne } from 'drizzle-orm';
import { db, events, focusPeople } from '../lib/db/index.js';
import { getActiveMember } from '../lib/authz.js';
import { presentEvents } from '../lib/event-response.js';
import { listFocusItems } from '../lib/focus.js';
import { assertPeopleInFamily } from '../lib/people.js';
import { pickQuickQuestion } from '../lib/questions.js';

const focusRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Params: { fid: string } }>('/families/:fid/focus', async (request, reply) => {
    const { fid } = request.params;
    await getActiveMember(fid, request.user!.id);
    return reply.send({ items: await listFocusItems(fid, request.user!.id) });
  });

  fastify.put<{ Params: { fid: string } }>('/families/:fid/focus', async (request, reply) => {
    const { fid } = request.params;
    await getActiveMember(fid, request.user!.id);

    const body = updateFocusSchema.parse(request.body);
    const unique = [...new Set(body.person_ids)];
    if (unique.length !== body.person_ids.length) {
      throw new AppError(ErrorCode.INVALID_INPUT, 'person_ids must not contain duplicates', 400, 'person_ids');
    }
    if (unique.length > FOCUS_MAX_PER_FAMILY) {
      throw new AppError(ErrorCode.TOO_MANY_FOCUS, 'Too many focus people', 422);
    }

    await db.transaction(async (tx) => {
      await assertPeopleInFamily(tx, fid, unique);
      await tx
        .delete(focusPeople)
        .where(and(eq(focusPeople.accountId, request.user!.id), eq(focusPeople.familyId, fid)));
      if (unique.length > 0) {
        await tx.insert(focusPeople).values(
          unique.map((personId, position) => ({
            accountId: request.user!.id,
            familyId: fid,
            personId,
            position,
          }))
        );
      }
    });

    return reply.send({ items: await listFocusItems(fid, request.user!.id) });
  });

  fastify.get<{ Params: { fid: string } }>('/families/:fid/home', async (request, reply) => {
    const { fid } = request.params;
    await getActiveMember(fid, request.user!.id);

    const focus = await listFocusItems(fid, request.user!.id);
    const quickQuestion = await pickQuickQuestion(fid, request.user!.id);

    const recent = await db
      .select()
      .from(events)
      .where(and(eq(events.familyId, fid), ne(events.status, 'archived'), ne(events.status, 'deleted')))
      .orderBy(desc(events.createdAt))
      .limit(HOME_RECENT_MEMORIES_LIMIT);

    return reply.send({
      focus,
      quick_question: quickQuestion,
      recent_memories: await presentEvents(recent),
    });
  });
};

export default focusRoutes;
