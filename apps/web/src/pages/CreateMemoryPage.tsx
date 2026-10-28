import { useCallback, useMemo, useState, type FormEvent } from 'react';
import { CircleNotchIcon } from '@phosphor-icons/react/CircleNotch';
import { PlusIcon } from '@phosphor-icons/react/Plus';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useBeforeUnload, useBlocker, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { PhotoAttach, type PhotoAttachState } from '@/components/PhotoAttach';
import { QueryLoading } from '@/components/QueryLoading';
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
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { copy, interpolate } from '@/copy';
import { useSelectedFamily } from '@/hooks/use-selected-family';
import { api } from '@/lib/api-client';
import { ApiClientError, fieldForError, messageForError } from '@/lib/api-errors';
import {
  buddhistYearOptions,
  daysInCalendarMonth,
  eventDatePayload,
  thaiMonthLabel,
} from '@/lib/dates';
import { familyGraph, personDisplayName, type FamilyPerson } from '@/lib/family-graph';
import { nameInitial } from '@/lib/initials';
import { queryKeys } from '@/lib/query-client';
import { cn } from '@/lib/utils';

const STORY_MAX = 2000;
const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;

const selectClassName =
  'flex h-12 min-h-12 w-full min-w-0 rounded-md border border-input bg-card px-3 py-2 text-body text-foreground';

function PersonChip({
  person,
  invalid,
}: {
  person: Pick<FamilyPerson, 'display_name' | 'name' | 'avatar_url'>;
  invalid?: boolean;
}) {
  const name = personDisplayName(person);
  return (
    <span
      className={cn(
        'flex items-center gap-2 rounded-full px-2 py-1',
        invalid ? 'bg-destructive-subtle' : 'bg-secondary'
      )}
    >
      <Avatar size="sm" className="size-6 border-2 border-card bg-secondary">
        {person.avatar_url ? <AvatarImage src={person.avatar_url} alt="" /> : null}
        <AvatarFallback className="bg-secondary text-[10px] font-semibold text-secondary-foreground">
          {nameInitial(name)}
        </AvatarFallback>
      </Avatar>
      <span className="text-label font-medium">{name}</span>
    </span>
  );
}

export function CreateMemoryPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { familiesQuery, familyId } = useSelectedFamily();
  const [title, setTitle] = useState('');
  const [story, setStory] = useState('');
  const [yearBe, setYearBe] = useState('');
  const [month, setMonth] = useState('');
  const [day, setDay] = useState('');
  const [selectedPeople, setSelectedPeople] = useState<FamilyPerson[]>([]);
  const [draftIds, setDraftIds] = useState<string[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [peopleQuery, setPeopleQuery] = useState('');
  const [photos, setPhotos] = useState<PhotoAttachState>({ mediaIds: [], isBusy: false });
  const [titleError, setTitleError] = useState(false);
  const [storyError, setStoryError] = useState(false);
  const [peopleError, setPeopleError] = useState(false);
  const [allowLeave, setAllowLeave] = useState(false);

  const people = useQuery({
    queryKey: queryKeys.people(familyId ?? ''),
    queryFn: () => familyGraph.listPeople(familyId!),
    enabled: Boolean(familyId),
  });

  const peopleById = useMemo(() => {
    const map = new Map<string, FamilyPerson>();
    for (const person of people.data?.people ?? []) map.set(person.id, person);
    return map;
  }, [people.data]);

  const selectedIds = selectedPeople.map((person) => person.id);

  const filteredPeople = useMemo(() => {
    const list = people.data?.people ?? [];
    const needle = peopleQuery.trim();
    if (!needle) return list;
    return list.filter((person) => personDisplayName(person).includes(needle));
  }, [people.data, peopleQuery]);

  const maxDay = daysInCalendarMonth(yearBe, month);
  const years = useMemo(() => buddhistYearOptions(), []);

  const dirty = Boolean(
    title.trim() ||
      story.trim() ||
      yearBe ||
      month ||
      day ||
      selectedIds.length ||
      photos.mediaIds.length ||
      photos.isBusy
  );

  useBeforeUnload(
    useCallback(
      (unloadEvent: BeforeUnloadEvent) => {
        if (dirty && !allowLeave) {
          unloadEvent.preventDefault();
          unloadEvent.returnValue = '';
        }
      },
      [allowLeave, dirty]
    )
  );
  const blocker = useBlocker(dirty && !allowLeave);

  const create = useMutation({
    mutationFn: () => {
      const date = eventDatePayload(yearBe, month, day);
      return api.createEvent(familyId!, {
        title: title.trim(),
        story: story.trim(),
        person_ids: selectedIds,
        media_ids: photos.mediaIds,
        ...(date ?? {}),
      });
    },
    onSuccess: async (event) => {
      setAllowLeave(true);
      toast.success(copy['save.toast']);
      await queryClient.invalidateQueries({ queryKey: queryKeys.events(familyId!) });
      navigate(`/memories/${event.id}`);
    },
  });

  const saveFailed =
    create.isError && !(create.error instanceof ApiClientError && fieldForError(create.error) === 'person_ids')
      ? messageForError(create.error)
      : null;
  const peopleInvalid =
    peopleError || (create.isError && fieldForError(create.error) === 'person_ids');

  function openPicker() {
    setDraftIds(selectedIds);
    setPeopleQuery('');
    setPickerOpen(true);
  }

  function closePicker(open: boolean) {
    setPickerOpen(open);
    if (!open) {
      setDraftIds(selectedIds);
      setPeopleQuery('');
    }
  }

  function commitPeople() {
    setSelectedPeople(
      draftIds
        .map((id) => peopleById.get(id))
        .filter((person): person is FamilyPerson => Boolean(person))
    );
    setPeopleError(false);
    setPickerOpen(false);
    setPeopleQuery('');
  }

  function toggleDraft(personId: string) {
    setDraftIds((current) =>
      current.includes(personId) ? current.filter((id) => id !== personId) : [...current, personId]
    );
  }

  function onYearChange(value: string) {
    setYearBe(value);
    if (!value) {
      setMonth('');
      setDay('');
      return;
    }
    if (day && Number(day) > daysInCalendarMonth(value, month)) setDay('');
  }

  function onMonthChange(value: string) {
    setMonth(value);
    if (day && Number(day) > daysInCalendarMonth(yearBe, value)) setDay('');
  }

  function onSubmit(formEvent: FormEvent) {
    formEvent.preventDefault();
    const nextTitleError = !title.trim();
    const nextStoryError = !story.trim();
    const nextPeopleError = people.isSuccess && selectedIds.some((id) => !peopleById.has(id));
    setTitleError(nextTitleError);
    setStoryError(nextStoryError);
    setPeopleError(nextPeopleError);
    if (nextTitleError || nextStoryError || nextPeopleError || photos.isBusy || !familyId) return;
    create.mutate();
  }

  if (familiesQuery.isPending) return <QueryLoading />;
  if (familiesQuery.isError) {
    return <p className="px-6 py-4 text-body text-destructive">{messageForError(familiesQuery.error)}</p>;
  }
  if (!familyId) {
    return (
      <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
        <p className="text-h3 font-semibold">{copy['memory.empty.title']}</p>
        <p className="text-body text-muted-foreground">{copy['family.empty.body']}</p>
        <Button asChild>
          <Link to="/family">{copy['family.create.action']}</Link>
        </Button>
      </div>
    );
  }

  return (
    <>
      <form className="flex min-h-0 flex-1 flex-col" onSubmit={onSubmit} noValidate>
        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-6 py-4">
          {saveFailed ? <Alert>{saveFailed}</Alert> : null}

          <div className="flex flex-col gap-2">
            <Label htmlFor="memory-title">{copy['memory.title_label']}</Label>
            <Input
              id="memory-title"
              value={title}
              onChange={(event) => {
                setTitle(event.target.value);
                if (titleError) setTitleError(false);
              }}
              placeholder={copy['memory.title_placeholder']}
              aria-invalid={titleError || undefined}
              className={titleError ? 'border-destructive' : undefined}
            />
            {titleError ? (
              <p className="text-caption text-destructive">{copy['memory.title_required']}</p>
            ) : null}
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-label font-medium">{copy['memory.date_label']}</p>
            <div className="flex gap-2">
              <select
                aria-label={copy['memory.date.year']}
                className={selectClassName}
                value={yearBe}
                onChange={(event) => onYearChange(event.target.value)}
              >
                <option value="">{copy['memory.date.year']}</option>
                {years.map((year) => (
                  <option key={year} value={String(year)}>
                    {year}
                  </option>
                ))}
              </select>
              <select
                aria-label={copy['memory.date.month']}
                className={selectClassName}
                value={month}
                onChange={(event) => onMonthChange(event.target.value)}
              >
                <option value="">{copy['memory.date.month']}</option>
                {MONTHS.map((value) => (
                  <option key={value} value={String(value)}>
                    {thaiMonthLabel(value)}
                  </option>
                ))}
              </select>
              <select
                aria-label={copy['memory.date.day']}
                className={selectClassName}
                value={day}
                onChange={(event) => setDay(event.target.value)}
              >
                <option value="">{copy['memory.date.day']}</option>
                {Array.from({ length: maxDay }, (_, index) => String(index + 1)).map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </div>
            <p className="text-caption text-muted-foreground">{copy['memory.date_placeholder']}</p>
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-label font-medium">{copy['memory.people_label']}</p>
            <div className="flex flex-wrap items-center gap-2">
              {selectedPeople.map((person) => (
                <PersonChip
                  key={person.id}
                  person={person}
                  invalid={people.isSuccess && !peopleById.has(person.id)}
                />
              ))}
              <Button type="button" variant="outline" className="h-9 min-h-9 rounded-lg px-3" onClick={openPicker}>
                <Icon as={PlusIcon} size={16} />
                {selectedIds.length > 0 ? copy['memory.people.edit'] : copy['home.focus.invite.action']}
              </Button>
            </div>
            {peopleInvalid ? (
              <p className="text-caption text-destructive">{copy['person_ids.invalid']}</p>
            ) : null}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="memory-story">{copy['story.label.required']}</Label>
            <Textarea
              id="memory-story"
              value={story}
              maxLength={STORY_MAX}
              onChange={(event) => {
                setStory(event.target.value.slice(0, STORY_MAX));
                if (storyError) setStoryError(false);
              }}
              placeholder={copy['story.placeholder']}
              aria-invalid={storyError || undefined}
              className={cn('min-h-[120px] rounded-[10px]', storyError ? 'border-destructive' : undefined)}
            />
            {storyError ? (
              <p className="text-caption text-destructive">{copy['error.STORY_REQUIRED']}</p>
            ) : (
              <p className="text-caption text-muted-foreground">
                {interpolate(copy['person.bio.counter'], { count: String(story.length) })}
              </p>
            )}
          </div>

          <PhotoAttach
            familyId={familyId}
            onStateChange={setPhotos}
            label={copy['contribution.photos.label']}
            variant="tiles"
          />
          {photos.isBusy ? (
            <p className="text-caption text-muted-foreground">{copy['photo.upload.wait']}</p>
          ) : null}
        </div>

        <div className="border-t border-border bg-background px-6 py-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]">
          <Button
            type="submit"
            size="lg"
            className="w-full"
            disabled={create.isPending || photos.isBusy}
            aria-busy={create.isPending}
          >
            {create.isPending ? (
              <Icon as={CircleNotchIcon} size={16} className="animate-spin motion-reduce:animate-none" />
            ) : null}
            {copy['memory.create.submit']}
          </Button>
        </div>
      </form>

      <Sheet open={pickerOpen} onOpenChange={closePicker}>
        <SheetContent
          side="bottom"
          showCloseButton={false}
          className="h-[min(560px,85dvh)] gap-4 rounded-t-3xl border-0 px-6 py-4"
        >
          <div className="mx-auto h-1 w-8 rounded-sm bg-border" />
          <SheetHeader className="p-0">
            <SheetTitle className="text-h3">{copy['memory.people_label']}</SheetTitle>
            <SheetDescription className="sr-only">{copy['memory.people_label']}</SheetDescription>
          </SheetHeader>
          <Input
            value={peopleQuery}
            onChange={(event) => setPeopleQuery(event.target.value)}
            placeholder={copy['memory.search.placeholder']}
            aria-label={copy['memory.search.placeholder']}
          />
          <div className="min-h-0 flex-1 overflow-y-auto">
            {people.isPending ? <QueryLoading /> : null}
            {people.isError ? (
              <p className="text-body text-destructive">{messageForError(people.error)}</p>
            ) : null}
            {people.isSuccess && filteredPeople.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-6 text-center">
                <p className="text-body text-muted-foreground">{copy['memory.people.search.empty']}</p>
                {peopleQuery.trim() ? (
                  <Button variant="outline" asChild>
                    <Link to="/family/people/new">
                      <Icon as={PlusIcon} size={16} />
                      {interpolate(copy['memory.people.search.add'], { name: peopleQuery.trim() })}
                    </Link>
                  </Button>
                ) : null}
              </div>
            ) : null}
            {people.isSuccess && filteredPeople.length > 0 ? (
              <ul>
                {filteredPeople.map((person) => {
                  const name = personDisplayName(person);
                  const checked = draftIds.includes(person.id);
                  return (
                    <li key={person.id}>
                      <label className="flex h-14 w-full cursor-pointer items-center gap-3 py-2">
                        <Avatar size="lg" className="border-2 border-card bg-secondary">
                          {person.avatar_url ? <AvatarImage src={person.avatar_url} alt="" /> : null}
                          <AvatarFallback className="bg-secondary text-[17px] font-semibold text-secondary-foreground">
                            {nameInitial(name)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="min-w-0 flex-1 truncate text-body">{name}</span>
                        <Checkbox
                          checked={checked}
                          onCheckedChange={() => toggleDraft(person.id)}
                          aria-label={name}
                        />
                      </label>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>
          <SheetFooter className="p-0">
            <Button type="button" size="lg" className="w-full" onClick={commitPeople}>
              {copy['memory.people.done']}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

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
