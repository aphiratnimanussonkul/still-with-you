import { describe, expect, it } from 'vitest';
import { mockPeople } from '@/mocks/data';
import { relationshipUiType, relationshipWriteBody } from '@/lib/person-relationship';

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
});
