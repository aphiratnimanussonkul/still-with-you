import { useQuery } from '@tanstack/react-query';
import type { AccountResponse } from '@still-with-you/contracts';
import { api } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-client';
import { useAuth } from '@/hooks/use-auth';

/**
 * Send the user to /consent only when they have not answered yet.
 * Never treat marketing_consent === false as unanswered.
 *
 * - consent_answered_at === null → unanswered (backend has shipped)
 * - consent_answered_at is a timestamp → answered
 * - consent_answered_at omitted → old payload; fall back to
 *   marketing_consent != null so we do not lock users out before the field ships
 */
export function isFirstUse(account: AccountResponse): boolean {
  if (account.consent_answered_at !== undefined) {
    return account.consent_answered_at === null;
  }
  return account.marketing_consent == null;
}

export function useMe() {
  const { session } = useAuth();
  return useQuery({
    queryKey: queryKeys.me,
    queryFn: () => api.getMe(),
    enabled: Boolean(session),
  });
}
