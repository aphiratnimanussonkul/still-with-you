import { Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Illustration } from '@/components/Illustration';
import { QueryLoading } from '@/components/QueryLoading';
import { copy } from '@/copy';
import { api } from '@/lib/api-client';
import { messageForError } from '@/lib/api-errors';
import { pickFamilyId } from '@/lib/last-family';
import { queryKeys } from '@/lib/query-client';

export function MemoriesIndexPage() {
  const families = useQuery({
    queryKey: queryKeys.families,
    queryFn: () => api.listFamilies(),
  });

  if (families.isPending) return <QueryLoading />;
  if (families.isError) {
    return <p className="text-body text-destructive">{messageForError(families.error)}</p>;
  }

  const items = families.data?.families ?? [];
  const target = pickFamilyId(items.map((family) => family.id));
  if (target) {
    return <Navigate to={`/families/${target}`} replace />;
  }

  return (
    <div className="flex flex-col items-center gap-3 py-6 text-center">
      <Illustration name="memory-story" />
      <p className="text-h3 font-semibold">{copy['memories.empty.title']}</p>
      <p className="text-body text-muted-foreground">{copy['memories.empty.body']}</p>
    </div>
  );
}
