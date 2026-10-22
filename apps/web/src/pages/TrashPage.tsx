import { TrashIcon } from '@phosphor-icons/react/Trash';
import { useQuery } from '@tanstack/react-query';
import { Illustration } from '@/components/Illustration';
import { QueryLoading } from '@/components/QueryLoading';
import { Icon } from '@/components/ui/icon';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { copy, interpolate, truncateName } from '@/copy';
import { familyGraph } from '@/lib/family-graph';
import { messageForError } from '@/lib/api-errors';
import { formatThaiDate } from '@/lib/dates';
import { queryKeys } from '@/lib/query-client';

export function TrashPage() {
  const trash = useQuery({
    queryKey: queryKeys.trash,
    queryFn: () => familyGraph.listTrash(),
  });

  if (trash.isPending) return <QueryLoading />;
  if (trash.isError) {
    return <p className="text-body text-destructive">{messageForError(trash.error)}</p>;
  }

  const items = trash.data?.items ?? [];

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <Icon as={TrashIcon} size={48} weight="duotone" className="text-primary" />
        <Illustration name="trash-empty" />
        <p className="text-h3 font-semibold">{copy['trash.empty.title']}</p>
        <p className="text-body text-muted-foreground">{copy['trash.empty.body']}</p>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {items.map((item) => (
        <li key={item.id}>
          <Card>
            <CardHeader>
              <CardTitle className="truncate">{truncateName(item.story ?? copy['glossary.contribution'])}</CardTitle>
              <CardDescription>
                {interpolate(copy['trash.item.active.meta.family'], {
                  ชื่อความทรงจำ: item.origin_event_title ?? copy['glossary.event'],
                  ชื่อครอบครัว: item.family_name,
                })}
                {' · '}
                {formatThaiDate(item.trashed_at)}
              </CardDescription>
            </CardHeader>
          </Card>
        </li>
      ))}
    </ul>
  );
}
