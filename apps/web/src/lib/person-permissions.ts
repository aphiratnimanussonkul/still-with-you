import type { FamilyMember, FamilyPerson } from '@/lib/family-graph';

export function isFamilySteward(members: FamilyMember[] | undefined, accountId: string | undefined): boolean {
  if (!accountId) return false;
  return members?.some((member) => member.account_id === accountId && member.role === 'admin') ?? false;
}

export function canEditPerson(
  person: FamilyPerson,
  accountId: string | undefined,
  members: FamilyMember[] | undefined
): boolean {
  if (!accountId) return false;
  if (person.created_by_account_id === accountId) return true;
  if (person.account_id === accountId) return true;
  return isFamilySteward(members, accountId);
}
