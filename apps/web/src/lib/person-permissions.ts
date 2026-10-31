import { isPersonLiving, type FamilyMember, type FamilyPerson } from '@/lib/family-graph';

/** Active membership: no `left_at`, and `status` is absent or `active`. */
export function isActiveMembership(member: Pick<FamilyMember, 'left_at' | 'status'>): boolean {
  if (member.left_at) return false;
  return member.status == null || member.status === 'active';
}

/** Family steward (`family_members.role = 'admin'`). Gates add-person UI and POST /v1/families/{id}/people. */
export function isFamilySteward(members: FamilyMember[] | undefined, accountId: string | undefined): boolean {
  if (!accountId) return false;
  return (
    members?.some(
      (member) =>
        member.account_id === accountId && member.role === 'admin' && isActiveMembership(member)
    ) ?? false
  );
}

/** Profile invite: steward + living + not pending/linked. Hidden for non-admins. */
export function canInvitePerson(
  person: Pick<FamilyPerson, 'account_id' | 'invite_status' | 'is_living'>,
  isAdmin: boolean
): boolean {
  if (!isAdmin || !isPersonLiving(person) || person.account_id) return false;
  return person.invite_status !== 'pending' && person.invite_status !== 'linked';
}

/**
 * PATCH /v1/people/{id} and DELETE /v1/people/{id} are family steward only
 * (`family_members.role = 'admin'`). Creator and linked self are 403; missing/non-member are 404.
 */
export function canEditPerson(
  _person: FamilyPerson,
  accountId: string | undefined,
  members: FamilyMember[] | undefined
): boolean {
  return isFamilySteward(members, accountId);
}
