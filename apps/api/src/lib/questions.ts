import { and, asc, eq, gte, inArray, isNull } from 'drizzle-orm';
import { QUESTION_SKIP_DAYS } from '@still-with-you/contracts';
import { db, personFacts, questionBank, questionSkips } from './db/index.js';
import { listFocusItems } from './focus.js';

export function substituteQuestionName(template: string, displayName: string): string {
  return template.replaceAll('{name}', displayName).replaceAll('{ชื่อ}', displayName);
}

export async function pickQuickQuestion(familyId: string, accountId: string) {
  const focus = await listFocusItems(familyId, accountId);
  if (focus.length === 0) {
    return null;
  }

  const questions = await db
    .select()
    .from(questionBank)
    .where(eq(questionBank.active, true))
    .orderBy(asc(questionBank.sort), asc(questionBank.key));

  if (questions.length === 0) {
    return null;
  }

  const personIds = focus.map((item) => item.person.id);

  const answered = await db
    .select({
      personId: personFacts.personId,
      questionId: personFacts.questionId,
    })
    .from(personFacts)
    .where(
      and(
        eq(personFacts.authorAccountId, accountId),
        inArray(personFacts.personId, personIds),
        isNull(personFacts.deletedAt)
      )
    );

  const answeredSet = new Set(answered.map((row) => `${row.personId}:${row.questionId}`));

  const skipCutoff = new Date(Date.now() - QUESTION_SKIP_DAYS * 24 * 60 * 60 * 1000);
  const skips = await db
    .select({
      personId: questionSkips.personId,
      questionId: questionSkips.questionId,
    })
    .from(questionSkips)
    .where(
      and(
        eq(questionSkips.accountId, accountId),
        inArray(questionSkips.personId, personIds),
        gte(questionSkips.skippedAt, skipCutoff)
      )
    );

  const skipSet = new Set(skips.map((row) => `${row.personId}:${row.questionId}`));

  for (const item of focus) {
    for (const question of questions) {
      const key = `${item.person.id}:${question.id}`;
      if (!answeredSet.has(key) && !skipSet.has(key)) {
        return {
          question_id: question.id,
          key: question.key,
          person: item.person,
          text: substituteQuestionName(question.textTh, item.person.display_name),
        };
      }
    }
  }

  return null;
}
