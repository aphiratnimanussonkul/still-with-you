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
  recent_memories: z.array(eventResponseSchema),
});

export const familyFocusSchema = z.object({
  person_ids: z.array(z.string().uuid()).max(FOCUS_MAX),
});

export const personFactSchema = z.object({
  question_id: z.string(),
  question_text: z.string().optional(),
  answer_text: z.string(),
});

export const personFactsSchema = z.object({
  facts: z.array(personFactSchema),
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
      body: body,
    });
  },

  skipFact(personId: string, questionId: string) {
    return request(`/v1/people/${personId}/facts/skip`, z.object({ skipped: z.boolean() }).passthrough(), {
      method: 'POST',
      body: { question_id: questionId },
    });
  },

  listFacts(personId: string): Promise<PersonFacts> {
    return request(`/v1/people/${personId}/facts`, personFactsSchema);
  },
};
