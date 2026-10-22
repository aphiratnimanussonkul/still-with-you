import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { Illustration } from '@/components/Illustration';
import { QueryLoading } from '@/components/QueryLoading';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { copy } from '@/copy';
import { api } from '@/lib/api-client';
import { messageForError } from '@/lib/api-errors';
import { formatThaiDate } from '@/lib/dates';
import { rememberFamilyId } from '@/lib/last-family';
import { queryKeys } from '@/lib/query-client';

export function MemoriesPage() {
  const { familyId = '' } = useParams();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [story, setStory] = useState('');

  useEffect(() => {
    if (familyId) rememberFamilyId(familyId);
  }, [familyId]);

  const family = useQuery({
    queryKey: queryKeys.family(familyId),
    queryFn: () => api.getFamily(familyId),
    enabled: Boolean(familyId),
  });

  const events = useQuery({
    queryKey: queryKeys.events(familyId),
    queryFn: () => api.listEvents(familyId),
    enabled: Boolean(familyId),
  });

  const create = useMutation({
    mutationFn: () => api.createEvent(familyId, { title, story, person_ids: [] }),
    onSuccess: async () => {
      setTitle('');
      setStory('');
      await queryClient.invalidateQueries({ queryKey: queryKeys.events(familyId) });
    },
  });

  if (family.isPending || events.isPending) return <QueryLoading />;
  if (family.isError) {
    return <p className="text-body text-destructive">{messageForError(family.error)}</p>;
  }
  if (events.isError) {
    return <p className="text-body text-destructive">{messageForError(events.error)}</p>;
  }

  const items = events.data?.events ?? [];

  return (
    <div className="flex flex-col gap-6">
      {family.data?.name ? (
        <p className="text-body text-muted-foreground">{family.data.name}</p>
      ) : null}

      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <Illustration name="memory-story" />
          <p className="text-h3 font-semibold">{copy['memories.empty.title']}</p>
          <p className="text-body text-muted-foreground">{copy['memories.empty.body']}</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((event) => (
            <li key={event.id}>
              <Card>
                <CardHeader>
                  <div className="flex items-start justify-between gap-3">
                    <CardTitle>{event.title}</CardTitle>
                    {event.status === 'archived' ? (
                      <Badge variant="warning">{copy['memory.paused.badge']}</Badge>
                    ) : null}
                  </div>
                  <CardDescription>
                    {event.occurred_from
                      ? formatThaiDate(event.occurred_from)
                      : formatThaiDate(event.created_at)}
                  </CardDescription>
                </CardHeader>
                {event.location ? (
                  <CardContent>
                    <p className="text-caption text-muted-foreground">{event.location}</p>
                  </CardContent>
                ) : null}
              </Card>
            </li>
          ))}
        </ul>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{copy['memories.create.title']}</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (title.trim() && story.trim()) create.mutate();
            }}
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor="memory-title">{copy['memories.create.title_label']}</Label>
              <Input
                id="memory-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder={copy['memories.create.title_placeholder']}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="memory-story">{copy['memories.create.story_label']}</Label>
              <Textarea
                id="memory-story"
                value={story}
                onChange={(event) => setStory(event.target.value)}
                placeholder={copy['memories.create.story_placeholder']}
              />
            </div>
            {create.isError ? (
              <p className="text-caption text-destructive">{messageForError(create.error)}</p>
            ) : null}
            <Button type="submit" disabled={create.isPending || !title.trim() || !story.trim()}>
              {copy['memories.create.submit']}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
