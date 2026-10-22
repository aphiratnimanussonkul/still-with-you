import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FamilySwitcher } from '@/components/FamilySwitcher';
import { Illustration } from '@/components/Illustration';
import { QueryLoading } from '@/components/QueryLoading';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { illustrationSrc } from '@/components/illustrations';
import { copy, interpolate } from '@/copy';
import { useMe } from '@/hooks/use-me';
import { useSelectedFamily } from '@/hooks/use-selected-family';
import { messageForError } from '@/lib/api-errors';
import { formatThaiDate } from '@/lib/dates';
import { homeApi } from '@/lib/home-api';
import { queryKeys } from '@/lib/query-client';

export function HomePage() {
  const me = useMe();
  const { familiesQuery, families, familyId, family, select } = useSelectedFamily();
  const home = useQuery({
    queryKey: queryKeys.home(familyId ?? ''),
    queryFn: () => homeApi.getHome(familyId!),
    enabled: Boolean(familyId),
  });

  if (familiesQuery.isPending) return <QueryLoading />;
  if (familiesQuery.isError) {
    return <p className="text-body text-destructive">{messageForError(familiesQuery.error)}</p>;
  }

  if (families.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <Illustration name="family-home" />
        <p className="text-h3 font-semibold">{copy['family.empty.title']}</p>
        <p className="text-body text-muted-foreground">{copy['family.empty.body']}</p>
        <Button asChild>
          <Link to="/family">{copy['family.create.action']}</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <p className="text-h3 font-semibold">
          {interpolate(copy['welcome.title'], {
            ชื่อ: me.data?.display_name || me.data?.email || '',
          })}
        </p>
        <FamilySwitcher families={families} selectedId={familyId} onSelect={select} />
      </section>
      {home.isPending ? <QueryLoading /> : null}
      {home.isError ? <p className="text-body text-destructive">{messageForError(home.error)}</p> : null}
      {home.data ? (
        <>
          <section className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-h3 font-semibold">{copy['home.focus.title']}</h2>
              <Button variant="ghost" size="sm" asChild>
                <Link to="/family">{copy['home.focus.see_all']}</Link>
              </Button>
            </div>
            {home.data.focus.length === 0 ? null : (
              <ul className="grid grid-cols-2 gap-3">
                {home.data.focus.map((card) => (
                  <li key={card.person.id}>
                    <Card>
                      <CardHeader>
                        <img
                          src={card.photo_url ?? illustrationSrc['person-placeholder']}
                          alt={card.person.name}
                          className="mb-2 aspect-square w-full rounded-[10px] object-cover"
                        />
                        <CardTitle className="truncate">{card.person.name}</CardTitle>
                        <CardDescription>
                          {interpolate(copy['person.memories.title'], { จำนวน: String(card.memory_count) })}
                        </CardDescription>
                      </CardHeader>
                    </Card>
                  </li>
                ))}
              </ul>
            )}
          </section>
          {home.data.quick_question && familyId ? (
            <QuickQuestionCard familyId={familyId} question={home.data.quick_question} />
          ) : null}
          <section className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-h3 font-semibold">{copy['memory.list.title']}</h2>
              <Button asChild>
                <Link to="/memories">{copy['memory.create.action']}</Link>
              </Button>
            </div>
            {home.data.recent_memories.length === 0 ? (
              <p className="text-body text-muted-foreground">{copy['memory.empty.body']}</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {home.data.recent_memories.slice(0, 5).map((event) => (
                  <li key={event.id}>
                    <Link to={`/memories/${event.id}`} className="block">
                      <Card>
                        <CardHeader>
                          <CardTitle className="truncate">{event.title}</CardTitle>
                          <CardDescription>
                            {event.occurred_from
                              ? formatThaiDate(event.occurred_from)
                              : formatThaiDate(event.created_at)}
                          </CardDescription>
                        </CardHeader>
                      </Card>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      ) : null}
      {family ? <p className="sr-only">{family.name}</p> : null}
    </div>
  );
}

function QuickQuestionCard({
  familyId,
  question,
}: {
  familyId: string;
  question: { question_id: string; person_id: string; text: string };
}) {
  const queryClient = useQueryClient();
  const [answer, setAnswer] = useState('');
  const save = useMutation({
    mutationFn: () =>
      homeApi.answerFact(question.person_id, {
        question_id: question.question_id,
        answer_text: answer.trim(),
      }),
    onSuccess: async () => {
      setAnswer('');
      await queryClient.invalidateQueries({ queryKey: queryKeys.home(familyId) });
    },
  });
  const skip = useMutation({
    mutationFn: () => homeApi.skipFact(question.person_id, question.question_id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.home(familyId) });
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{copy['home.question.title']}</CardTitle>
        <CardDescription>{question.text}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-col gap-2">
          {/* TODO: answer-field label — not in v0.4 or the PO note; do not invent Thai */}
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
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            disabled={save.isPending || !answer.trim()}
            onClick={() => save.mutate()}
          >
            {copy['home.question.save']}
          </Button>
          <Button type="button" variant="ghost" disabled={skip.isPending} onClick={() => skip.mutate()}>
            {copy['home.question.skip']}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
