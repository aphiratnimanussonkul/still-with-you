/**
 * Isolated members / invites / people client (tree + invite are not in api-client).
 */
import {
  createPersonResponseSchema,
  createRelationshipSchema,
  personListResponseSchema,
  personResponseSchema,
  relationshipResponseSchema,
  type CreatePerson,
  type CreatePersonResponse,
  type CreateRelationship,
  type PersonRelationshipKind,
  type PersonResponse,
  type RelationshipResponse,
  type UpdatePerson,
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
export const createPersonResultSchema = createPersonResponseSchema;
/** Person-invite preview is web-only; Frank's contracts PR does not ship this schema. */
export const personInviteSchema = z.object({
  id: z.string().uuid(),
  family_id: z.string().uuid().optional(),
  person_id: z.string().uuid().optional(),
  email: z.string(),
  status: z.enum(['pending', 'accepted', 'revoked', 'expired']).optional(),
  url: z.string().url().optional(),
  expires_at: z.string().datetime(),
  created_at: z.string().datetime().optional(),
});

export const contributionItemSchema = z.object({
  id: z.string().uuid(),
  event_id: z.string().uuid(),
  owner_account_id: z.string().uuid(),
  author_id: z.string().uuid(),
  is_mine: z.boolean(),
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

export const personInvitePreviewSchema = z.object({
  family_name: z.string(),
  inviter_display_name: z.string(),
  person_display_name: z.string().nullable(),
  expires_at: z.string().datetime(),
});

export const acceptPersonInviteResponseSchema = z.object({
  family_id: z.string().uuid(),
  person_id: z.string().uuid(),
});

export type FamilyMember = z.infer<typeof familyMemberSchema>;
export type FamilyPerson = PersonResponse;
export type FamilyRelationship = RelationshipResponse;
export type CreatePersonBody = CreatePerson;
export type UpdatePersonBody = UpdatePerson;
export type CreatePersonResult = CreatePersonResponse;
export type { CreatePerson, UpdatePerson };
export type RelationshipKind = PersonRelationshipKind;
export type PersonInvite = z.infer<typeof personInviteSchema>;
export type PersonInvitePreview = z.infer<typeof personInvitePreviewSchema>;
export type AcceptPersonInviteResponse = z.infer<typeof acceptPersonInviteResponseSchema>;
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

  updatePerson(personId: string, body: UpdatePersonBody) {
    return request(`/v1/people/${personId}`, familyPersonSchema, {
      method: 'PATCH',
      body,
    });
  },

  createPersonInvite(personId: string, email: string) {
    return request(`/v1/people/${personId}/invites`, personInviteSchema, {
      method: 'POST',
      body: { email },
    });
  },

  getPersonInvite(token: string) {
    return request(`/v1/invites/${token}`, personInvitePreviewSchema);
  },

  acceptPersonInvite(token: string) {
    return request(`/v1/invites/${token}/accept`, acceptPersonInviteResponseSchema, {
      method: 'POST',
      body: {},
    });
  },

  createRelationship(familyId: string, body: CreateRelationship) {
    return request(`/v1/families/${familyId}/relationships`, relationshipResponseSchema, {
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
