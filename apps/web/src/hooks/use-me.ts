import { useQuery } from '@tanstack/react-query';
import type { AccountResponse } from '@still-with-you/contracts';
import { api } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-client';
import { useAuth } from '@/hooks/use-auth';

export function isFirstUse(account: AccountResponse): boolean {
  return account.marketing_consent_at === null;
}

export function useMe() {
  const { session } = useAuth();
  return useQuery({
    queryKey: queryKeys.me,
    queryFn: () => api.getMe(),
    enabled: Boolean(session),
  });
}
