import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { CircleNotchIcon } from '@phosphor-icons/react/CircleNotch';
import { PauseCircleIcon } from '@phosphor-icons/react/PauseCircle';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { AppUpdateBanner } from '@/components/AppUpdateBanner';
import { MemoryEditConflictBanner } from '@/components/MemoryEditConflictBanner';
import { MemoryPauseOthersDialog } from '@/components/MemoryPauseOthersDialog';
import { MemoryUnavailableState } from '@/components/MemoryUnavailableState';
import { QueryLoading } from '@/components/QueryLoading';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { copy, interpolate, ownerDisplayName } from '@/copy';
import { api } from '@/lib/api-client';
import { ApiClientError, messageForError } from '@/lib/api-errors';
import {
  EventEditConflictError,
  baselineFromEvent,
  isEventVersionFieldError,
  openLatestForConflict,
  saveEventEdit,
  type MemoryConflictField,
  type MemoryEditBaseline,
} from '@/lib/event-edit';
import {
  PWA_FLUSH_DRAFTS_EVENT,
  clearDraft,
  memoryEditDraftKey,
  readDraft,
  reloadForAppUpdate,
  writeDraft,
  type MemoryEditDraft,
} from '@/lib/form-draft';
import { queryKeys } from '@/lib/query-client';

export function EditMemoryPage() {
  const { eventId = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const event = useQuery({
    queryKey: queryKeys.event(eventId),
    queryFn: () => api.getEvent(eventId),
    enabled: Boolean(eventId),
  });
  const me = useQuery({
    queryKey: queryKeys.me,
    queryFn: () => api.getMe(),
  });

  const [draftTitle, setDraftTitle] = useState('');
  const [savedTitle, setSavedTitle] = useState('');
  const [saveVersion, setSaveVersion] = useState<number>();
  const [baseline, setBaseline] = useState<MemoryEditBaseline>();
  const [conflict, setConflict] = useState(false);
  const [changedFields, setChangedFields] = useState<MemoryConflictField[]>([]);
  const [opening, setOpening] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [pauseOpen, setPauseOpen] = useState(false);
  const hydratedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!event.data || hydratedFor.current === event.data.id) return;
    hydratedFor.current = event.data.id;
    const title = event.data.title ?? '';
    const stored = readDraft<MemoryEditDraft>(memoryEditDraftKey(event.data.id));
    setDraftTitle(stored?.title ?? title);
    setSavedTitle(title);
    setSaveVersion(event.data.version);
    setBaseline(baselineFromEvent(event.data));
  }, [event.data]);

  const persistEditDraft = useCallback(() => {
    if (!eventId || hydratedFor.current !== eventId) return;
    const key = memoryEditDraftKey(eventId);
    if (draftTitle.trim() === savedTitle.trim()) {
      clearDraft(key);
      return;
    }
    writeDraft(key, { title: draftTitle } satisfies MemoryEditDraft);
  }, [draftTitle, eventId, savedTitle]);

  useEffect(() => {
    persistEditDraft();
  }, [persistEditDraft]);

  useEffect(() => {
    window.addEventListener(PWA_FLUSH_DRAFTS_EVENT, persistEditDraft);
    return () => window.removeEventListener(PWA_FLUSH_DRAFTS_EVENT, persistEditDraft);
  }, [persistEditDraft]);

  const save = useMutation({
    mutationFn: () =>
      saveEventEdit(
        { id: eventId, version: saveVersion! },
        { title: draftTitle.trim() }
      ),
    onSuccess: async (saved) => {
      setConflict(false);
      setChangedFields([]);
      setSavedTitle(saved.title ?? draftTitle.trim());
      setSaveVersion(saved.version);
      clearDraft(memoryEditDraftKey(eventId));
      toast.success(copy['save.toast']);
      await queryClient.invalidateQueries({ queryKey: queryKeys.event(eventId) });
      navigate(`/memories/${eventId}`);
    },
    onError: (error) => {
      if (error instanceof EventEditConflictError) setConflict(true);
    },
  });

  const pauseOthers = useMutation({
    mutationFn: () => api.archiveEvent(eventId),
    onSuccess: async () => {
      setPauseOpen(false);
      const name = ownerDisplayName(event.data?.creator_display_name);
      toast.success(interpolate(copy['memory.pause.others.after'], { owner_display_name: name }));
      await queryClient.invalidateQueries({ queryKey: queryKeys.event(eventId) });
      navigate('/home');
    },
  });

  const openLatest = async () => {
    if (!baseline) return;
    setOpening(true);
    setLoadFailed(false);
    try {
      const opened = await openLatestForConflict(eventId, baseline);
      setSaveVersion(opened.saveVersion);
      setChangedFields(opened.changedFields);
    } catch {
      setLoadFailed(true);
    } finally {
      setOpening(false);
    }
  };

  if (event.isPending) return <QueryLoading />;
  if (event.isError) {
    const status = event.error instanceof ApiClientError ? event.error.status : 0;
    if (status === 404) return <MemoryUnavailableState kind="not_found" />;
    return <Alert>{copy['error.generic.body']}</Alert>;
  }
  if (!event.data || saveVersion === undefined) return <QueryLoading />;

  const dirty = draftTitle.trim() !== savedTitle.trim();
  const titleMissing = !draftTitle.trim();
  const conflictError = save.error instanceof EventEditConflictError;
  const showConflict = conflict || conflictError;
  const showAppUpdate = !showConflict && isEventVersionFieldError(save.error);
  const canPauseOthers = Boolean(
    me.data &&
      me.data.id !== event.data.creator_account_id &&
      !event.data.paused &&
      event.data.status === 'active'
  );
  const ownerName = ownerDisplayName(event.data.creator_display_name);
  const pauseError =
    pauseOthers.isError && !(pauseOthers.error instanceof EventEditConflictError)
      ? messageForError(pauseOthers.error)
      : null;

  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(formEvent: FormEvent) => {
        formEvent.preventDefault();
        if (titleMissing || saveVersion === undefined) return;
        save.mutate();
      }}
    >
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-6 py-4">
        {showConflict ? (
          <MemoryEditConflictBanner
            changedFields={changedFields}
            onOpenLatest={() => {
              void openLatest();
            }}
            opening={opening}
            loadFailed={loadFailed}
          />
        ) : showAppUpdate ? (
          <AppUpdateBanner onReload={reloadForAppUpdate} />
        ) : save.isError ? (
          <Alert>{messageForError(save.error)}</Alert>
        ) : pauseError ? (
          <Alert>{pauseError}</Alert>
        ) : null}
        <div className="flex flex-col gap-2">
          <Label htmlFor="memory-title">{copy['memory.title_label']}</Label>
          <Input
            id="memory-title"
            value={draftTitle}
            onChange={(change) => setDraftTitle(change.target.value)}
          />
          {titleMissing ? (
            <p className="text-caption text-destructive">{copy['memory.title_required']}</p>
          ) : null}
        </div>
        {canPauseOthers ? (
          <div className="flex flex-col gap-4 border-t border-border pt-5">
            <Button
              type="button"
              variant="ghost"
              className="h-auto w-fit justify-start gap-2 px-0 text-destructive hover:bg-transparent hover:text-destructive"
              onClick={() => setPauseOpen(true)}
            >
              <Icon as={PauseCircleIcon} size={20} />
              {copy['memory.pause.action']}
            </Button>
          </div>
        ) : null}
      </div>
      <MemoryPauseOthersDialog
        open={pauseOpen}
        onOpenChange={(open) => {
          if (!pauseOthers.isPending) setPauseOpen(open);
        }}
        ownerName={ownerName}
        confirming={pauseOthers.isPending}
        onConfirm={() => pauseOthers.mutate()}
      />
      <div className="border-t border-border bg-background px-6 py-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]">
        <Button
          type="submit"
          size="lg"
          className="w-full"
          disabled={!dirty || titleMissing || save.isPending || opening}
          aria-busy={save.isPending}
        >
          {save.isPending ? (
            <Icon as={CircleNotchIcon} size={16} className="animate-spin motion-reduce:animate-none" />
          ) : null}
          {copy['story.save']}
        </Button>
      </div>
    </form>
  );
}
