import { useQuery } from '@tanstack/react-query';
import { QueryLoading } from '@/components/QueryLoading';
import { copy, interpolate, interpolateHeading } from '@/copy';
import { formatThaiDate } from '@/lib/dates';
import { messageForError } from '@/lib/api-errors';
import { homeApi } from '@/lib/home-api';
import { queryKeys } from '@/lib/query-client';

export function PersonFactsSection({ personId, name }: { personId: string; name: string }) {
  const facts = useQuery({
    queryKey: queryKeys.facts(personId),
    queryFn: () => homeApi.listFacts(personId),
  });
  const answers =
    facts.data?.groups.flatMap((group) =>
      group.answers.map((answer) => ({
        ...answer,
        questionText: group.question.text,
      }))
    ) ?? [];

  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-body font-semibold">
        {interpolateHeading(copy['person.facts.title'], { name })}
      </h3>
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
  );
}
