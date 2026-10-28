import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CaretRightIcon } from '@phosphor-icons/react/CaretRight';
import { ErrorCode, type FamilyResponse } from '@still-with-you/contracts';
import { toast } from 'sonner';
import { FadeCover } from '@/components/FadeCover';
import { FamilySwitcher } from '@/components/FamilySwitcher';
import { Illustration } from '@/components/Illustration';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { copy, interpolate } from '@/copy';
import { useMe } from '@/hooks/use-me';
import { useSelectedFamily } from '@/hooks/use-selected-family';
import { api } from '@/lib/api-client';
import { ApiClientError, messageForError } from '@/lib/api-errors';
import { formatThaiDate } from '@/lib/dates';
import { homeApi } from '@/lib/home-api';
import { nameInitial } from '@/lib/initials';
import { queryKeys } from '@/lib/query-client';

export function HomePage() {
  const me = useMe();
  const { familiesQuery, families, familyId, family, select } = useSelectedFamily();
  const home = useQuery({
    queryKey: queryKeys.home(familyId ?? ''),
    queryFn: () => homeApi.getHome(familyId!),
    enabled: Boolean(familyId),
  });
  const events = useQuery({
    queryKey: queryKeys.events(familyId ?? ''),
    queryFn: () => api.listEvents(familyId!),
    enabled: Boolean(familyId),
  });

  if (familiesQuery.isPending) return <HomeLoading />;
  if (familiesQuery.isError) {
    return <p className="px-6 py-5 text-body text-destructive">{messageForError(familiesQuery.error)}</p>;
  }

  const greeting = interpolate(copy['welcome.title'], {
    ชื่อ: me.data?.display_name || me.data?.email || '',
  });

  if (families.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 px-6 py-16 text-center">
        <Illustration name="family-home" float={false} className="size-[200px]" />
        <p className="text-h3 font-semibold">{copy['family.empty.title']}</p>
        <p className="text-body text-muted-foreground">{copy['family.empty.body']}</p>
        <Button asChild>
          <Link to="/family">{copy['family.create.action']}</Link>
        </Button>
      </div>
    );
  }

  const focus = home.data?.focus ?? [];
  const question = home.data?.quick_question ?? null;
  const recent =
    events.data?.events
      ?.filter((event) => event.status === 'active')
      .slice(0, 5) ??
    home.data?.recent_memories.slice(0, 5) ??
    [];
  const memoriesFailed = events.isError && home.isError;
  const memoriesPending = events.isPending && home.isPending;
  const showInvite = home.isSuccess && focus.length === 0;
  const showQuestion = home.isSuccess && focus.length > 0 && question && familyId;

  return (
    <div className="flex flex-col">
      <HomeAppBar
        families={families}
        familyId={familyId}
        onSelect={select}
        viewerName={me.data?.display_name ?? ''}
      />
      <div className="flex flex-col gap-6 px-6 py-5">
        <p className="text-h1 font-semibold">{greeting}</p>

        <section className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <h2 className="min-w-0 flex-1 text-h3 font-semibold">{copy['home.focus.title']}</h2>
            {home.isSuccess && focus.length > 0 ? (
              <Button variant="link" size="sm" className="h-9 px-3 text-primary" asChild>
                <Link to="/family">{copy['home.focus.see_all']}</Link>
              </Button>
            ) : null}
          </div>
          {home.isPending ? <FocusSkeleton /> : null}
          {home.isError ? (
            <>
              <Alert>{copy['error.generic']}</Alert>
              <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => void home.refetch()}>
                {copy['family.focus.load_error.action']}
              </Button>
            </>
          ) : null}
          {showInvite ? (
            <div className="flex flex-col items-start gap-3 rounded-2xl border border-border bg-card p-5">
              <p className="text-h3 font-semibold">{copy['home.focus.invite.title']}</p>
              <p className="text-body text-muted-foreground">{copy['home.focus.invite.body']}</p>
              <Button asChild>
                <Link to="/family">{copy['home.focus.invite.action']}</Link>
              </Button>
            </div>
          ) : null}
          {home.isSuccess && focus.length > 0 ? (
            <>
              <p className="text-caption text-muted-foreground">{copy['family.focus.note']}</p>
              <ul className="-mx-6 flex gap-3 overflow-x-auto px-6 pb-1 pt-0.5">
                {focus.map((card) => (
                  <li key={card.person.id} className="shrink-0">
                    <Link
                      to={`/family/people/${card.person.id}`}
                      className="flex w-[150px] flex-col overflow-hidden rounded-lg bg-card shadow-e1"
                    >
                      <FocusPhoto
                        name={card.person.name}
                        displayName={card.person.display_name}
                        src={card.photo_url ?? card.avatar_url}
                      />
                      <div className="flex flex-col gap-0.5 p-3">
                        <p className="truncate text-body font-medium text-primary">{card.person.display_name}</p>
                        <p className="truncate text-caption text-muted-foreground">
                          {interpolate(copy['person.memories.title'], { จำนวน: String(card.memory_count) })}
                        </p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </section>

        {showQuestion ? <QuickQuestionCard familyId={familyId} question={question} /> : null}

        <section className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <h2 className="min-w-0 flex-1 text-h3 font-semibold">{copy['memory.list.title']}</h2>
            <Button variant="link" size="sm" className="h-9 px-3 text-primary" asChild>
              <Link to="/memories">{copy['memory.create.action']}</Link>
            </Button>
          </div>
          {memoriesPending ? <RecentSkeleton /> : null}
          {memoriesFailed ? (
            <p className="text-body text-destructive">{messageForError(events.error ?? home.error)}</p>
          ) : null}
          {!memoriesPending && !memoriesFailed && recent.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <Illustration name="family-home" float={false} className="size-40" />
              <p className="text-h3 font-semibold">{copy['memory.empty.title']}</p>
              <p className="text-body text-muted-foreground">{copy['memory.empty.body']}</p>
              <Button asChild>
                <Link to="/memories">{copy['memory.create.action']}</Link>
              </Button>
            </div>
          ) : null}
          {!memoriesPending && !memoriesFailed && recent.length > 0 ? (
            <ul className="flex flex-col gap-3">
              {recent.map((event) => (
                <li key={event.id}>
                  <Link
                    to={`/memories/${event.id}`}
                    className="flex items-center gap-3 rounded-xl border border-border bg-card p-3"
                  >
                    <FadeCover src={event.cover_url} alt={event.title ?? ''} size={128} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-body font-medium">{event.title}</p>
                      <p className="truncate text-caption text-muted-foreground">
                        {event.occurred_from
                          ? formatThaiDate(event.occurred_from)
                          : formatThaiDate(event.created_at)}
                      </p>
                    </div>
                    <Icon as={CaretRightIcon} size={20} className="shrink-0 text-muted-foreground" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
        {family ? <p className="sr-only">{family.name}</p> : null}
      </div>
    </div>
  );
}

function HomeAppBar({
  families,
  familyId,
  onSelect,
  viewerName,
}: {
  families: FamilyResponse[];
  familyId: string | null;
  onSelect: (familyId: string) => void;
  viewerName: string;
}) {
  return (
    <header className="sticky top-0 z-40 flex h-14 items-center gap-1 bg-background pl-4 pr-1 pt-[env(safe-area-inset-top,0px)]">
      <FamilySwitcher families={families} selectedId={familyId} onSelect={onSelect} variant="header" />
      <div className="flex size-11 items-center justify-center">
        <span className="flex size-8 items-center justify-center rounded-full border-2 border-card bg-secondary text-caption font-semibold text-secondary-foreground">
          {nameInitial(viewerName)}
        </span>
      </div>
    </header>
  );
}

function FocusPhoto({
  name,
  displayName,
  src,
}: {
  name: string;
  displayName: string;
  src: string | null;
}) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const showImage = Boolean(src) && !failed;

  return (
    <div className="flex h-[100px] w-full items-center justify-center overflow-hidden bg-accent">
      {showImage ? (
        <img
          src={src!}
          alt={displayName}
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          className={`size-full object-cover transition-opacity duration-200 ease-standard motion-reduce:transition-none ${
            loaded ? 'opacity-100' : 'opacity-0'
          }`}
        />
      ) : (
        <span className="text-h1 font-semibold text-accent-foreground">{nameInitial(name)}</span>
      )}
    </div>
  );
}

function HomeLoading() {
  return (
    <div className="flex flex-col">
      <header className="flex h-14 items-center gap-3 bg-background px-4">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="ml-auto size-8 rounded-full" />
      </header>
      <div className="flex flex-col gap-6 px-6 py-5">
        <Skeleton className="h-8 w-[200px]" />
        <FocusSkeleton />
        <Skeleton className="h-[168px] w-full rounded-xl" />
        <RecentSkeleton />
      </div>
    </div>
  );
}

function FocusSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <Skeleton className="h-6 w-[180px]" />
      <div className="flex gap-3 overflow-hidden">
        <Skeleton className="size-[150px] rounded-lg" />
        <Skeleton className="size-[150px] rounded-lg" />
        <Skeleton className="size-[150px] rounded-lg" />
      </div>
    </div>
  );
}

function RecentSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <Skeleton className="h-6 w-40" />
      <Skeleton className="h-[88px] w-full rounded-xl" />
      <Skeleton className="h-[88px] w-full rounded-xl" />
      <Skeleton className="h-[88px] w-full rounded-xl" />
    </div>
  );
}

function QuickQuestionCard({
  familyId,
  question,
}: {
  familyId: string;
  question: { question_id: string; person: { id: string; name: string }; text: string };
}) {
  const queryClient = useQueryClient();
  const [answer, setAnswer] = useState('');
  const save = useMutation({
    mutationFn: () =>
      homeApi.answerFact(question.person.id, {
        question_id: question.question_id,
        answer_text: answer.trim(),
      }),
    onSuccess: async () => {
      setAnswer('');
      toast.success(copy['home.question.saved.toast']);
      await queryClient.invalidateQueries({ queryKey: queryKeys.home(familyId) });
    },
  });
  const skip = useMutation({
    mutationFn: () => homeApi.skipFact(question.person.id, question.question_id),
    onSuccess: async () => {
      toast(copy['home.question.skipped.toast']);
      await queryClient.invalidateQueries({ queryKey: queryKeys.home(familyId) });
    },
  });
  const edit = useMutation({
    mutationFn: (factId: string) => homeApi.updateFact(factId, answer.trim()),
    onSuccess: async () => {
      setAnswer('');
      toast.success(copy['home.question.saved.toast']);
      await queryClient.invalidateQueries({ queryKey: queryKeys.home(familyId) });
    },
  });
  const alreadyAnsweredFactId = factIdFromAlreadyAnswered(save.error);

  return (
    <section className="flex flex-col gap-3 rounded-2xl bg-accent p-5">
      <div className="flex items-center gap-2">
        <span className="flex size-8 items-center justify-center rounded-full border-2 border-card bg-secondary text-caption font-semibold text-secondary-foreground">
          {nameInitial(question.person.name)}
        </span>
        <p className="text-label font-medium text-accent-foreground">{copy['home.question.title']}</p>
      </div>
      <p className="text-h3 font-semibold text-accent-foreground">{question.text}</p>
      <div className="flex flex-col gap-2">
        <Label htmlFor="quick-answer" className="sr-only">
          {question.text}
        </Label>
        <Input
          id="quick-answer"
          value={answer}
          onChange={(event) => setAnswer(event.target.value)}
        />
      </div>
      {save.isError ? (
        <p className="text-caption text-destructive">{messageForError(save.error)}</p>
      ) : null}
      {edit.isError ? (
        <p className="text-caption text-destructive">{messageForError(edit.error)}</p>
      ) : null}
      {alreadyAnsweredFactId ? (
        <Button
          type="button"
          variant="secondary"
          disabled={edit.isPending || !answer.trim()}
          onClick={() => edit.mutate(alreadyAnsweredFactId)}
        >
          {copy['home.question.already_answered.action']}
        </Button>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={save.isPending || !answer.trim()} onClick={() => save.mutate()}>
          {copy['home.question.save']}
        </Button>
        <Button type="button" variant="ghost" disabled={skip.isPending} onClick={() => skip.mutate()}>
          {copy['home.question.skip']}
        </Button>
      </div>
    </section>
  );
}

function factIdFromAlreadyAnswered(error: unknown): string | null {
  if (!(error instanceof ApiClientError) || error.code !== ErrorCode.ALREADY_ANSWERED) {
    return null;
  }
  const factId = error.details?.fact_id;
  return typeof factId === 'string' && factId.length > 0 ? factId : null;
}
