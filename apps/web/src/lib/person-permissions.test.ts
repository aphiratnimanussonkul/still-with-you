import { describe, expect, it } from 'vitest';
import { mockAccount, mockFamilies, mockMembers, mockPeople } from '@/mocks/data';
import { familyMembersSchema } from '@/lib/family-graph';
import { canEditPerson, canInvitePerson, isFamilySteward } from '@/lib/person-permissions';

describe('person permissions', () => {
  it('allows only the family steward to PATCH or DELETE a person', () => {
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
        { ...mockPeople[0], created_by_account_id: mockAccount.id, account_id: null },
        mockAccount.id,
        [{ ...mockMembers[0], role: 'member' }]
      )
    ).toBe(false);
    expect(
      canEditPerson(
        { ...mockPeople[0], created_by_account_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', account_id: mockAccount.id },
        mockAccount.id,
        []
      )
    ).toBe(false);
  });

  it('reads an active admin role from a contract-shaped membership payload', () => {
    const parsed = familyMembersSchema.parse({
      members: [
        {
          account_id: mockAccount.id,
          family_id: mockFamilies[0].id,
          role: 'admin',
          joined_at: '2026-10-02T00:00:00+00:00',
          left_at: null,
          status: 'active',
        },
      ],
    });
    expect(isFamilySteward(parsed.members, mockAccount.id)).toBe(true);
    expect(
      isFamilySteward(
        [{ ...mockMembers[0], role: 'admin', left_at: '2026-10-20T00:00:00.000Z' }],
        mockAccount.id
      )
    ).toBe(false);
    expect(
      isFamilySteward([{ ...mockMembers[0], role: 'admin', status: 'left' }], mockAccount.id)
    ).toBe(false);
  });

  it('hides add-person for members who are not family stewards', () => {
    expect(isFamilySteward(mockMembers, mockAccount.id)).toBe(true);
    expect(
      isFamilySteward(
        mockMembers.map((member) => ({ ...member, role: 'member' as const })),
        mockAccount.id
      )
    ).toBe(false);
    expect(isFamilySteward(undefined, mockAccount.id)).toBe(false);
  });

  it('hides the invite button unless the viewer is a steward of a living uninvited person', () => {
    const living = { ...mockPeople[1], invite_status: 'none' as const, account_id: null };
    expect(canInvitePerson(living, true)).toBe(true);
    expect(canInvitePerson(living, false)).toBe(false);
    expect(canInvitePerson({ ...living, is_living: false }, true)).toBe(false);
    expect(canInvitePerson({ ...living, invite_status: 'pending' }, true)).toBe(false);
    expect(canInvitePerson({ ...living, invite_status: 'linked' }, true)).toBe(false);
    expect(canInvitePerson({ ...living, account_id: mockAccount.id }, true)).toBe(false);
  });
});
