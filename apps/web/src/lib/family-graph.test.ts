import { describe, expect, it } from 'vitest';
import { personListResponseSchema, personResponseSchema } from '@still-with-you/contracts';
import { mockPeople, mockPersonOther } from '@/mocks/data';
import {
  createPersonSchema,
  createRelationshipSchema,
  familyInviteSchema,
  familyInvitesSchema,
  familyMembersSchema,
  familyPeopleSchema,
  familyPersonSchema,
  personDisplayName,
  personInviteSchema,
  updatePersonSchema,
} from '@/lib/family-graph';

const personId = '77777777-7777-4777-8777-777777777777';
const familyId = '22222222-2222-4222-8222-222222222222';
const accountId = '11111111-1111-4111-8111-111111111111';
const relatedId = '87878787-8787-4878-8878-878787878787';
const iso = '2026-10-22T00:00:00.000Z';

/** Mirrors apps/api/src/lib/people.ts toPersonResponse + GET /families/:fid/people. */
const apiPerson = {
  id: personId,
  family_id: familyId,
  display_name: 'ยายสมศรี',
  name: 'ยายสมศรี',
  family_name: null,
  relation_label: 'ยาย',
  gender: null,
  birth_date: null,
  birth_date_precision: 'day' as const,
  age: null,
  bio: null,
  avatar_media_id: null,
  avatar_url: null,
  account_id: null,
  invite_status: 'none' as const,
  created_by_account_id: accountId,
  created_at: iso,
  updated_at: iso,
  deleted_at: null,
};

const apiPeopleList = {
  people: [apiPerson],
  relationships: [
    {
      id: '99999999-9999-4999-8999-999999999999',
      family_id: familyId,
      person_id: personId,
      related_person_id: relatedId,
      type: 'spouse' as const,
      created_by_account_id: accountId,
      created_at: iso,
    },
  ],
};

describe('family-graph vs live API handlers', () => {
  it('parses GET /people including relationships from the serializer', () => {
    expect(familyPeopleSchema.parse(apiPeopleList).people[0]?.display_name).toBe('ยายสมศรี');
    expect(personListResponseSchema.parse(apiPeopleList).relationships).toHaveLength(1);
    expect(familyPersonSchema.parse(apiPerson).name).toBe('ยายสมศรี');
    expect(personResponseSchema.parse(apiPerson).invite_status).toBe('none');
  });

  it('parses GET /members as the handler row (no left_at)', () => {
    const members = familyMembersSchema.parse({
      members: [
        {
          account_id: accountId,
          family_id: familyId,
          role: 'admin',
          display_name: 'Atta',
          joined_at: iso,
        },
      ],
    });
    expect(members.members[0]?.role).toBe('admin');
  });

  it('parses GET /invites without status and POST /invites without created_at', () => {
    const listed = familyInvitesSchema.parse({
      invites: [
        {
          id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
          email: 'kret@example.com',
          role: 'member',
          invited_by: accountId,
          expires_at: iso,
          created_at: iso,
        },
      ],
    });
    expect(listed.invites[0]?.status).toBeUndefined();

    const created = familyInviteSchema.parse({
      id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      email: 'kret@example.com',
      url: 'https://app.example.com/invite/token',
      expires_at: iso,
    });
    expect(created.url).toContain('/invite/');
    expect(created.status).toBeUndefined();
    expect(created.created_at).toBeUndefined();
  });
});

describe('family people contract v0.8', () => {
  it('requires display_name and defaults relationships to []', () => {
    expect(createPersonSchema.safeParse({}).success).toBe(false);
    expect(createPersonSchema.parse({ name: 'ยายสมศรี' }).name).toBe('ยายสมศรี');
    expect(createPersonSchema.parse({ display_name: ' ยายสมศรี ' }).display_name).toBe('ยายสมศรี');
    expect(createPersonSchema.parse({ display_name: 'ยายสมศรี', gender: null }).gender).toBeNull();
    expect(createPersonSchema.parse({ display_name: 'ยายสมศรี', gender: 'other' }).gender).toBe('other');
    expect(familyPeopleSchema.parse({ people: [mockPersonOther], relationships: [] }).people[0]?.gender).toBe(
      'other'
    );
    expect(createPersonSchema.safeParse({ display_name: 'ยาย', bio: 'x'.repeat(2001) }).success).toBe(
      false
    );
    expect(familyPeopleSchema.parse({ people: mockPeople, relationships: [] }).relationships).toEqual([]);
  });

  it('parses parent and spouse relationships', () => {
    expect(
      createRelationshipSchema.parse({
        person_id: mockPeople[0].id,
        related_person_id: mockPeople[1].id,
        type: 'parent',
      }).type
    ).toBe('parent');
    expect(
      createRelationshipSchema.safeParse({
        person_id: mockPeople[0].id,
        related_person_id: mockPeople[1].id,
        type: 'child',
      }).success
    ).toBe(false);
  });

  it('allows a partial PATCH and uses display_name for the person label', () => {
    expect(updatePersonSchema.parse({ family_name: 'นิมานุสสรณ์กุล' }).family_name).toBe(
      'นิมานุสสรณ์กุล'
    );
    expect(personDisplayName(mockPeople[0])).toBe('ยายสมศรี');
    expect(personDisplayName({ display_name: '', name: 'ปู่สมชาย' })).toBe('ปู่สมชาย');
  });

  it('accepts birth_date_precision and person invite payloads', () => {
    expect(
      createPersonSchema.parse({
        display_name: 'ยาย',
        birth_date: '1948',
        birth_date_precision: 'year',
        gender: 'female',
        avatar_media_id: null,
      })
    ).toMatchObject({ birth_date: '1948', birth_date_precision: 'year', gender: 'female' });
    expect(
      personInviteSchema.parse({
        id: mockPeople[0].id,
        person_id: mockPeople[0].id,
        family_id: mockPeople[0].family_id,
        email: 'user@example.com',
        status: 'pending',
        expires_at: '2026-10-29T00:00:00.000Z',
        created_at: '2026-10-22T00:00:00.000Z',
      }).email
    ).toBe('user@example.com');
  });
});
