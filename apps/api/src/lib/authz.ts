import { db, familyMembers } from './db/index.js';
import { and, eq, isNull } from 'drizzle-orm';
import { AppError, ErrorCode } from '@still-with-you/contracts';

/**
 * family_members.role = 'admin' is the family steward. No separate table.
 */
export const FAMILY_STEWARD_ROLE = 'admin' as const;

export async function findActiveMember(familyId: string, accountId: string) {
  const [member] = await db
    .select()
    .from(familyMembers)
    .where(
      and(eq(familyMembers.familyId, familyId), eq(familyMembers.accountId, accountId), isNull(familyMembers.leftAt))
    )
    .limit(1);

  return member ?? null;
}

export async function getActiveMember(familyId: string, accountId: string) {
  const member = await findActiveMember(familyId, accountId);
  if (!member) {
    throw new AppError(ErrorCode.FORBIDDEN, 'You are not a member of this family', 403);
  }
  return member;
}

export function isFamilySteward(role: string): boolean {
  return role === FAMILY_STEWARD_ROLE;
}

/**
 * Creator or family steward (admin). Used for editing core event fields,
 * archive, restore, and permanent delete (AC-23, AC-26).
 */
export async function canManageEvent(
  event: { familyId: string; creatorAccountId: string | null },
  accountId: string
): Promise<boolean> {
  const member = await findActiveMember(event.familyId, accountId);
  if (!member) {
    return false;
  }
  return event.creatorAccountId === accountId || isFamilySteward(member.role);
}

export async function assertCanManageEvent(
  event: { familyId: string; creatorAccountId: string | null },
  accountId: string
): Promise<void> {
  if (!(await canManageEvent(event, accountId))) {
    throw new AppError(ErrorCode.FORBIDDEN, 'You do not have permission to manage this event', 403);
  }
}

/** Stories, contributions, and media are owner-only (AC-24). */
export function assertContributionOwner(ownerAccountId: string, accountId: string): void {
  if (ownerAccountId !== accountId) {
    throw new AppError(
      ErrorCode.FORBIDDEN,
      'Only the owner can edit or delete this contribution or its media',
      403
    );
  }
}
