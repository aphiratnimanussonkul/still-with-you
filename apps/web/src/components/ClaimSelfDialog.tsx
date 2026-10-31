import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
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
import { copy, interpolate, interpolateHeading } from '@/copy';
import { familyGraph, personDisplayName, type FamilyPerson } from '@/lib/family-graph';
import { claimSelfErrorView, type ClaimSelfErrorView } from '@/lib/person-claim';
import { queryKeys } from '@/lib/query-client';

export function ClaimSelfDialog({
  person,
  familyId,
  open,
  onOpenChange,
}: {
  person: FamilyPerson;
  familyId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const name = personDisplayName(person);
  const [error, setError] = useState<ClaimSelfErrorView | null>(null);

  const claim = useMutation({
    mutationFn: () => familyGraph.claimPerson(person.id),
    onSuccess: async () => {
      setError(null);
      onOpenChange(false);
      toast(interpolate(copy['person.claim_self.done'], { ชื่อ: name }));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.person(person.id) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.people(familyId) }),
      ]);
    },
    onError: (failed) => {
      setError(claimSelfErrorView(failed, name));
    },
  });

  function close() {
    setError(null);
    onOpenChange(false);
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setError(null);
        }
        onOpenChange(next);
      }}
    >
      <AlertDialogContent className="rounded-xl">
        <AlertDialogHeader>
          <AlertDialogTitle>
            {interpolateHeading(copy['person.claim_self.confirm.title'], { ชื่อ: name })}
          </AlertDialogTitle>
          <AlertDialogDescription>{copy['person.claim_self.confirm.body']}</AlertDialogDescription>
        </AlertDialogHeader>
        {error ? <Alert>{error.message}</Alert> : null}
        <AlertDialogFooter className="flex flex-col gap-2 sm:flex-col">
          {error?.coded ? (
            <AlertDialogAction variant="outline" className="w-full" onClick={close}>
              {copy['person.error.ok']}
            </AlertDialogAction>
          ) : (
            <>
              <AlertDialogAction
                className="w-full"
                disabled={claim.isPending}
                onClick={(event) => {
                  event.preventDefault();
                  claim.mutate();
                }}
              >
                {error ? copy['common.retry'] : copy['person.claim_self.confirm.primary']}
              </AlertDialogAction>
              <AlertDialogCancel className="w-full" disabled={claim.isPending}>
                {copy['person.claim_self.confirm.secondary']}
              </AlertDialogCancel>
            </>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
