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
  contributions: (eventId: string) => ['events', eventId, 'contributions'] as const,
  members: (familyId: string) => ['families', familyId, 'members'] as const,
  invites: (familyId: string) => ['families', familyId, 'invites'] as const,
  people: (familyId: string) => ['families', familyId, 'people'] as const,
  person: (personId: string) => ['people', personId] as const,
  home: (familyId: string) => ['families', familyId, 'home'] as const,
  focus: (familyId: string) => ['families', familyId, 'focus'] as const,
  facts: (personId: string) => ['people', personId, 'facts'] as const,
  trash: ['trash'] as const,
};
