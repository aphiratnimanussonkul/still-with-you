import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  createPersonResponseSchema,
  createPersonSchema,
  personListResponseSchema,
  personResponseSchema,
} from '@still-with-you/contracts';
import { mockContributions } from '@/mocks/data';
import {
  contributionItemSchema,
  contributionListSchema,
  createPersonResultSchema,
  familyInviteSchema,
  familyInvitesSchema,
  familyMembersSchema,
  familyPeopleSchema,
  familyPersonSchema,
  personNodeLabel,
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
  is_living: true,
  birth_date: null,
  birth_date_precision: 'day' as const,
  death_date: null,
  death_date_precision: null,
  age: null,
  bio: null,
  avatar_media_id: null,
  avatar_url: null,
  avatar_url_expires_at: null,
  avatar_placeholder: null,
  full_url: null,
  full_url_expires_at: null,
  memory_count: 0,
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
    expect(personResponseSchema.parse(apiPerson).memory_count).toBe(0);
    expect(personResponseSchema.parse(apiPerson).invite_status).toBe('none');
    expect(personResponseSchema.safeParse({ ...apiPerson, name: undefined }).success).toBe(false);
    expect(personResponseSchema.safeParse({ ...apiPerson, memory_count: undefined }).success).toBe(false);
    expect(
      personResponseSchema.parse({
        ...apiPerson,
        is_living: false,
        death_date: '2022-01-01',
        death_date_precision: 'year',
      }).is_living
    ).toBe(false);
    expect(
      personResponseSchema.parse({
        ...apiPerson,
        death_date: null,
        death_date_precision: null,
      }).death_date_precision
    ).toBeNull();
  });

  it('POST /v1/families/{id}/people is steward-only 403 FORBIDDEN', () => {
    const source = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), '../mocks/handlers.ts'),
      'utf8'
    );
    const start = source.indexOf('http.post(`${api}/v1/families/:fid/people`');
    const end = source.indexOf('http.get(`${api}/v1/people/:id`');
    const postPeople = source.slice(start, end);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(postPeople).toContain("caller?.role !== 'admin'");
    expect(postPeople).toContain("code: 'FORBIDDEN'");
    expect(postPeople).toContain('status: 403');
  });

  it('parses POST /people as 201 {person, relationship|null}', () => {
    const wrapped = createPersonResponseSchema.parse({
      person: apiPerson,
      relationship: apiPeopleList.relationships[0],
    });
    expect(wrapped.person.display_name).toBe('ยายสมศรี');
    expect(wrapped.relationship?.type).toBe('spouse');
    expect(createPersonResultSchema.parse({ person: apiPerson, relationship: null }).relationship).toBeNull();
    expect(createPersonResponseSchema.safeParse(apiPerson).success).toBe(false);
    expect(createPersonResponseSchema.safeParse({ person: apiPerson }).success).toBe(false);
  });

  it('accepts relation_label on createPerson and null death_date_precision', () => {
    expect(
      createPersonSchema.parse({
        display_name: 'น้องใหม่',
        relation_label: 'น้อง',
        is_living: true,
        death_date: null,
        death_date_precision: null,
      })
    ).toMatchObject({
      relation_label: 'น้อง',
      death_date_precision: null,
    });
    expect(
      createPersonSchema.parse({
        display_name: 'ทวด',
        is_living: false,
        death_date: '2022-03-15',
        death_date_precision: 'day',
      }).death_date_precision
    ).toBe('day');
  });

  it('labels a tree node with relation_label when present', () => {
    expect(personNodeLabel(apiPerson)).toBe('ยาย');
    expect(personNodeLabel({ ...apiPerson, relation_label: null })).toBe('ยายสมศรี');
    expect(personNodeLabel({ ...apiPerson, relation_label: '  ' })).toBe('ยายสมศรี');
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

describe('contribution media contract', () => {
  it('keeps listing when media is absent', () => {
    const parsed = contributionListSchema.parse({
      contributions: [
        {
          id: mockContributions[0].id,
          event_id: mockContributions[0].event_id,
          owner_account_id: mockContributions[0].owner_account_id,
          author_id: mockContributions[0].author_id,
          is_mine: mockContributions[0].is_mine,
          owner_display_name: mockContributions[0].owner_display_name,
          story: mockContributions[0].story,
          created_at: mockContributions[0].created_at,
        },
      ],
    });
    expect(parsed.contributions[0]?.media).toBeUndefined();
  });

  it('reads signed media urls when present', () => {
    const parsed = contributionItemSchema.parse({
      ...mockContributions[0],
      media: [
        {
          id: '55555555-5555-4555-8555-555555555555',
          url: 'https://cdn.example.com/sea.jpg',
          thumb_url: null,
          status: 'ready',
          expires_at: '2026-10-22T12:05:00.000Z',
        },
      ],
    });
    expect(parsed.media?.[0]?.url).toBe('https://cdn.example.com/sea.jpg');
  });
});
