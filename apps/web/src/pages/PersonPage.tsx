import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { QueryLoading } from '@/components/QueryLoading';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { copy, interpolate, interpolateHeading } from '@/copy';
import { formatThaiDate } from '@/lib/dates';
import { useSelectedFamily } from '@/hooks/use-selected-family';
import { messageForError } from '@/lib/api-errors';
import { familyGraph, isPersonLiving, personDisplayName } from '@/lib/family-graph';
import { FOCUS_MAX, homeApi } from '@/lib/home-api';
import { formatNodeYears, livingDeathWriteFields } from '@/lib/person-years';
import { queryKeys } from '@/lib/query-client';

export function PersonPage() {
  const { personId } = useParams();
  const { familyId } = useSelectedFamily();
  const queryClient = useQueryClient();
  const people = useQuery({
    queryKey: queryKeys.people(familyId ?? ''),
    queryFn: () => familyGraph.listPeople(familyId!),
    enabled: Boolean(familyId),
  });
  const personQuery = useQuery({
    queryKey: queryKeys.person(personId ?? ''),
    queryFn: () => familyGraph.getPerson(personId!),
    enabled: Boolean(personId),
  });
  const focus = useQuery({
    queryKey: queryKeys.focus(familyId ?? ''),
    queryFn: () => homeApi.getFocus(familyId!),
    enabled: Boolean(familyId),
  });
  const facts = useQuery({
    queryKey: queryKeys.facts(personId ?? ''),
    queryFn: () => homeApi.listFacts(personId!),
    enabled: Boolean(personId),
  });
  const [livingDraft, setLivingDraft] = useState<boolean | null>(null);
  const toggleFocus = useMutation({
    mutationFn: (personIds: string[]) => homeApi.putFocus(familyId!, personIds),
    onSuccess: async () => {
      if (!familyId) return;
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.focus(familyId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.home(familyId) }),
      ]);
    },
  });
  const saveLiving = useMutation({
    mutationFn: (living: boolean) =>
      familyGraph.updatePerson(
        personId!,
        livingDeathWriteFields({ living, yearOnly: false, dayValue: '', yearBe: '' })
      ),
    onSuccess: async () => {
      setLivingDraft(null);
      if (!personId) return;
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.person(personId) }),
        familyId
          ? queryClient.invalidateQueries({ queryKey: queryKeys.people(familyId) })
          : Promise.resolve(),
      ]);
    },
  });

  if (people.isPending || personQuery.isPending) return <QueryLoading />;
  const person = personQuery.data ?? people.data?.people.find((row) => row.id === personId);
  if (personQuery.isError && !person) {
    return <p className="text-body text-destructive">{messageForError(personQuery.error)}</p>;
  }
  if (!person) {
    return <p className="text-body text-destructive">{copy['error.NOT_FOUND']}</p>;
  }

  const name = personDisplayName(person);
  const years = formatNodeYears(person);
  const living = livingDraft ?? isPersonLiving(person);
  const livingDirty = living !== isPersonLiving(person);
  const focusedIds = focus.data?.items.map((item) => item.person.id) ?? [];
  const focused = focusedIds.includes(person.id);
  const focusUnavailable = focus.isError || focus.isPending;
  const answers =
    facts.data?.groups.flatMap((group) =>
      group.answers.map((answer) => ({
        ...answer,
        questionText: group.question.text,
      }))
    ) ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-center gap-2 text-center">
        {person.avatar_url ? (
          <img src={person.avatar_url} alt="" className="size-24 rounded-full object-cover" />
        ) : (
          <div className="flex size-24 items-center justify-center rounded-full bg-secondary text-h1 font-semibold text-secondary-foreground">
            {name.slice(0, 1)}
          </div>
        )}
        <h2 className="text-h2 font-semibold">{name}</h2>
        {years ? <p className="text-body text-muted-foreground">{years}</p> : null}
        {!isPersonLiving(person) && person.age != null ? (
          <p className="text-body text-muted-foreground">
            {interpolate(copy['person.death.age'], { อายุ: String(person.age) })}
          </p>
        ) : null}
      </div>

      {familyId ? (
        <div className="flex min-h-11 items-start gap-3">
          <Checkbox
            id={`focus-${person.id}`}
            checked={focused}
            disabled={
              focusUnavailable || toggleFocus.isPending || (!focused && focusedIds.length >= FOCUS_MAX)
            }
            onCheckedChange={(value) => {
              if (focusUnavailable) return;
              const next = focusedIds.filter((id) => id !== person.id);
              if (value === true) {
                if (next.length >= FOCUS_MAX) return;
                next.push(person.id);
              }
              toggleFocus.mutate(next);
            }}
          />
          <div className="flex flex-col gap-1">
            <Label htmlFor={`focus-${person.id}`} className="text-body font-normal">
              {copy['family.focus.toggle']}
            </Label>
            <p className="text-caption text-muted-foreground">{copy['family.focus.note']}</p>
            {focus.isError ? (
              <>
                <p className="text-caption text-destructive">{copy['family.focus.load_error']}</p>
                <Button type="button" variant="ghost" size="sm" onClick={() => void focus.refetch()}>
                  {copy['family.focus.load_error.action']}
                </Button>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
      {toggleFocus.isError ? (
        <p className="text-body text-destructive">{messageForError(toggleFocus.error)}</p>
      ) : null}

      <div className="flex flex-col gap-3">
        <div className="flex min-h-11 items-center gap-3">
          <Checkbox
            id="person-living"
            checked={living}
            disabled={saveLiving.isPending}
            onCheckedChange={(value) => setLivingDraft(value === true)}
          />
          <Label htmlFor="person-living" className="text-body font-normal">
            {copy['person.living']}
          </Label>
        </div>
        {livingDirty ? (
          <Button
            type="button"
            disabled={saveLiving.isPending}
            onClick={() => saveLiving.mutate(living)}
          >
            {copy['person.save']}
          </Button>
        ) : null}
        {saveLiving.isError ? (
          <p className="text-caption text-destructive">{messageForError(saveLiving.error)}</p>
        ) : null}
      </div>

      <section className="flex flex-col gap-2">
        <h3 className="text-body font-semibold">{interpolateHeading(copy['person.facts.title'], { name })}</h3>
        {facts.isPending ? <QueryLoading /> : null}
        {facts.isError ? (
          <p className="text-caption text-destructive">{messageForError(facts.error)}</p>
        ) : null}
        {facts.isSuccess && answers.length === 0 ? (
          <>
            <p className="text-body text-muted-foreground">
              {interpolateHeading(copy['person.facts.empty.title'], { name })}
            </p>
            <p className="text-caption text-muted-foreground">{copy['person.facts.empty.body']}</p>
          </>
        ) : null}
        {facts.isSuccess && answers.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {answers.map((answer) => (
              <li key={answer.id} className="flex flex-col gap-1">
                <p className="text-caption text-muted-foreground">{answer.questionText}</p>
                <p className="text-body">{answer.answer_text}</p>
                {answer.author && answer.created_at ? (
                  <p className="text-caption text-muted-foreground">
                    {interpolate(copy['person.facts.answer.meta'], {
                      ผู้ตอบ: answer.author.display_name,
                      วันที่: formatThaiDate(answer.created_at),
                    })}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </div>
  );
}
