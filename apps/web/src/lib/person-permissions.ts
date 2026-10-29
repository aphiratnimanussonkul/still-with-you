import type { FamilyMember, FamilyPerson } from '@/lib/family-graph';

export function isFamilySteward(members: FamilyMember[] | undefined, accountId: string | undefined): boolean {
  if (!accountId) return false;
  return members?.some((member) => member.account_id === accountId && member.role === 'admin') ?? false;
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
