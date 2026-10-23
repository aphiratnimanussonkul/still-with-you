/**
 * Isolated members / invites / people client (tree + invite are not in api-client).
 */
import {
  createPersonResponseSchema,
  personInviteResponseSchema,
  personListResponseSchema,
  personResponseSchema,
  type CreatePerson,
  type CreatePersonResponse,
  type CreateRelationshipKind,
  type PersonInviteResponse,
  type PersonResponse,
  type RelationshipResponse,
} from '@still-with-you/contracts';
import { z } from 'zod';
import { request } from '@/lib/api-client';

export const familyMemberSchema = z.object({
  account_id: z.string().uuid(),
  family_id: z.string().uuid(),
  role: z.enum(['member', 'admin']),
  display_name: z.string(),
  joined_at: z.string().datetime(),
});

export const familyMembersSchema = z.object({
  members: z.array(familyMemberSchema),
});

/**
 * GET /v1/families/{id}/invites returns pending rows without `status`.
 * POST returns `{ id, email, url, expires_at }` — no status or created_at.
 */
export const familyInviteSchema = z.object({
  id: z.string().uuid(),
  email: z.string(),
  role: z.enum(['member', 'admin']).optional(),
  invited_by: z.string().uuid().optional(),
  url: z.string().url().optional(),
  status: z.enum(['pending', 'accepted', 'revoked', 'expired']).optional(),
  expires_at: z.string().datetime(),
  created_at: z.string().datetime().optional(),
});

export const familyInvitesSchema = z.object({
  invites: z.array(familyInviteSchema),
});

export const familyPersonSchema = personResponseSchema;
export const familyPeopleSchema = personListResponseSchema;
export const createPersonResultSchema = z.union([
  createPersonResponseSchema,
  personResponseSchema.transform((person) => ({ person, relationship: null })),
]);
export const personInviteSchema = personInviteResponseSchema;

export const contributionItemSchema = z.object({
  id: z.string().uuid(),
  event_id: z.string().uuid(),
  owner_account_id: z.string().uuid(),
  owner_display_name: z.string().optional(),
  story: z.string().nullable(),
  created_at: z.string().datetime(),
});

export const contributionListSchema = z.object({
  contributions: z.array(contributionItemSchema),
});

export const trashItemSchema = z.object({
  id: z.string().uuid(),
  story: z.string().nullable(),
  origin_event_title: z.string().nullable(),
  family_name: z.string(),
  family_id: z.string().uuid(),
  trashed_at: z.string().datetime(),
});

export const trashListSchema = z.object({
  items: z.array(trashItemSchema),
});

export type FamilyMember = z.infer<typeof familyMemberSchema>;
export type FamilyPerson = PersonResponse;
export type FamilyRelationship = RelationshipResponse;
export type CreatePersonBody = CreatePerson;
export type CreatePersonResult = CreatePersonResponse;
export type RelationshipKind = CreateRelationshipKind;
export type PersonInvite = PersonInviteResponse;
export type ContributionItem = z.infer<typeof contributionItemSchema>;
export type TrashItem = z.infer<typeof trashItemSchema>;

export function personDisplayName(person: Pick<FamilyPerson, 'name' | 'display_name'>): string {
  return person.display_name || person.name;
}

export function personNodeLabel(
  person: Pick<FamilyPerson, 'name' | 'display_name' | 'relation_label'>
): string {
  const nickname = person.relation_label?.trim();
  return nickname || personDisplayName(person);
}

export function isPersonLiving(person: Pick<FamilyPerson, 'is_living'>): boolean {
  return person.is_living !== false;
}

export const familyGraph = {
  listMembers(familyId: string) {
    return request(`/v1/families/${familyId}/members`, familyMembersSchema);
  },

  listInvites(familyId: string) {
    return request(`/v1/families/${familyId}/invites`, familyInvitesSchema);
  },

  createInvite(familyId: string, email: string) {
    return request(`/v1/families/${familyId}/invites`, familyInviteSchema, {
      method: 'POST',
      body: { email },
    });
  },

  listPeople(familyId: string) {
    return request(`/v1/families/${familyId}/people`, familyPeopleSchema);
  },

  getPerson(personId: string) {
    return request(`/v1/people/${personId}`, familyPersonSchema);
  },

  createPerson(familyId: string, body: CreatePersonBody) {
    return request(`/v1/families/${familyId}/people`, createPersonResultSchema, {
      method: 'POST',
      body,
    });
  },

  createPersonInvite(personId: string, email: string) {
    return request(`/v1/people/${personId}/invites`, personInviteSchema, {
      method: 'POST',
      body: { email },
    });
  },

  listContributions(eventId: string) {
    return request(`/v1/events/${eventId}/contributions`, contributionListSchema);
  },

  createContribution(eventId: string, story: string) {
    return request(`/v1/events/${eventId}/contributions`, contributionItemSchema, {
      method: 'POST',
      body: { story },
    });
  },

  listTrash() {
    return request('/v1/me/trash', trashListSchema);
  },
};
