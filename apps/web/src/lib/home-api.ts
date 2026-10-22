/**
 * Isolated Home / focus / facts client. Backend draft is still pending review.
 * Keep these shapes here (and in MSW) — do not fold them into api-client yet.
 */
import {
  FOCUS_MAX_PER_FAMILY,
  focusListResponseSchema,
  homeResponseSchema,
  personFactsResponseSchema,
  type EventResponse,
  type FocusListResponse,
  type HomeResponse,
  type PersonFactsResponse,
} from '@still-with-you/contracts';
import { z } from 'zod';
import { request } from '@/lib/api-client';

export const FOCUS_MAX = FOCUS_MAX_PER_FAMILY;

/** PUT /v1/families/{id}/focus request body. Response is `focusListResponseSchema`. */
export const familyFocusRequestSchema = z.object({
  person_ids: z.array(z.string().uuid()).max(FOCUS_MAX),
});

export const familyFocusResponseSchema = focusListResponseSchema;

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

export const familyHomeSchema = homeResponseSchema;
export const personFactsSchema = personFactsResponseSchema;

export type FamilyHome = HomeResponse;
export type FamilyFocus = FocusListResponse;
export type PersonFacts = PersonFactsResponse;
export type HomeMemory = EventResponse;

export const homeApi = {
  getHome(familyId: string): Promise<FamilyHome> {
    return request(`/v1/families/${familyId}/home`, familyHomeSchema);
  },

  getFocus(familyId: string): Promise<FamilyFocus> {
    return request(`/v1/families/${familyId}/focus`, familyFocusResponseSchema);
  },

  putFocus(familyId: string, personIds: string[]): Promise<FamilyFocus> {
    return request(`/v1/families/${familyId}/focus`, familyFocusResponseSchema, {
      method: 'PUT',
      body: familyFocusRequestSchema.parse({ person_ids: personIds }),
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
