import { Link } from 'react-router-dom';
import { copy } from '@/copy';
import { personDisplayName, type FamilyPerson } from '@/lib/family-graph';
import { formatNodeYears } from '@/lib/person-years';

export function PersonListRow({
  person,
  generation,
}: {
  person: FamilyPerson;
  generation: number | null;
}) {
  return (
    <Link
      to={`/family/people/${person.id}`}
      className="flex min-h-11 items-center justify-between gap-3 rounded-xl bg-card px-4 py-3"
    >
      <span className="text-body font-medium">{personDisplayName(person)}</span>
      <span className="text-caption text-muted-foreground">
        {formatNodeYears(person) ?? (generation == null ? copy['tree.unrelated.title'] : '')}
      </span>
    </Link>
  );
}
