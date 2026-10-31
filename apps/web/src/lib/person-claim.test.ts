import { describe, expect, it } from 'vitest';
import { ErrorCode } from '@still-with-you/contracts';
import { copy, interpolate } from '@/copy';
import { ApiClientError } from '@/lib/api-errors';
import { canClaimPerson, claimSelfErrorView } from '@/lib/person-claim';
import { mockAccount, mockPeople } from '@/mocks/data';

const livingUnlinked = { ...mockPeople[1], account_id: null, is_living: true };
const unlinkedPeople = mockPeople.map((person) => ({ ...person, account_id: null }));

describe('canClaimPerson', () => {
  it('allows an admin to claim a living unlinked person when they have no linked box', () => {
    expect(
      canClaimPerson(livingUnlinked, {
        isAdmin: true,
        accountId: mockAccount.id,
        people: unlinkedPeople,
      })
    ).toBe(true);
  });

  it('hides claim when the viewer is not an admin, the person is deceased, or already linked', () => {
    expect(
      canClaimPerson(livingUnlinked, {
        isAdmin: false,
        accountId: mockAccount.id,
        people: unlinkedPeople,
      })
    ).toBe(false);
    expect(
      canClaimPerson(
        { ...livingUnlinked, is_living: false },
        { isAdmin: true, accountId: mockAccount.id, people: unlinkedPeople }
      )
    ).toBe(false);
    expect(
      canClaimPerson(
        { ...livingUnlinked, account_id: mockAccount.id },
        { isAdmin: true, accountId: mockAccount.id, people: unlinkedPeople }
      )
    ).toBe(false);
  });

  it('hides claim when the admin already has a linked person in the family', () => {
    expect(
      canClaimPerson(livingUnlinked, {
        isAdmin: true,
        accountId: mockAccount.id,
        people: mockPeople,
      })
    ).toBe(false);
  });
});

describe('claimSelfErrorView', () => {
  it('maps coded claim errors without retry', () => {
    expect(claimSelfErrorView(new ApiClientError(ErrorCode.PERSON_ALREADY_CLAIMED, 'x', 409), 'สมชาย')).toEqual({
      message: interpolate(copy['person.claim_self.taken'], { ชื่อ: 'สมชาย' }),
      coded: true,
    });
    expect(
      claimSelfErrorView(
        new ApiClientError(ErrorCode.ACCOUNT_ALREADY_LINKED, 'x', 409, undefined, {
          person_id: mockPeople[2].id,
          display_name: 'ใบเตย',
        }),
        'สมชาย'
      )
    ).toEqual({
      message: interpolate(copy['person.claim_self.already_linked_self'], { ชื่อเดิม: 'ใบเตย' }),
      coded: true,
    });
    expect(claimSelfErrorView(new ApiClientError(ErrorCode.PERSON_DELETED, 'x', 422), 'สมชาย')).toEqual({
      message: interpolate(copy['relation.link.error.person_gone'], { ชื่อ: 'สมชาย' }),
      coded: true,
    });
    expect(claimSelfErrorView(new ApiClientError(ErrorCode.PERSON_DECEASED, 'x', 422), 'สมชาย')).toEqual({
      message: copy['person.claim_self.deceased'],
      coded: true,
    });
  });

  it('maps other failures to the retryable body', () => {
    expect(claimSelfErrorView(new ApiClientError(ErrorCode.INTERNAL_ERROR, 'x', 500), 'สมชาย')).toEqual({
      message: copy['person.claim_self.failed'],
      coded: false,
    });
    expect(claimSelfErrorView(new Error('offline'), 'สมชาย')).toEqual({
      message: copy['person.claim_self.failed'],
      coded: false,
    });
  });
});
