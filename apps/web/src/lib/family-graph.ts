/**
 * Isolated members / invites / people client (tree + invite are not in api-client).
 */
import {
  createPersonResponseSchema,
  personListResponseSchema,
  personResponseSchema,
  type CreatePerson,
  type CreatePersonResponse,
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

/** POST /v1/people/{id}/invites 201. Landing extras are optional (not in the contract object). */
export const personInviteSchema = z.object({
  id: z.string().uuid(),
  family_id: z.string().uuid(),
  person_id: z.string().uuid(),
  email: z.string(),
  status: z.enum(['pending', 'accepted', 'revoked', 'expired']),
  expires_at: z.string().datetime(),
  created_at: z.string().datetime(),
  family_name: z.string().optional(),
  inviter_display_name: z.string().optional(),
  person_display_name: z.string().optional(),
  url: z.string().url().optional(),
});

export const createPersonInviteSchema = z.object({
  email: z.string().email(),
});

export const personGenderSchema = z.enum(['female', 'male', 'other']).nullable();
export const personInviteStatusSchema = z.enum(['none', 'pending', 'linked']);

export const familyRelationshipSchema = z.object({
  id: z.string().uuid(),
  family_id: z.string().uuid(),
  person_id: z.string().uuid(),
  related_person_id: z.string().uuid(),
  type: z.enum(['parent', 'spouse']),
  created_by_account_id: z.string().uuid(),
  created_at: z.string().datetime(),
});

const personWriteFields = {
  display_name: z.string().trim().min(1).optional(),
  name: z.string().trim().min(1).optional(),
  family_name: z.string().trim().nullable().optional(),
  gender: personGenderSchema.optional(),
  birth_date: z.string().nullable().optional(),
  birth_date_precision: z.enum(['day', 'year']).optional(),
  bio: z.string().max(2000).nullable().optional(),
  avatar_media_id: z.string().uuid().nullable().optional(),
  relation_label: z.string().nullable().optional(),
};

export const createPersonSchema = z
  .object(personWriteFields)
  .superRefine((value, ctx) => {
    if (!value.display_name && !value.name) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['display_name'], message: 'required' });
    }
  });

export const updatePersonSchema = z.object(personWriteFields);

export const createRelationshipSchema = z.object({
  person_id: z.string().uuid(),
  related_person_id: z.string().uuid(),
  type: z.enum(['parent', 'spouse']),
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

export type FamilyMember = z.infer<typeof familyMemberSchema>;
export type FamilyPerson = PersonResponse;
export type FamilyRelationship = RelationshipResponse;
export type CreatePersonBody = CreatePerson;
export type UpdatePersonBody = UpdatePerson;
export type CreatePersonResult = CreatePersonResponse;
export type RelationshipKind = PersonRelationshipKind;
export type PersonInvite = z.infer<typeof personInviteSchema>;
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

  createInvite(familyId: string, body: { email: string }) {
    return request(`/v1/families/${familyId}/invites`, familyInviteSchema, {
      method: 'POST',
      body: { email: body.email },
    });
  },

  createPersonInvite(personId: string, body: { email: string }) {
    return request(`/v1/people/${personId}/invites`, personInviteSchema, {
      method: 'POST',
      body: createPersonInviteSchema.parse(body),
    });
  },

  getPersonInvite(inviteId: string) {
    return request(`/v1/people-invites/${inviteId}`, personInviteSchema);
  },

  acceptPersonInvite(inviteId: string) {
    return request(`/v1/invites/${inviteId}/accept`, personInviteSchema, {
      method: 'POST',
      body: {},
    });
  },

  getPerson(personId: string) {
    return request(`/v1/people/${personId}`, familyPersonSchema);
  },

  listPersonEvents(personId: string) {
    return request(`/v1/people/${personId}/events`, eventListResponseSchema);
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
      body: createPersonSchema.parse(body),
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
