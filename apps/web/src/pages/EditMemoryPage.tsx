import { useEffect, useRef, useState, type FormEvent } from 'react';
import { CircleNotchIcon } from '@phosphor-icons/react/CircleNotch';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { MemoryEditConflictBanner } from '@/components/MemoryEditConflictBanner';
import { QueryLoading } from '@/components/QueryLoading';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { copy } from '@/copy';
import { api } from '@/lib/api-client';
import { ApiClientError, messageForError } from '@/lib/api-errors';
import {
  EventEditConflictError,
  baselineFromEvent,
  openLatestForConflict,
  saveEventEdit,
  type MemoryConflictField,
  type MemoryEditBaseline,
} from '@/lib/event-edit';
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

  const [draftTitle, setDraftTitle] = useState('');
  const [savedTitle, setSavedTitle] = useState('');
  const [saveVersion, setSaveVersion] = useState<number>();
  const [baseline, setBaseline] = useState<MemoryEditBaseline>();
  const [conflict, setConflict] = useState(false);
  const [changedFields, setChangedFields] = useState<MemoryConflictField[]>([]);
  const [opening, setOpening] = useState(false);
  const hydratedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!event.data || hydratedFor.current === event.data.id) return;
    hydratedFor.current = event.data.id;
    const title = event.data.title ?? '';
    setDraftTitle(title);
    setSavedTitle(title);
    setSaveVersion(event.data.version);
    setBaseline(baselineFromEvent(event.data));
  }, [event.data]);

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
      toast.success(copy['save.toast']);
      await queryClient.invalidateQueries({ queryKey: queryKeys.event(eventId) });
      navigate(`/memories/${eventId}`);
    },
    onError: (error) => {
      if (error instanceof EventEditConflictError) setConflict(true);
    },
  });

  const openLatest = async () => {
    if (!baseline) return;
    setOpening(true);
    try {
      const opened = await openLatestForConflict(eventId, baseline);
      setSaveVersion(opened.saveVersion);
      setChangedFields(opened.changedFields);
    } finally {
      setOpening(false);
    }
  };

  if (event.isPending) return <QueryLoading />;
  if (event.isError) {
    const status = event.error instanceof ApiClientError ? event.error.status : 0;
    return <Alert>{status === 404 ? copy['memory.unavailable.body'] : copy['error.generic.body']}</Alert>;
  }
  if (!event.data || saveVersion === undefined) return <QueryLoading />;

  const dirty = draftTitle.trim() !== savedTitle.trim();
  const titleMissing = !draftTitle.trim();
  const conflictError = save.error instanceof EventEditConflictError;
  const showConflict = conflict || conflictError;

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
          />
        ) : save.isError ? (
          <Alert>{messageForError(save.error)}</Alert>
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
      </div>
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
