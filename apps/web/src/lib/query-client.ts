import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

export const queryKeys = {
  me: ['me'] as const,
  families: ['families'] as const,
  family: (id: string) => ['families', id] as const,
  events: (familyId: string) => ['families', familyId, 'events'] as const,
  event: (id: string) => ['events', id] as const,
};
