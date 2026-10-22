import { useCallback, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { pickFamilyId, rememberFamilyId } from '@/lib/last-family';
import { queryKeys } from '@/lib/query-client';

export function useSelectedFamily() {
  const families = useQuery({
    queryKey: queryKeys.families,
    queryFn: () => api.listFamilies(),
  });
  const items = families.data?.families ?? [];
  const ids = items.map((family) => family.id);
  const [selectedId, setSelectedId] = useState<string | null>(() => pickFamilyId(ids));

  const resolvedId = useMemo(() => {
    if (selectedId && ids.includes(selectedId)) return selectedId;
    return pickFamilyId(ids);
  }, [ids, selectedId]);

  const family = items.find((item) => item.id === resolvedId) ?? null;

  const select = useCallback((familyId: string) => {
    rememberFamilyId(familyId);
    setSelectedId(familyId);
  }, []);

  return {
    familiesQuery: families,
    families: items,
    familyId: resolvedId,
    family,
    select,
  };
}
