import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { QueryLoading } from '@/components/QueryLoading';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { copy, interpolate, truncateName } from '@/copy';
import { api } from '@/lib/api-client';
import { messageForError } from '@/lib/api-errors';
import { formatThaiDate } from '@/lib/dates';
import { familyGraph } from '@/lib/family-graph';
import { queryKeys } from '@/lib/query-client';

export function MemoryDetailPage() {
  const { eventId = '' } = useParams();
  const queryClient = useQueryClient();
  const [story, setStory] = useState('');

  const event = useQuery({
    queryKey: queryKeys.event(eventId),
    queryFn: () => api.getEvent(eventId),
    enabled: Boolean(eventId),
  });

  const stories = useQuery({
    queryKey: queryKeys.contributions(eventId),
    queryFn: () => familyGraph.listContributions(eventId),
    enabled: Boolean(eventId),
  });

  const add = useMutation({
    mutationFn: () => familyGraph.createContribution(eventId, story.trim()),
    onSuccess: async () => {
      setStory('');
      await queryClient.invalidateQueries({ queryKey: queryKeys.contributions(eventId) });
    },
  });

  if (event.isPending || stories.isPending) return <QueryLoading />;
  if (event.isError) {
    return <p className="text-body text-destructive">{messageForError(event.error)}</p>;
  }
  if (stories.isError) {
    return <p className="text-body text-destructive">{messageForError(stories.error)}</p>;
  }
  if (!event.data) return null;

  const items = stories.data?.contributions ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h2 className="text-h2 font-semibold break-words">{event.data.title}</h2>
        <p className="text-caption text-muted-foreground">
          {interpolate(copy['memory.detail.meta'], {
            ชื่อคนเริ่ม: copy['glossary.event_creator_fallback'],
            'ปี/วันที่': event.data.occurred_from
              ? formatThaiDate(event.data.occurred_from)
              : formatThaiDate(event.data.created_at),
          })}
        </p>
      </div>

      <section className="flex flex-col gap-3">
        <h3 className="text-h3 font-semibold">
          {interpolate(copy['memory.stories.title'], { จำนวน: String(items.length) })}
        </h3>
        {items.length === 0 ? (
          <p className="text-body text-muted-foreground">{copy['memory.empty.body']}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {items.map((item) => (
              <li key={item.id}>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-body">
                      {interpolate(copy['glossary.contribution_owner'], {
                        ชื่อ: item.owner_display_name ?? copy['glossary.event_creator_fallback'],
                      })}
                    </CardTitle>
                    <CardDescription>{formatThaiDate(item.created_at)}</CardDescription>
                  </CardHeader>
                  {item.story ? (
                    <CardContent>
                      <p className="text-body">{item.story}</p>
                    </CardContent>
                  ) : null}
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Card>
        <CardHeader>
          <CardTitle>{copy['story.add.title']}</CardTitle>
          <CardDescription>
            {interpolate(copy['story.add.context'], {
              ชื่อความทรงจำ: event.data.title ?? truncateName(copy['glossary.event']),
            })}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-col gap-4"
            onSubmit={(formEvent) => {
              formEvent.preventDefault();
              if (story.trim()) add.mutate();
            }}
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor="add-story">{copy['story.label.required']}</Label>
              <Textarea
                id="add-story"
                value={story}
                onChange={(formEvent) => setStory(formEvent.target.value)}
                placeholder={copy['story.placeholder']}
              />
            </div>
            {add.isError ? (
              <p className="text-caption text-destructive">{messageForError(add.error)}</p>
            ) : null}
            <Button type="submit" disabled={add.isPending || !story.trim()}>
              {copy['story.save']}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
