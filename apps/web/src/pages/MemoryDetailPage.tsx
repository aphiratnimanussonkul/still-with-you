import { useCallback, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useBeforeUnload, useBlocker, useParams, useSearchParams } from 'react-router-dom';
import { CircleNotchIcon } from '@phosphor-icons/react/CircleNotch';
import { ImagesIcon } from '@phosphor-icons/react/Images';
import { PlusIcon } from '@phosphor-icons/react/Plus';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Illustration } from '@/components/Illustration';
import { PhotoAttach, type PhotoAttachState } from '@/components/PhotoAttach';
import { StoryCard } from '@/components/StoryCard';
import { copy, interpolate, storyCounter, storyToldAt, truncateName } from '@/copy';
import { api } from '@/lib/api-client';
import { ApiClientError, messageForError } from '@/lib/api-errors';
import { formatThaiDate } from '@/lib/dates';
import { familyGraph } from '@/lib/family-graph';
import { queryKeys } from '@/lib/query-client';

function MemoryUnavailableState({
  kind,
  onRetry,
}: {
  kind: 'not_found' | 'error';
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-4 px-6 py-16 text-center">
      <Illustration name="error-offline" float={false} className="size-[200px]" />
      {kind === 'not_found' ? (
        <>
          <h2 className="text-h3 font-semibold">{copy['memory.unavailable.title']}</h2>
          <p className="text-body text-muted-foreground">{copy['memory.unavailable.body']}</p>
        </>
      ) : (
        <p className="text-body">{copy['error.generic.body']}</p>
      )}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button asChild>
          <Link to="/home">{copy['common.back_home']}</Link>
        </Button>
        {kind === 'error' && onRetry ? (
          <Button type="button" variant="secondary" onClick={onRetry}>
            {copy['common.retry']}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function MemoryCover({ src, alt }: { src: string | null; alt: string }) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const showImage = Boolean(src) && !failed;

  return (
    <div className="flex h-[200px] w-full items-center justify-center overflow-hidden rounded-[10px] bg-muted">
      {showImage ? (
        <img
          src={src!}
          alt={alt}
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          className={`size-full object-cover transition-opacity duration-200 ease-standard motion-reduce:transition-none ${
            loaded ? 'opacity-100' : 'opacity-0'
          }`}
        />
      ) : (
        <Icon as={ImagesIcon} size={32} className="text-muted-foreground" />
      )}
    </div>
  );
}

function MemoryLoading() {
  return (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-col gap-5 px-6 py-5">
        <Skeleton className="h-[200px] w-full rounded-[10px]" />
        <Skeleton className="h-8 w-[260px]" />
        <Skeleton className="h-4 w-[180px]" />
        <Skeleton className="h-[140px] w-full rounded-xl" />
        <Skeleton className="h-[140px] w-full rounded-xl" />
      </div>
      <div className="mt-auto border-t border-border px-6 py-4">
        <Skeleton className="h-[52px] w-full rounded-lg" />
      </div>
    </div>
  );
}

export function MemoryDetailPage() {
  const { eventId = '' } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const [story, setStory] = useState('');
  const [photos, setPhotos] = useState<PhotoAttachState>({ mediaIds: [], isBusy: false });
  const [photoKey, setPhotoKey] = useState(0);
  const [allowLeave, setAllowLeave] = useState(false);

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

  const paused = Boolean(event.data?.paused || event.data?.status === 'archived');
  const composing = searchParams.get('compose') === '1' && !paused;
  const dirty = Boolean(story.trim() || photos.mediaIds.length || photos.isBusy);

  const add = useMutation({
    mutationFn: () =>
      familyGraph.createContribution(eventId, {
        story: story.trim(),
        media_ids: photos.mediaIds.length ? photos.mediaIds : undefined,
      }),
    onSuccess: async () => {
      setAllowLeave(true);
      setStory('');
      setPhotos({ mediaIds: [], isBusy: false });
      setPhotoKey((value) => value + 1);
      setSearchParams({});
      toast.success(copy['save.toast']);
      await queryClient.invalidateQueries({ queryKey: queryKeys.contributions(eventId) });
      setAllowLeave(false);
    },
  });

  const retryEvent = () => {
    void event.refetch();
  };

  const openCompose = () => {
    if (paused) return;
    setSearchParams({ compose: '1' });
  };

  useBeforeUnload(
    useCallback(
      (unloadEvent: BeforeUnloadEvent) => {
        if (composing && dirty && !allowLeave) {
          unloadEvent.preventDefault();
          unloadEvent.returnValue = '';
        }
      },
      [allowLeave, composing, dirty]
    )
  );
  const blocker = useBlocker(composing && dirty && !allowLeave);

  if (event.isPending) return <MemoryLoading />;
  if (event.isError) {
    const status = event.error instanceof ApiClientError ? event.error.status : 0;
    if (status === 404) {
      return <MemoryUnavailableState kind="not_found" />;
    }
    return <MemoryUnavailableState kind="error" onRetry={retryEvent} />;
  }
  if (!event.data) {
    return <MemoryUnavailableState kind="not_found" />;
  }

  const items = stories.data?.contributions ?? [];
  const title = event.data.title ?? copy['glossary.event'];

  if (composing) {
    return (
      <>
        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(formEvent) => {
            formEvent.preventDefault();
            if (story.trim()) add.mutate();
          }}
        >
          <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-6 py-5">
            <p className="text-body text-muted-foreground">
              {interpolate(copy['story.add.context'], {
                ชื่อความทรงจำ: event.data.title ?? truncateName(copy['glossary.event']),
              })}
            </p>
            <div className="flex flex-col gap-2">
              <Label htmlFor="add-story">{copy['story.label.required']}</Label>
              <Textarea
                id="add-story"
                value={story}
                onChange={(formEvent) => setStory(formEvent.target.value)}
                placeholder={copy['story.placeholder']}
                className="min-h-[120px] rounded-[10px] border-2"
              />
            </div>
            <PhotoAttach
              key={photoKey}
              familyId={event.data.family_id}
              onStateChange={setPhotos}
              label={copy['contribution.photos.label']}
              variant="tiles"
            />
            {photos.isBusy ? (
              <p className="text-caption text-muted-foreground">{copy['photo.upload.wait']}</p>
            ) : null}
            {add.isError ? <Alert>{messageForError(add.error)}</Alert> : null}
          </div>
          <div className="border-t border-border bg-background px-6 py-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]">
            <Button
              type="submit"
              size="lg"
              className="w-full"
              disabled={add.isPending || photos.isBusy || !story.trim()}
              aria-busy={add.isPending}
            >
              {add.isPending ? (
                <Icon as={CircleNotchIcon} size={16} className="animate-spin motion-reduce:animate-none" />
              ) : null}
              {copy['story.save']}
            </Button>
          </div>
        </form>
        <AlertDialog open={blocker.state === 'blocked'} onOpenChange={(open) => !open && blocker.reset?.()}>
          <AlertDialogContent className="rounded-xl">
            <AlertDialogHeader>
              <AlertDialogTitle>{copy['unsaved.title']}</AlertDialogTitle>
              <AlertDialogDescription>{copy['unsaved.body']}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="flex flex-col gap-2 sm:flex-col">
              <AlertDialogCancel variant="default" className="w-full" onClick={() => blocker.reset?.()}>
                {copy['unsaved.stay']}
              </AlertDialogCancel>
              <AlertDialogAction
                variant="outline"
                className="w-full border-destructive text-destructive hover:bg-destructive/10"
                onClick={() => {
                  setAllowLeave(true);
                  blocker.proceed?.();
                }}
              >
                {copy['unsaved.leave']}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-6 py-5">
        {paused ? <Alert variant="warning">{copy['memory.paused.banner']}</Alert> : null}
        <MemoryCover src={event.data.cover_url} alt={title} />
        <div className="flex flex-col gap-2">
          {paused ? (
            <Badge
              variant="secondary"
              className="h-6 w-fit rounded-full bg-muted px-2 text-caption text-muted-foreground"
            >
              {copy['memory.paused.badge']}
            </Badge>
          ) : null}
          <h2 className="text-h1 font-semibold break-words">{title}</h2>
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
          {stories.isSuccess ? (
            <h3 className="text-h3 font-semibold">{storyCounter(items.length)}</h3>
          ) : null}
          {stories.isPending ? (
            <>
              <Skeleton className="h-[140px] w-full rounded-xl" />
              <Skeleton className="h-[140px] w-full rounded-xl" />
            </>
          ) : null}
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
                  <StoryCard
                    name={item.owner_display_name ?? copy['glossary.event_creator_fallback']}
                    date={storyToldAt(item.created_at)}
                    body={item.story}
                    media={item.media}
                  />
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      </div>

      <div className="border-t border-border bg-background px-6 py-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]">
        <Button type="button" size="lg" className="w-full" disabled={paused} onClick={openCompose}>
          <Icon as={PlusIcon} size={16} />
          {copy['story.add.action']}
        </Button>
      </div>
    </div>
  );
}
