import { useState } from 'react';
import { DotsThreeIcon } from '@phosphor-icons/react/DotsThree';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { PersonFactsSection } from '@/components/PersonFactsSection';
import { QueryLoading } from '@/components/QueryLoading';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Icon } from '@/components/ui/icon';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { copy, interpolate, interpolateHeading } from '@/copy';
import { useMe } from '@/hooks/use-me';
import { useSelectedFamily } from '@/hooks/use-selected-family';
import { messageForError } from '@/lib/api-errors';
import { familyGraph, personDisplayName, type FamilyPerson, type PersonInvite } from '@/lib/family-graph';
import { apiPersonAge } from '@/lib/person-age';
import { canEditPerson, isFamilySteward } from '@/lib/person-permissions';
import { relationshipUiType } from '@/lib/person-relationship';
import { queryKeys } from '@/lib/query-client';

function inviteStatus(person: FamilyPerson) {
  if (person.invite_status) return person.invite_status;
  if (person.account_id) return 'linked' as const;
  return 'none' as const;
}

export function PersonPage() {
  const { personId = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const me = useMe();
  const { familyId } = useSelectedFamily();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [createdInvite, setCreatedInvite] = useState<PersonInvite | null>(null);

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
  const memories = useQuery({
    queryKey: queryKeys.personEvents(personId),
    queryFn: () => familyGraph.listPersonEvents(personId),
    enabled: Boolean(personId),
  });

  const person = people.data?.people.find((row) => row.id === personId);
  const name = person ? personDisplayName(person) : '';
  const canEdit = person ? canEditPerson(person, me.data?.id, members.data?.members) : false;
  const steward = isFamilySteward(members.data?.members, me.data?.id);
  const age = person ? apiPersonAge(person) : null;
  const status = person ? inviteStatus(person) : 'none';
  const relationships =
    people.data?.relationships.filter(
      (row) => row.person_id === personId || row.related_person_id === personId
    ) ?? [];

  const invite = useMutation({
    mutationFn: () => familyGraph.createPersonInvite(personId),
    onSuccess: async (created) => {
      setCreatedInvite(created);
      setInviteOpen(true);
      await queryClient.invalidateQueries({ queryKey: queryKeys.people(familyId!) });
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

  async function copyInviteLink(url: string) {
    await navigator.clipboard.writeText(url);
    toast.success(copy['invite.copied.toast']);
  }

  async function shareInviteLink(url: string) {
    if (typeof navigator.share === 'function') {
      await navigator.share({ url });
      return;
    }
    await copyInviteLink(url);
  }

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

  const statusLabel =
    status === 'linked'
      ? copy['person.status.linked']
      : status === 'pending'
        ? copy['person.status.pending']
        : copy['person.status.uninvited'];
  const ageLabel =
    age === null
      ? null
      : interpolate(person.birth_date_precision === 'year' ? copy['person.age.approx'] : copy['person.age'], {
          age: String(age),
        });
  const featured = memories.data?.events ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start gap-3">
        <Avatar className="size-24">
          {person.avatar_url ? <AvatarImage src={person.avatar_url} alt={name} /> : null}
          <AvatarFallback>{name.slice(0, 1)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <h2 className="min-w-0 flex-1 text-h2 font-semibold break-words">{name}</h2>
            {canEdit ? (
              <DropdownMenu modal={false} open={menuOpen} onOpenChange={setMenuOpen}>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={copy['a11y.more']}
                    onClick={() => setMenuOpen(true)}
                  >
                    <Icon as={DotsThreeIcon} size={24} />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuGroup>
                    <DropdownMenuItem asChild>
                      <Link to={`/family/people/${person.id}/edit`}>{copy['person.edit.action']}</Link>
                    </DropdownMenuItem>
                    {status !== 'linked' ? (
                      <DropdownMenuItem
                        onSelect={() => {
                          setMenuOpen(false);
                          setConfirmDelete(true);
                        }}
                      >
                        {copy['person.delete.action']}
                      </DropdownMenuItem>
                    ) : null}
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </div>
          {person.family_name ? (
            <p className="text-body text-muted-foreground">{person.family_name}</p>
          ) : null}
          {ageLabel ? <p className="text-body">{ageLabel}</p> : null}
          <Badge variant={status === 'linked' ? 'default' : 'secondary'}>{statusLabel}</Badge>
        </div>
      </div>

      {relationships.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {relationships.map((row) => {
            const otherId = row.person_id === person.id ? row.related_person_id : row.person_id;
            const other = people.data?.people.find((item) => item.id === otherId);
            if (!other) return null;
            const uiType = relationshipUiType(row, person.id);
            const typeLabel =
              uiType === 'parent'
                ? copy['person.relationship.parent']
                : uiType === 'spouse'
                  ? copy['person.relationship.spouse']
                  : copy['relation.type.child'];
            return (
              <li key={row.id} className="text-body">
                {typeLabel} · {personDisplayName(other)}
              </li>
            );
          })}
        </ul>
      ) : null}

      {status === 'linked' ? (
        <p className="text-caption text-muted-foreground">
          {interpolate(copy['person.delete.linked'], { name })}
        </p>
      ) : null}

      {person.bio ? <p className="text-body whitespace-pre-wrap">{person.bio}</p> : null}

      {steward && status !== 'linked' ? (
        <div className="flex flex-col gap-2">
          <Button type="button" onClick={() => invite.mutate()} disabled={invite.isPending}>
            {interpolate(copy['person.invite.action'], { name })}
          </Button>
          {invite.isError ? (
            <p className="text-caption text-destructive">{messageForError(invite.error, { name })}</p>
          ) : null}
        </div>
      ) : null}

      <PersonFactsSection personId={person.id} name={name} />

      <section className="flex flex-col gap-3">
        <h3 className="text-h3 font-semibold">
          {interpolate(copy['person.memories.title'], { จำนวน: String(featured.length) })}
        </h3>
        {memories.isPending ? <QueryLoading /> : null}
        {featured.map((event) => (
          <Link key={event.id} to={`/memories/${event.id}`} className="text-body underline-offset-4 hover:underline">
            {event.title}
          </Link>
        ))}
      </section>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {interpolateHeading(copy['person.delete.confirm.title'], { name })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {interpolate(copy['person.delete.confirm.body'], { name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {remove.isError ? (
            <p className="text-caption text-destructive">{messageForError(remove.error, { name })}</p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel>{copy['common.cancel']}</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={remove.isPending}
              onClick={() => remove.mutate()}
            >
              {copy['person.delete.confirm.primary']}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Sheet open={inviteOpen} onOpenChange={setInviteOpen}>
        <SheetContent side="bottom">
          <SheetHeader>
            <SheetTitle>{interpolate(copy['person.invite.action'], { name })}</SheetTitle>
            <SheetDescription>{copy['invite.body']}</SheetDescription>
          </SheetHeader>
          {createdInvite?.url ? (
            <p className="break-all px-4 text-caption text-muted-foreground">{createdInvite.url}</p>
          ) : null}
          <SheetFooter>
            <Button
              type="button"
              onClick={() => createdInvite?.url && void copyInviteLink(createdInvite.url)}
            >
              {copy['invite.copy_link']}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => createdInvite?.url && void shareInviteLink(createdInvite.url)}
            >
              {copy['person.invite.share']}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setInviteOpen(false)}>
              {copy['common.cancel']}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
