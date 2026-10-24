import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { QueryLoading } from '@/components/QueryLoading';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { copy } from '@/copy';
import { messageForError } from '@/lib/api-errors';
import { formatThaiDateTime } from '@/lib/dates';
import { rememberFamilyId } from '@/lib/last-family';
import {
  notificationBody,
  notificationFamilyId,
  notificationHref,
  notificationsApi,
  type NotificationResponse,
} from '@/lib/notifications-api';
import { queryKeys } from '@/lib/query-client';
import { cn } from '@/lib/utils';

export function NotificationsList() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const list = useInfiniteQuery({
    queryKey: queryKeys.notifications,
    queryFn: ({ pageParam }) => notificationsApi.list(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
  });
  const markRead = useMutation({
    mutationFn: (id: string) => notificationsApi.markRead(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.notifications });
    },
  });

  const items = list.data?.pages.flatMap((page) => page.notifications) ?? [];

  async function open(item: NotificationResponse) {
    rememberFamilyId(notificationFamilyId(item));
    if (!item.read_at) {
      try {
        await markRead.mutateAsync(item.id);
      } catch {
        // Still open the destination; read state can catch up on the next list fetch.
      }
    }
    navigate(notificationHref(item));
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-h3 font-semibold">{copy['notification.list.title']}</h2>
      {list.isPending ? (
        <QueryLoading />
      ) : list.isError ? (
        <div className="flex flex-col gap-2">
          <p className="text-body text-destructive">{messageForError(list.error)}</p>
          <Button type="button" variant="ghost" size="sm" onClick={() => void list.refetch()}>
            {copy['family.focus.load_error.action']}
          </Button>
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <p className="text-h3 font-semibold">{copy['notification.empty.title']}</p>
          <p className="text-body text-muted-foreground">{copy['notification.empty.body']}</p>
        </div>
      ) : (
        <>
          <ul className="flex flex-col gap-3">
            {items.map((item) => {
              const unread = item.read_at === null;
              const body = notificationBody(item);
              return (
                <li key={item.id}>
                  <Card>
                    <button
                      type="button"
                      className="w-full rounded-xl text-left outline-offset-[-2px]"
                      onClick={() => void open(item)}
                    >
                      <CardHeader>
                        <CardTitle className="text-body font-medium leading-relaxed">
                          {unread ? (
                            <>
                              <span
                                className={cn('mr-2 inline-block size-2 rounded-full bg-primary align-middle')}
                                aria-hidden
                              />
                              <span className="sr-only">{copy['a11y.notification.unread']}</span>
                            </>
                          ) : null}
                          {body}
                        </CardTitle>
                        <CardDescription>{formatThaiDateTime(item.created_at)}</CardDescription>
                      </CardHeader>
                    </button>
                  </Card>
                </li>
              );
            })}
          </ul>
          {list.hasNextPage ? (
            <Button
              type="button"
              variant="outline"
              disabled={list.isFetchingNextPage}
              onClick={() => void list.fetchNextPage()}
            >
              {copy['notification.load_more']}
            </Button>
          ) : null}
        </>
      )}
    </section>
  );
}
