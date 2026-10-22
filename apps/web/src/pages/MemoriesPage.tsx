import { useState } from 'react';
import { ArchiveIcon } from '@phosphor-icons/react/Archive';
import { BookOpenTextIcon } from '@phosphor-icons/react/BookOpenText';
import { CalendarBlankIcon } from '@phosphor-icons/react/CalendarBlank';
import { MapPinIcon } from '@phosphor-icons/react/MapPin';
import { PlusIcon } from '@phosphor-icons/react/Plus';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { FamilySwitcher } from '@/components/FamilySwitcher';
import { Illustration } from '@/components/Illustration';
import { PhotoAttach, type PhotoAttachState } from '@/components/PhotoAttach';
import { QueryLoading } from '@/components/QueryLoading';
import { Icon } from '@/components/ui/icon';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { copy, truncateName } from '@/copy';
import { useSelectedFamily } from '@/hooks/use-selected-family';
import { api } from '@/lib/api-client';
import { messageForError } from '@/lib/api-errors';
import { formatThaiDate } from '@/lib/dates';
import { queryKeys } from '@/lib/query-client';

export function MemoriesPage() {
  const queryClient = useQueryClient();
  const { familiesQuery, families, familyId, select } = useSelectedFamily();
  const [title, setTitle] = useState('');
  const [story, setStory] = useState('');
  const [filter, setFilter] = useState<'all' | 'paused'>('all');
  const [photos, setPhotos] = useState<PhotoAttachState>({ mediaIds: [], isBusy: false });
  const [photoKey, setPhotoKey] = useState(0);

  const events = useQuery({
    queryKey: queryKeys.events(familyId ?? ''),
    queryFn: () => api.listEvents(familyId!),
    enabled: Boolean(familyId),
  });

  const create = useMutation({
    mutationFn: () =>
      api.createEvent(familyId!, { title, story, person_ids: [], media_ids: photos.mediaIds }),
    onSuccess: async () => {
      setTitle('');
      setStory('');
      setPhotos({ mediaIds: [], isBusy: false });
      setPhotoKey((value) => value + 1);
      await queryClient.invalidateQueries({ queryKey: queryKeys.events(familyId!) });
    },
  });

  if (familiesQuery.isPending) return <QueryLoading />;
  if (familiesQuery.isError) {
    return <p className="text-body text-destructive">{messageForError(familiesQuery.error)}</p>;
  }

  if (!familyId) {
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <Icon as={BookOpenTextIcon} size={48} weight="duotone" className="text-primary" />
        <Illustration name="memory-story" />
        <p className="text-h3 font-semibold">{copy['memory.empty.title']}</p>
        <p className="text-body text-muted-foreground">{copy['family.empty.body']}</p>
        <Button asChild>
          <Link to="/family">{copy['family.create.action']}</Link>
        </Button>
      </div>
    );
  }

  const items = (events.data?.events ?? []).filter((event) =>
    filter === 'paused' ? event.status === 'archived' : true
  );

  return (
    <div className="flex flex-col gap-6">
      <FamilySwitcher families={families} selectedId={familyId} onSelect={select} />

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant={filter === 'all' ? 'default' : 'secondary'} onClick={() => setFilter('all')}>
          {copy['memory.filter.all']}
        </Button>
        <Button
          type="button"
          variant={filter === 'paused' ? 'default' : 'secondary'}
          onClick={() => setFilter('paused')}
        >
          {copy['memory.filter.paused']}
        </Button>
      </div>

      {events.isPending ? <QueryLoading /> : null}
      {events.isError ? (
        <div className="flex flex-col items-start gap-3">
          <p className="text-body text-destructive">{copy['memory.stories.load_error']}</p>
          <Button type="button" variant="secondary" onClick={() => void events.refetch()}>
            {copy['memory.stories.retry']}
          </Button>
        </div>
      ) : null}

      {events.isSuccess && items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <Icon as={BookOpenTextIcon} size={48} weight="duotone" className="text-primary" />
          <Illustration name="memory-story" />
          <p className="text-h3 font-semibold">
            {filter === 'paused' ? copy['archived.empty.title'] : copy['memory.empty.title']}
          </p>
          <p className="text-body text-muted-foreground">
            {filter === 'paused' ? copy['archived.empty.body'] : copy['memory.empty.body']}
          </p>
        </div>
      ) : null}
      {events.isSuccess && items.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {items.map((event) => (
            <li key={event.id}>
              <Link to={`/memories/${event.id}`} className="block">
                <Card>
                  <CardHeader className="flex-row items-start gap-3">
                    <span className="mt-0.5 text-muted-foreground">
                      <Icon as={BookOpenTextIcon} size={24} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <CardTitle className="truncate">{truncateName(event.title ?? '')}</CardTitle>
                        {event.status === 'archived' ? (
                          <Badge variant="warning" className="shrink-0">
                            <Icon as={ArchiveIcon} size={16} />
                            {copy['memory.paused.badge']}
                          </Badge>
                        ) : null}
                      </div>
                      <CardDescription className="mt-1 flex items-center gap-1">
                        <Icon as={CalendarBlankIcon} size={16} />
                        {event.occurred_from
                          ? formatThaiDate(event.occurred_from)
                          : formatThaiDate(event.created_at)}
                      </CardDescription>
                    </div>
                  </CardHeader>
                  {event.location ? (
                    <CardContent>
                      <p className="flex items-center gap-1 truncate text-caption text-muted-foreground">
                        <Icon as={MapPinIcon} size={16} />
                        {event.location}
                      </p>
                    </CardContent>
                  ) : null}
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{copy['memory.create.title']}</CardTitle>
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
              <Label htmlFor="memory-title">{copy['memory.title_label']}</Label>
              <Input
                id="memory-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder={copy['memory.title_placeholder']}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="memory-story">{copy['story.label.required']}</Label>
              <Textarea
                id="memory-story"
                value={story}
                onChange={(event) => setStory(event.target.value)}
                placeholder={copy['story.placeholder']}
              />
            </div>
            <PhotoAttach key={photoKey} familyId={familyId} onStateChange={setPhotos} />
            {photos.isBusy ? (
              <p className="text-caption text-muted-foreground">{copy['photo.upload.wait']}</p>
            ) : null}
            {create.isError ? (
              <p className="text-caption text-destructive">{messageForError(create.error)}</p>
            ) : null}
            <Button
              type="submit"
              disabled={create.isPending || photos.isBusy || !title.trim() || !story.trim()}
            >
              <Icon as={PlusIcon} size={20} />
              {copy['memory.create.submit']}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
