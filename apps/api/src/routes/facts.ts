import { FastifyPluginAsync } from 'fastify';
import {
  AppError,
  ErrorCode,
  createFactSchema,
  skipFactSchema,
  updateFactSchema,
} from '@still-with-you/contracts';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { db, accounts, people, personFacts, questionBank, questionSkips } from '../lib/db/index.js';
import { getActiveMember, isFamilySteward } from '../lib/authz.js';
import { toFactResponse } from '../lib/focus.js';
import { substituteQuestionName } from '../lib/questions.js';

const factsRoutes: FastifyPluginAsync = async (fastify) => {
  async function loadPersonInFamily(personId: string, accountId: string) {
    const [person] = await db.select().from(people).where(eq(people.id, personId)).limit(1);
    if (!person) {
      throw new AppError(ErrorCode.NOT_FOUND, 'Person not found', 404);
    }
    await getActiveMember(person.familyId, accountId);
    return person;
  }

  async function loadLiveFact(factId: string) {
    const [fact] = await db
      .select()
      .from(personFacts)
      .where(and(eq(personFacts.id, factId), isNull(personFacts.deletedAt)))
      .limit(1);
    if (!fact) {
      throw new AppError(ErrorCode.NOT_FOUND, 'Fact not found', 404);
    }
    return fact;
  }

  async function alreadyAnswered(personId: string, questionId: string, authorId: string) {
    const [existing] = await db
      .select()
      .from(personFacts)
      .where(
        and(
          eq(personFacts.personId, personId),
          eq(personFacts.questionId, questionId),
          eq(personFacts.authorAccountId, authorId),
          isNull(personFacts.deletedAt)
        )
      )
      .limit(1);
    return existing ?? null;
  }

  fastify.post<{ Params: { id: string } }>('/people/:id/facts', async (request, reply) => {
    const person = await loadPersonInFamily(request.params.id, request.user!.id);
    const body = createFactSchema.parse(request.body);
    const answerText = body.answer_text?.trim() ?? '';
    if (!answerText) {
      throw new AppError(ErrorCode.ANSWER_REQUIRED, 'answer_text is required', 400, 'answer_text');
    }

    const [question] = await db
      .select()
      .from(questionBank)
      .where(eq(questionBank.id, body.question_id))
      .limit(1);
    if (!question || !question.active) {
      throw new AppError(ErrorCode.INVALID_INPUT, 'Unknown or inactive question', 400, 'question_id');
    }

    const duplicate = await alreadyAnswered(person.id, question.id, request.user!.id);
    if (duplicate) {
      throw new AppError(
        ErrorCode.ALREADY_ANSWERED,
        'You have already answered this question for this person',
        409,
        undefined,
        { fact_id: duplicate.id }
      );
    }

    try {
      const [created] = await db
        .insert(personFacts)
        .values({
          familyId: person.familyId,
          personId: person.id,
          questionId: question.id,
          authorAccountId: request.user!.id,
          answerText,
        })
        .returning();
      return reply.status(201).send(toFactResponse(created));
    } catch (error: unknown) {
      const code = (error as { code?: string }).code;
      if (code === '23505') {
        const raced = await alreadyAnswered(person.id, question.id, request.user!.id);
        throw new AppError(
          ErrorCode.ALREADY_ANSWERED,
          'You have already answered this question for this person',
          409,
          undefined,
          { fact_id: raced?.id }
        );
      }
      throw error;
    }
  });

  fastify.post<{ Params: { id: string } }>('/people/:id/facts/skip', async (request, reply) => {
    const person = await loadPersonInFamily(request.params.id, request.user!.id);
    const body = skipFactSchema.parse(request.body);

    const [question] = await db
      .select({ id: questionBank.id })
      .from(questionBank)
      .where(eq(questionBank.id, body.question_id))
      .limit(1);
    if (!question) {
      throw new AppError(ErrorCode.INVALID_INPUT, 'Unknown question', 400, 'question_id');
    }

    await db
      .insert(questionSkips)
      .values({
        accountId: request.user!.id,
        personId: person.id,
        questionId: question.id,
        skippedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [questionSkips.accountId, questionSkips.personId, questionSkips.questionId],
        set: { skippedAt: new Date() },
      });

    return reply.status(204).send();
  });

  fastify.get<{ Params: { id: string } }>('/people/:id/facts', async (request, reply) => {
    const person = await loadPersonInFamily(request.params.id, request.user!.id);
    const member = await getActiveMember(person.familyId, request.user!.id);

    const rows = await db
      .select({
        fact: personFacts,
        question: questionBank,
        authorDisplayName: accounts.displayName,
      })
      .from(personFacts)
      .innerJoin(questionBank, eq(questionBank.id, personFacts.questionId))
      .innerJoin(accounts, eq(accounts.id, personFacts.authorAccountId))
      .where(and(eq(personFacts.personId, person.id), isNull(personFacts.deletedAt)))
      .orderBy(asc(questionBank.sort), asc(personFacts.createdAt));

    const groups = new Map<
      string,
      {
        question: { id: string; key: string; text: string };
        answers: Array<{
          id: string;
          answer_text: string;
          author: { account_id: string; display_name: string };
          created_at: string;
          updated_at: string;
          can_edit: boolean;
          can_delete: boolean;
        }>;
      }
    >();

    for (const row of rows) {
      let group = groups.get(row.question.id);
      if (!group) {
        group = {
          question: {
            id: row.question.id,
            key: row.question.key,
            text: substituteQuestionName(row.question.textTh, person.displayName),
          },
          answers: [],
        };
        groups.set(row.question.id, group);
      }
      const isAuthor = row.fact.authorAccountId === request.user!.id;
      group.answers.push({
        id: row.fact.id,
        answer_text: row.fact.answerText,
        author: { account_id: row.fact.authorAccountId, display_name: row.authorDisplayName },
        created_at: row.fact.createdAt.toISOString(),
        updated_at: row.fact.updatedAt.toISOString(),
        can_edit: isAuthor,
        can_delete: isAuthor || isFamilySteward(member.role),
      });
    }

    return reply.send({ groups: [...groups.values()] });
  });

  fastify.patch<{ Params: { id: string } }>('/facts/:id', async (request, reply) => {
    const fact = await loadLiveFact(request.params.id);
    await getActiveMember(fact.familyId, request.user!.id);

    if (fact.authorAccountId !== request.user!.id) {
      throw new AppError(ErrorCode.FORBIDDEN, 'Only the author can edit this answer', 403);
    }

    const body = updateFactSchema.parse(request.body);
    const answerText = body.answer_text?.trim() ?? '';
    if (!answerText) {
      throw new AppError(ErrorCode.ANSWER_REQUIRED, 'answer_text is required', 400, 'answer_text');
    }

    const [updated] = await db
      .update(personFacts)
      .set({ answerText, updatedAt: new Date() })
      .where(eq(personFacts.id, fact.id))
      .returning();

    return reply.send(toFactResponse(updated));
  });

  fastify.delete<{ Params: { id: string } }>('/facts/:id', async (request, reply) => {
    const fact = await loadLiveFact(request.params.id);
    const member = await getActiveMember(fact.familyId, request.user!.id);

    const isAuthor = fact.authorAccountId === request.user!.id;
    if (!isAuthor && !isFamilySteward(member.role)) {
      throw new AppError(ErrorCode.FORBIDDEN, 'Only the author or a family steward can delete this answer', 403);
    }

    await db.update(personFacts).set({ deletedAt: new Date() }).where(eq(personFacts.id, fact.id));
    return reply.status(204).send();
  });
};

export default factsRoutes;
