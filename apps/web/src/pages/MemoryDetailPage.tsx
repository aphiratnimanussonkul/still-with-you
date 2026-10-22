import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { ContributionPhotos } from '@/components/ContributionPhotos';
import { PhotoAttach, type PhotoAttachState } from '@/components/PhotoAttach';
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
  const [photos, setPhotos] = useState<PhotoAttachState>({ mediaIds: [], isBusy: false });
  const [photoKey, setPhotoKey] = useState(0);

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
    mutationFn: () =>
      familyGraph.createContribution(eventId, {
        story: story.trim(),
        media_ids: photos.mediaIds.length ? photos.mediaIds : undefined,
      }),
    onSuccess: async () => {
      setStory('');
      setPhotos({ mediaIds: [], isBusy: false });
      setPhotoKey((value) => value + 1);
      await queryClient.invalidateQueries({ queryKey: queryKeys.contributions(eventId) });
    },
  });

  if (event.isPending) return <QueryLoading />;
  if (event.isError) {
    return <p className="text-body text-destructive">{messageForError(event.error)}</p>;
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
          {interpolate(copy['memory.stories.title'], {
            จำนวน: String(stories.isSuccess ? items.length : 0),
          })}
        </h3>
        {stories.isPending ? <QueryLoading /> : null}
        {stories.isError ? (
          <div className="flex flex-col items-start gap-3">
            <p className="text-body text-destructive">{copy['memory.stories.load_error']}</p>
            <Button type="button" variant="secondary" onClick={() => void stories.refetch()}>
              {copy['memory.stories.retry']}
            </Button>
          </div>
        ) : null}
        {stories.isSuccess && items.length === 0 ? (
          <p className="text-body text-muted-foreground">{copy['memory.empty.body']}</p>
        ) : null}
        {stories.isSuccess && items.length > 0 ? (
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
                  {item.story || item.media?.length ? (
                    <CardContent className="flex flex-col gap-3">
                      {item.story ? <p className="text-body">{item.story}</p> : null}
                      <ContributionPhotos
                        media={item.media}
                        ownerName={item.owner_display_name ?? copy['glossary.event_creator_fallback']}
                      />
                    </CardContent>
                  ) : null}
                </Card>
              </li>
            ))}
          </ul>
        ) : null}
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
            <PhotoAttach
              key={photoKey}
              familyId={event.data.family_id}
              onStateChange={setPhotos}
              label={copy['contribution.photos.label']}
            />
            {photos.isBusy ? (
              <p className="text-caption text-muted-foreground">{copy['photo.upload.wait']}</p>
            ) : null}
            {add.isError ? (
              <p className="text-caption text-destructive">{messageForError(add.error)}</p>
            ) : null}
            <Button type="submit" disabled={add.isPending || photos.isBusy || !story.trim()}>
              {copy['story.save']}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
