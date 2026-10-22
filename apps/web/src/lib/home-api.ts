/**
 * Isolated Home / focus / facts client. Backend draft is still pending review.
 * Keep these shapes here (and in MSW) — do not fold them into api-client yet.
 */
import { eventResponseSchema, type EventResponse } from '@still-with-you/contracts';
import { z } from 'zod';
import { request } from '@/lib/api-client';

export const FOCUS_MAX = 10;

const personCardSchema = z.object({
  person: z.object({
    id: z.string().uuid(),
    name: z.string(),
  }),
  photo_url: z.string().url().nullable(),
  memory_count: z.number().int(),
});

const quickQuestionSchema = z.object({
  question_id: z.string(),
  person_id: z.string().uuid(),
  text: z.string(),
});

export const familyHomeSchema = z.object({
  focus: z.array(personCardSchema),
  quick_question: quickQuestionSchema.nullable(),
  recent_memories: z.array(eventResponseSchema).max(5),
});

export const familyFocusSchema = z.object({
  person_ids: z.array(z.string().uuid()).max(FOCUS_MAX),
});

export const createFactSchema = z.object({
  question_id: z.string().min(1),
  answer_text: z.string().trim().min(1),
});

export const skipFactSchema = z.object({
  question_id: z.string().min(1),
});

export const personFactSchema = createFactSchema.extend({
  question_text: z.string().optional(),
});

export const updateFactSchema = z.object({
  answer_text: z.string().trim().min(1),
});

const factAuthorSchema = z.object({
  account_id: z.string(),
  display_name: z.string(),
});

const factAnswerSchema = z.object({
  id: z.string(),
  answer_text: z.string(),
  author: factAuthorSchema.optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export const personFactsSchema = z.object({
  groups: z
    .array(
      z.object({
        question: z.object({
          id: z.string(),
          key: z.string().optional(),
          text: z.string(),
        }),
        answers: z.array(factAnswerSchema),
      })
    )
    .default([]),
});

export type FamilyHome = z.infer<typeof familyHomeSchema>;
export type FamilyFocus = z.infer<typeof familyFocusSchema>;
export type PersonFacts = z.infer<typeof personFactsSchema>;
export type HomeMemory = EventResponse;

export const homeApi = {
  getHome(familyId: string): Promise<FamilyHome> {
    return request(`/v1/families/${familyId}/home`, familyHomeSchema);
  },

  getFocus(familyId: string): Promise<FamilyFocus> {
    return request(`/v1/families/${familyId}/focus`, familyFocusSchema);
  },

  putFocus(familyId: string, personIds: string[]): Promise<FamilyFocus> {
    return request(`/v1/families/${familyId}/focus`, familyFocusSchema, {
      method: 'PUT',
      body: familyFocusSchema.parse({ person_ids: personIds }),
    });
  },

  answerFact(personId: string, body: { question_id: string; answer_text: string }) {
    return request(`/v1/people/${personId}/facts`, personFactSchema, {
      method: 'POST',
      body: createFactSchema.parse(body),
    });
  },

  skipFact(personId: string, questionId: string) {
    return request(`/v1/people/${personId}/facts/skip`, z.object({ skipped: z.boolean() }).passthrough(), {
      method: 'POST',
      body: skipFactSchema.parse({ question_id: questionId }),
    });
  },

  listFacts(personId: string): Promise<PersonFacts> {
    return request(`/v1/people/${personId}/facts`, personFactsSchema);
  },

  updateFact(factId: string, answerText: string) {
    return request(`/v1/facts/${factId}`, personFactSchema.passthrough(), {
      method: 'PATCH',
      body: updateFactSchema.parse({ answer_text: answerText }),
    });
  },
};
