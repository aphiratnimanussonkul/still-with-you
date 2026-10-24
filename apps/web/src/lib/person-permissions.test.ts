import { describe, expect, it } from 'vitest';
import { mockAccount, mockMembers, mockPeople } from '@/mocks/data';
import { canEditPerson, isFamilySteward } from '@/lib/person-permissions';

describe('person permissions', () => {
  it('allows the creator, linked self, and family steward', () => {
    expect(isFamilySteward(mockMembers, mockAccount.id)).toBe(true);
    expect(canEditPerson(mockPeople[0], mockAccount.id, mockMembers)).toBe(true);
    expect(
      canEditPerson(
        { ...mockPeople[0], created_by_account_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', account_id: null },
        'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        []
      )
    ).toBe(false);
    expect(
      canEditPerson(
        { ...mockPeople[0], created_by_account_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', account_id: mockAccount.id },
        mockAccount.id,
        []
      )
    ).toBe(true);
  });
});
