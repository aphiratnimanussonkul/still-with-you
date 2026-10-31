import { describe, expect, it } from 'vitest';
import { ErrorCode } from '@still-with-you/contracts';
import { copy, interpolate } from '@/copy';
import { ApiClientError, NetworkError } from '@/lib/api-errors';
import type { FamilyPerson, FamilyRelationship } from '@/lib/family-graph';
import { mockFamilies, mockPeople, mockRelationships } from '@/mocks/data';
import {
  addPersonHref,
  existingLinkWriteBody,
  filterPickablePeople,
  hasTwoParents,
  linkRelationshipError,
  matchesPersonSearch,
  parentCountOf,
  pickablePeople,
  relationshipUiType,
  relationshipWriteBody,
} from '@/lib/person-relationship';

function person(id: string, displayName: string, relationLabel: string | null = null): FamilyPerson {
  return {
    id,
    family_id: mockFamilies[0].id,
    display_name: displayName,
    name: displayName,
    relation_label: relationLabel,
    account_id: null,
    is_living: true,
    birth_date: null,
    birth_date_precision: 'day',
    death_date: null,
    death_date_precision: null,
    age: null,
    avatar_url: null,
    avatar_url_expires_at: null,
    avatar_placeholder: null,
    full_url: null,
    full_url_expires_at: null,
    memory_count: 0,
  };
}

function edge(
  personId: string,
  relatedId: string,
  type: 'parent' | 'spouse'
): FamilyRelationship {
  return {
    id: `${personId}-${relatedId}-${type}`,
    family_id: mockFamilies[0].id,
    person_id: personId,
    related_person_id: relatedId,
    type,
    created_by_account_id: mockPeople[2].account_id ?? mockPeople[2].id,
    created_at: '2026-10-06T00:00:00.000Z',
  };
}

describe('person relationship mapping', () => {
  it('sends child-of as a reversed parent payload', () => {
    expect(relationshipWriteBody(mockPeople[0].id, mockPeople[1].id, 'child')).toEqual({
      person_id: mockPeople[1].id,
      related_person_id: mockPeople[0].id,
      type: 'parent',
    });
    expect(relationshipWriteBody(mockPeople[0].id, mockPeople[1].id, 'parent')).toEqual({
      person_id: mockPeople[0].id,
      related_person_id: mockPeople[1].id,
      type: 'parent',
    });
    expect(relationshipWriteBody(mockPeople[0].id, mockPeople[1].id, 'spouse')).toEqual({
      person_id: mockPeople[0].id,
      related_person_id: mockPeople[1].id,
      type: 'spouse',
    });
  });

  it('reads parent vs child from who is person_id', () => {
    expect(
      relationshipUiType(
        { person_id: mockPeople[0].id, related_person_id: mockPeople[1].id, type: 'parent' },
        mockPeople[0].id
      )
    ).toBe('parent');
    expect(
      relationshipUiType(
        { person_id: mockPeople[0].id, related_person_id: mockPeople[1].id, type: 'parent' },
        mockPeople[1].id
      )
    ).toBe('child');
    expect(
      relationshipUiType(
        { person_id: mockPeople[0].id, related_person_id: mockPeople[1].id, type: 'spouse' },
        mockPeople[1].id
      )
    ).toBe('spouse');
  });

  it('sends parent/child link payloads with parent as person_id', () => {
    const subject = mockPeople[2].id;
    const selected = mockPeople[0].id;
    expect(existingLinkWriteBody(subject, selected, 'parent')).toEqual({
      person_id: selected,
      related_person_id: subject,
      type: 'parent',
    });
    expect(existingLinkWriteBody(subject, selected, 'child')).toEqual({
      person_id: subject,
      related_person_id: selected,
      type: 'parent',
    });
    expect(existingLinkWriteBody(subject, selected, 'spouse')).toEqual({
      person_id: subject,
      related_person_id: selected,
      type: 'spouse',
    });
  });
});

describe('pick existing people', () => {
  const uncle = person('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10', 'สมศักดิ์', 'ลุง');
  const cousin = person('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11', 'มะปราง', 'หลาน');

  it('excludes the person themself and anyone already related by any edge', () => {
    const people = [...mockPeople, uncle, cousin];
    const pickable = pickablePeople(people, mockRelationships, mockPeople[2].id);
    expect(pickable.map((row) => row.id).sort()).toEqual([uncle.id, cousin.id].sort());
    expect(pickablePeople(people, mockRelationships, mockPeople[0].id).map((row) => row.id).sort()).toEqual(
      [uncle.id, cousin.id].sort()
    );
  });

  it('matches search against display_name and nickname/relation_label', () => {
    expect(matchesPersonSearch(uncle, 'สมศักดิ์')).toBe(true);
    expect(matchesPersonSearch(uncle, 'ลุง')).toBe(true);
    expect(matchesPersonSearch(uncle, 'มะปราง')).toBe(false);
    expect(matchesPersonSearch(cousin, 'หลาน')).toBe(true);
    expect(
      filterPickablePeople([...mockPeople, uncle, cousin], mockRelationships, mockPeople[2].id, 'ลุง').map(
        (row) => row.id
      )
    ).toEqual([uncle.id]);
  });

  it('disables add-parent when the person already has two parents', () => {
    expect(parentCountOf(mockPeople[2].id, mockRelationships)).toBe(2);
    expect(hasTwoParents(mockPeople[2].id, mockRelationships)).toBe(true);
    expect(hasTwoParents(mockPeople[0].id, mockRelationships)).toBe(false);
    expect(hasTwoParents(mockPeople[0].id, [edge(uncle.id, mockPeople[0].id, 'parent')])).toBe(false);
    expect(
      hasTwoParents(mockPeople[0].id, [
        edge(uncle.id, mockPeople[0].id, 'parent'),
        edge(cousin.id, mockPeople[0].id, 'parent'),
      ])
    ).toBe(true);
  });

  it('builds the add-person href with kind, person, and optional name', () => {
    expect(addPersonHref('parent', mockPeople[2].id)).toBe(
      `/family/people/new?kind=parent_of&person=${mockPeople[2].id}`
    );
    expect(addPersonHref('child', mockPeople[2].id, ' น้องใหม่ ')).toBe(
      `/family/people/new?kind=child_of&person=${mockPeople[2].id}&name=${encodeURIComponent('น้องใหม่')}`
    );
    expect(addPersonHref('spouse', mockPeople[0].id)).toContain('kind=spouse_of');
  });
});

describe('link relationship error mapping', () => {
  function apiError(code: string, status: number) {
    return new ApiClientError(code, 'server message must not leak', status);
  }

  it('maps specific API errors without retry', () => {
    expect(linkRelationshipError(apiError(ErrorCode.INVALID_RELATIONSHIP, 400))).toEqual({
      kind: 'invalid',
      retry: false,
      message: copy['error.INVALID_RELATIONSHIP'],
    });
    expect(linkRelationshipError(apiError(ErrorCode.RELATIONSHIP_EXISTS, 409))).toEqual({
      kind: 'exists',
      retry: false,
      message: copy['error.RELATIONSHIP_EXISTS'],
    });
    expect(linkRelationshipError(apiError('TOO_MANY_PARENTS', 422))).toEqual({
      kind: 'too_many_parents',
      retry: false,
      message: copy['relation.link.error.too_many_parents'],
    });
    expect(linkRelationshipError(apiError(ErrorCode.INVALID_INPUT, 400), { ชื่อ: 'ยายหรรษา' })).toEqual({
      kind: 'person_gone',
      retry: false,
      message: interpolate(copy['relation.link.error.person_gone'], { ชื่อ: 'ยายหรรษา' }),
    });
    expect(linkRelationshipError(apiError(ErrorCode.FORBIDDEN, 403))).toEqual({
      kind: 'forbidden',
      retry: false,
      message: copy['person.edit.forbidden'],
    });
    expect(linkRelationshipError(apiError('ADMIN_REQUIRED', 403))).toEqual({
      kind: 'forbidden',
      retry: false,
      message: copy['person.edit.forbidden'],
    });
  });

  it('maps generic and network failures to inline copy with retry', () => {
    expect(linkRelationshipError(apiError(ErrorCode.INTERNAL_ERROR, 500))).toEqual({
      kind: 'inline',
      retry: true,
      message: copy['relation.link.error.inline'],
    });
    expect(linkRelationshipError(new NetworkError())).toEqual({
      kind: 'inline',
      retry: true,
      message: copy['relation.link.error.inline'],
    });
    expect(linkRelationshipError(new Error('boom'))).toEqual({
      kind: 'inline',
      retry: true,
      message: copy['relation.link.error.inline'],
    });
  });
});
