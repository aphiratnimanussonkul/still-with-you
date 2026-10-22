import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { PersonFactsSection } from '@/components/PersonFactsSection';
import { QueryLoading } from '@/components/QueryLoading';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { copy, interpolate, interpolateHeading } from '@/copy';
import { useMe } from '@/hooks/use-me';
import { useSelectedFamily } from '@/hooks/use-selected-family';
import { messageForError } from '@/lib/api-errors';
import { familyGraph, personDisplayName } from '@/lib/family-graph';
import { ageYearsFromBirthDate } from '@/lib/person-age';
import { canEditPerson, isFamilySteward } from '@/lib/person-permissions';
import { queryKeys } from '@/lib/query-client';

export function PersonPage() {
  const { personId = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const me = useMe();
  const { familyId } = useSelectedFamily();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const people = useQuery({
    queryKey: queryKeys.people(familyId ?? ''),
    queryFn: () => familyGraph.listPeople(familyId!),
    enabled: Boolean(familyId),
  });
  const members = useQuery({
    queryKey: queryKeys.members(familyId ?? ''),
    queryFn: () => familyGraph.listMembers(familyId!),
    enabled: Boolean(familyId),
  });

  const person = people.data?.people.find((row) => row.id === personId);
  const name = person ? personDisplayName(person) : '';
  const canEdit = person ? canEditPerson(person, me.data?.id, members.data?.members) : false;
  const steward = isFamilySteward(members.data?.members, me.data?.id);
  const age = person?.birth_date ? ageYearsFromBirthDate(person.birth_date) : null;
  const relationships =
    people.data?.relationships.filter(
      (row) => row.person_id === personId || row.related_person_id === personId
    ) ?? [];

  const invite = useMutation({
    mutationFn: () => familyGraph.createInvite(familyId!, { person_id: personId }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.invites(familyId!) });
    },
  });

  const remove = useMutation({
    mutationFn: () => familyGraph.deletePerson(personId),
    onSuccess: async () => {
      setConfirmDelete(false);
      await queryClient.invalidateQueries({ queryKey: queryKeys.people(familyId!) });
      navigate('/family');
    },
  });

  if (!familyId) {
    return <p className="text-body text-muted-foreground">{copy['family.empty.body']}</p>;
  }
  if (people.isPending || members.isPending) return <QueryLoading />;
  if (people.isError) {
    return <p className="text-body text-destructive">{messageForError(people.error)}</p>;
  }
  if (!person) {
    return <p className="text-body text-destructive">{copy['error.NOT_FOUND']}</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        {person.avatar_url ? (
          <img src={person.avatar_url} alt={name} className="size-24 rounded-full object-cover" />
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-h2 font-semibold break-words">{name}</h2>
          {!person.account_id ? <Badge variant="secondary">{copy['person.unjoined']}</Badge> : null}
        </div>
        {person.family_name ? (
          <p className="text-body text-muted-foreground">{person.family_name}</p>
        ) : null}
        {age !== null ? (
          <p className="text-body">{interpolate(copy['person.age'], { age: String(age) })}</p>
        ) : null}
        {person.bio ? <p className="text-body whitespace-pre-wrap">{person.bio}</p> : null}
      </div>

      {relationships.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {relationships.map((row) => {
            const otherId = row.person_id === person.id ? row.related_person_id : row.person_id;
            const other = people.data?.people.find((item) => item.id === otherId);
            if (!other) return null;
            const typeLabel =
              row.type === 'parent'
                ? copy['person.relationship.parent']
                : copy['person.relationship.spouse'];
            return (
              <li key={row.id} className="text-body">
                {typeLabel} · {personDisplayName(other)}
              </li>
            );
          })}
        </ul>
      ) : null}

      {steward && !person.account_id ? (
        <div className="flex flex-col gap-2">
          <Button type="button" onClick={() => invite.mutate()} disabled={invite.isPending}>
            {interpolate(copy['person.invite.action'], { name })}
          </Button>
          {invite.isError ? (
            <p className="text-caption text-destructive">{messageForError(invite.error)}</p>
          ) : null}
        </div>
      ) : null}

      {canEdit ? (
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button asChild variant="secondary">
            <Link to={`/family/people/${person.id}/edit`}>{copy['person.edit.action']}</Link>
          </Button>
          <Button type="button" variant="destructive" onClick={() => setConfirmDelete(true)}>
            {copy['person.delete.action']}
          </Button>
        </div>
      ) : null}

      {remove.isError && !confirmDelete ? (
        <p className="text-caption text-destructive">{messageForError(remove.error)}</p>
      ) : null}

      <PersonFactsSection personId={person.id} name={name} />

      {confirmDelete ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="person-delete-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4"
        >
          <div className="w-full max-w-sm rounded-xl bg-card p-6 shadow-e3">
            <h2 id="person-delete-title" className="text-h2 font-semibold">
              {interpolateHeading(copy['person.delete.confirm.title'], { name })}
            </h2>
            <p className="mt-3 text-body text-muted-foreground">
              {interpolate(copy['person.delete.confirm.body'], { name })}
            </p>
            {remove.isError ? (
              <p className="mt-3 text-caption text-destructive">{messageForError(remove.error)}</p>
            ) : null}
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setConfirmDelete(false);
                }}
              >
                {copy['common.cancel']}
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={remove.isPending}
                onClick={() => remove.mutate()}
              >
                {copy['person.delete.confirm.primary']}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
