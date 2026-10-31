import { ErrorCode } from '@still-with-you/contracts';
import { copy, interpolate } from '@/copy';
import { ApiClientError } from '@/lib/api-errors';
import { isPersonLiving, type FamilyPerson } from '@/lib/family-graph';

/** Longer than the default toast so the two-line after-create message can be read. */
export const CLAIM_SELF_AFTER_CREATE_TOAST_MS = 8000;

const CODED_CLAIM_ERRORS = new Set<string>([
  ErrorCode.PERSON_ALREADY_CLAIMED,
  ErrorCode.ACCOUNT_ALREADY_LINKED,
  ErrorCode.PERSON_DELETED,
  ErrorCode.PERSON_DECEASED,
]);

export type ClaimSelfErrorView = {
  message: string;
  coded: boolean;
};

/**
 * Admin-only claim. Hidden when the person is deceased, already linked, or the
 * admin already has a live linked person in this family.
 */
export function canClaimPerson(
  person: Pick<FamilyPerson, 'account_id' | 'is_living'>,
  options: {
    isAdmin: boolean;
    accountId?: string;
    people: Pick<FamilyPerson, 'account_id'>[];
  }
): boolean {
  if (!options.isAdmin || !options.accountId) return false;
  if (!isPersonLiving(person) || person.account_id) return false;
  return !options.people.some((row) => row.account_id === options.accountId);
}

export function claimSelfErrorView(error: unknown, name: string): ClaimSelfErrorView {
  if (error instanceof ApiClientError && CODED_CLAIM_ERRORS.has(error.code)) {
    if (error.code === ErrorCode.PERSON_ALREADY_CLAIMED) {
      return { message: interpolate(copy['person.claim_self.taken'], { ชื่อ: name }), coded: true };
    }
    if (error.code === ErrorCode.ACCOUNT_ALREADY_LINKED) {
      const linkedName = typeof error.details?.display_name === 'string' ? error.details.display_name : '';
      return {
        message: interpolate(copy['person.claim_self.already_linked_self'], { ชื่อเดิม: linkedName }),
        coded: true,
      };
    }
    if (error.code === ErrorCode.PERSON_DELETED) {
      return {
        message: interpolate(copy['relation.link.error.person_gone'], { ชื่อ: name }),
        coded: true,
      };
    }
    return { message: copy['person.claim_self.deceased'], coded: true };
  }
  return { message: copy['person.claim_self.failed'], coded: false };
}
