import { useState } from 'react';
import { DotsThreeIcon } from '@phosphor-icons/react/DotsThree';
import { InfoIcon } from '@phosphor-icons/react/Info';
import { PencilSimpleIcon } from '@phosphor-icons/react/PencilSimple';
import { XIcon } from '@phosphor-icons/react/X';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
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
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { copy, interpolate, interpolateHeading } from '@/copy';
import { ApiClientError, messageForError } from '@/lib/api-errors';
import { familyGraph, personDisplayName, type FamilyPerson } from '@/lib/family-graph';
import { isLinkedPerson } from '@/lib/person-edit';
import { apiPersonAge, personAgeCopyKey } from '@/lib/person-age';
import { queryKeys } from '@/lib/query-client';

export function PersonProfileMenu({
  person,
  familyId,
}: {
  person: FamilyPerson;
  familyId: string;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [linkedBlocked, setLinkedBlocked] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const name = personDisplayName(person);
  const linked = isLinkedPerson(person);
  const age = apiPersonAge(person);
  const ageKey = personAgeCopyKey(person);
  const ageLine =
    age != null && ageKey ? interpolate(copy[ageKey], { n: String(age) }) : null;
  const meta = [person.relation_label, ageLine].filter(Boolean).join(' · ');

  const remove = useMutation({
    mutationFn: () => familyGraph.deletePerson(person.id),
    onSuccess: async () => {
      setConfirmDelete(false);
      setOpen(false);
      await queryClient.invalidateQueries({ queryKey: queryKeys.people(familyId) });
      navigate('/family');
    },
    onError: (error) => {
      if (error instanceof ApiClientError && error.code === 'PERSON_LINKED') {
        setConfirmDelete(false);
        setOpen(false);
        setLinkedBlocked(true);
        return;
      }
      setDeleteError(messageForError(error, { name }));
    },
  });

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={copy['a11y.more']}
        onClick={() => {
          setDeleteError(null);
          setOpen(true);
        }}
      >
        <Icon as={DotsThreeIcon} size={24} />
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" showCloseButton={false} className="rounded-t-3xl px-6 pb-6 pt-4">
          <div className="mx-auto mb-2 h-1 w-8 rounded-sm bg-border" />
          <SheetHeader className="p-0">
            <SheetTitle className="text-body font-medium">{name}</SheetTitle>
            {meta ? <SheetDescription>{meta}</SheetDescription> : null}
          </SheetHeader>
          <button
            type="button"
            className="flex min-h-12 w-full items-center gap-3 py-3 text-left text-body"
            onClick={() => {
              setOpen(false);
              navigate(`/family/people/${person.id}/edit`);
            }}
          >
            <Icon as={PencilSimpleIcon} size={20} />
            {copy['person.menu.edit']}
          </button>
          <div className="h-px bg-border" />
          {linked ? (
            <p className="flex items-start gap-3 py-3 text-body">
              <Icon as={InfoIcon} size={20} className="mt-0.5 shrink-0" />
              <span>{interpolateHeading(copy['person.delete.linked'], { ชื่อ: name })}</span>
            </p>
          ) : (
            <button
              type="button"
              className="flex min-h-12 w-full items-center gap-3 py-3 text-left text-body text-destructive"
              onClick={() => setConfirmDelete(true)}
            >
              <Icon as={XIcon} size={20} />
              {copy['person.delete.action']}
            </button>
          )}
          {deleteError ? <p className="text-caption text-destructive">{deleteError}</p> : null}
        </SheetContent>
      </Sheet>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent className="rounded-xl">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {interpolateHeading(copy['person.delete.confirm.title'], { name })}
            </AlertDialogTitle>
            <AlertDialogDescription className="flex flex-col gap-2">
              <span>{interpolateHeading(copy['person.delete.confirm.body'], { name })}</span>
              <span>{interpolateHeading(copy['person.delete.confirm.memories'], { ชื่อ: name })}</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex flex-col gap-2 sm:flex-col">
            <AlertDialogAction
              variant="destructive"
              className="w-full"
              disabled={remove.isPending}
              onClick={(event) => {
                event.preventDefault();
                remove.mutate();
              }}
            >
              {copy['person.delete.confirm.primary']}
            </AlertDialogAction>
            <AlertDialogCancel className="w-full">{copy['person.delete.confirm.secondary']}</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={linkedBlocked} onOpenChange={setLinkedBlocked}>
        <AlertDialogContent className="rounded-xl">
          <AlertDialogHeader>
            <AlertDialogTitle>{copy['person.delete.linked.title']}</AlertDialogTitle>
            <AlertDialogDescription>
              {interpolateHeading(copy['person.delete.linked'], { ชื่อ: name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex flex-col gap-2 sm:flex-col">
            <AlertDialogAction variant="outline" className="w-full">
              {copy['person.error.ok']}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
