/**
 * Isolated members / invites / people client (tree + invite are not in api-client).
 */
import {
  eventListResponseSchema,
  personListResponseSchema,
  personResponseSchema,
  type PersonResponse,
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
  person_id: z.string().uuid().nullable().optional(),
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

export const personInviteSchema = z.object({
  id: z.string().uuid(),
  person_id: z.string().uuid(),
  family_id: z.string().uuid(),
  family_name: z.string(),
  inviter_display_name: z.string(),
  person_display_name: z.string(),
  url: z.string().url(),
  status: z.enum(['pending', 'accepted', 'revoked', 'expired']),
  expires_at: z.string().datetime(),
  created_at: z.string().datetime(),
});

export const personGenderSchema = z.enum(['female', 'male']).nullable();
export const personInviteStatusSchema = z.enum(['none', 'pending', 'linked']);

export const familyRelationshipSchema = z.object({
  id: z.string().uuid(),
  person_id: z.string().uuid(),
  related_person_id: z.string().uuid(),
  type: z.enum(['parent', 'spouse']),
});

export const createPersonSchema = z.object({
  display_name: z.string().trim().min(1),
  family_name: z.string().trim().optional(),
  gender: z.enum(['female', 'male']).nullable().optional(),
  birth_date: z.string().optional(),
  birth_date_precision: z.enum(['year', 'day']).optional(),
  bio: z.string().max(2000).optional(),
  avatar_media_id: z.string().uuid().optional(),
  relation_label: z.string().optional(),
});

export const updatePersonSchema = createPersonSchema.partial();

export const createRelationshipSchema = z.object({
  person_id: z.string().uuid(),
  related_person_id: z.string().uuid(),
  type: z.enum(['parent', 'spouse']),
});

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
export type FamilyRelationship = z.infer<typeof familyRelationshipSchema>;
export type CreatePerson = z.infer<typeof createPersonSchema>;
export type UpdatePerson = z.infer<typeof updatePersonSchema>;
export type CreateRelationship = z.infer<typeof createRelationshipSchema>;
export type PersonInvite = z.infer<typeof personInviteSchema>;
export type ContributionItem = z.infer<typeof contributionItemSchema>;
export type TrashItem = z.infer<typeof trashItemSchema>;

export function personDisplayName(person: Pick<FamilyPerson, 'display_name'> & { name?: string }): string {
  return person.display_name || person.name || '';
}

export const familyGraph = {
  listMembers(familyId: string) {
    return request(`/v1/families/${familyId}/members`, familyMembersSchema);
  },

  listInvites(familyId: string) {
    return request(`/v1/families/${familyId}/invites`, familyInvitesSchema);
  },

  createInvite(familyId: string, body: { email?: string; person_id?: string }) {
    return request(`/v1/families/${familyId}/invites`, familyInviteSchema, {
      method: 'POST',
      body,
    });
  },

  createPersonInvite(personId: string) {
    return request(`/v1/people/${personId}/invites`, personInviteSchema, {
      method: 'POST',
      body: {},
    });
  },

  getPersonInvite(inviteId: string) {
    return request(`/v1/people-invites/${inviteId}`, personInviteSchema);
  },

  acceptPersonInvite(inviteId: string) {
    return request(`/v1/people-invites/${inviteId}/accept`, personInviteSchema, {
      method: 'POST',
      body: {},
    });
  },

  listPersonEvents(personId: string) {
    return request(`/v1/people/${personId}/events`, eventListResponseSchema);
  },

  listPeople(familyId: string) {
    return request(`/v1/families/${familyId}/people`, familyPeopleSchema);
  },

  createPerson(familyId: string, body: CreatePerson) {
    return request(`/v1/families/${familyId}/people`, familyPersonSchema, {
      method: 'POST',
      body: createPersonSchema.parse(body),
    });
  },

  updatePerson(personId: string, body: UpdatePerson) {
    return request(`/v1/people/${personId}`, familyPersonSchema, {
      method: 'PATCH',
      body: updatePersonSchema.parse(body),
    });
  },

  deletePerson(personId: string) {
    return request(`/v1/people/${personId}`, z.void(), { method: 'DELETE' });
  },

  createRelationship(familyId: string, body: z.input<typeof createRelationshipSchema>) {
    return request(`/v1/families/${familyId}/relationships`, familyRelationshipSchema, {
      method: 'POST',
      body: createRelationshipSchema.parse(body),
    });
  },

  deleteRelationship(relationshipId: string) {
    return request(`/v1/relationships/${relationshipId}`, z.void(), { method: 'DELETE' });
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
