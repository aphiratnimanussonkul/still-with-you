import { useCallback, useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useBeforeUnload, useBlocker, useNavigate, useParams } from 'react-router-dom';
import { useAppBarOverride } from '@/components/app-bar-override';
import { PersonPhotoField } from '@/components/PersonPhotoField';
import { QueryLoading } from '@/components/QueryLoading';
import { Alert } from '@/components/ui/alert';
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
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { copy, interpolate, interpolateHeading } from '@/copy';
import { useMe } from '@/hooks/use-me';
import { useSelectedFamily } from '@/hooks/use-selected-family';
import { ApiClientError, fieldForError, messageForError } from '@/lib/api-errors';
import { familyGraph, personDisplayName, type FamilyPerson } from '@/lib/family-graph';
import { personEditIsDirty, personEditPatch } from '@/lib/person-edit';
import { isFamilySteward } from '@/lib/person-permissions';
import { queryKeys } from '@/lib/query-client';

const BIO_MAX = 2000;

export function PersonFormPage() {
  const { personId = '' } = useParams();
  const { familyId } = useSelectedFamily();
  const me = useMe();
  const person = useQuery({
    queryKey: queryKeys.person(personId),
    queryFn: () => familyGraph.getPerson(personId),
    enabled: Boolean(personId),
  });
  const members = useQuery({
    queryKey: queryKeys.members(familyId ?? ''),
    queryFn: () => familyGraph.listMembers(familyId!),
    enabled: Boolean(familyId),
  });

  if (!familyId) {
    return <p className="text-body text-muted-foreground">{copy['family.empty.body']}</p>;
  }
  if (person.isPending || members.isPending || me.isPending) return <QueryLoading />;
  if (person.isError) {
    const status = person.error instanceof ApiClientError ? person.error.status : 0;
    if (status === 403) return <EditPersonForbidden personId={personId} />;
    return <p className="text-body text-destructive">{messageForError(person.error)}</p>;
  }
  if (!person.data) {
    return <p className="text-body text-destructive">{copy['error.NOT_FOUND']}</p>;
  }

  return (
    <EditPersonForm
      familyId={familyId}
      person={person.data}
      initiallyForbidden={!isFamilySteward(members.data?.members, me.data?.id)}
    />
  );
}

function EditPersonForbidden({ personId }: { personId: string }) {
  const navigate = useNavigate();
  return <EditPersonForbiddenDialog open onDismiss={() => navigate(`/family/people/${personId}`)} />;
}

function EditPersonForbiddenDialog({ open, onDismiss }: { open: boolean; onDismiss: () => void }) {
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onDismiss();
      }}
    >
      <AlertDialogContent className="rounded-xl">
        <AlertDialogHeader>
          <AlertDialogTitle>{copy['person.edit.forbidden.title']}</AlertDialogTitle>
          <AlertDialogDescription>{copy['person.edit.forbidden']}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex flex-col gap-2 sm:flex-col">
          <AlertDialogAction className="w-full" onClick={onDismiss}>
            {copy['person.error.ok']}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function EditPersonForm({
  familyId,
  person,
  initiallyForbidden = false,
}: {
  familyId: string;
  person: FamilyPerson;
  initiallyForbidden?: boolean;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const name = personDisplayName(person);
  useAppBarOverride({ title: interpolateHeading(copy['person.edit.title'], { name }) });

  const [displayName, setDisplayName] = useState(personDisplayName(person));
  const [nickname, setNickname] = useState(person.relation_label ?? '');
  const [living, setLiving] = useState(person.is_living !== false);
  const [bio, setBio] = useState(person.bio ?? '');
  const [photoId, setPhotoId] = useState<string | null>(null);
  const [photoRemoved, setPhotoRemoved] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [existingUrl, setExistingUrl] = useState(person.avatar_url);
  const [fieldErrors, setFieldErrors] = useState<{ display_name?: string; avatar_media_id?: string }>({});
  const [saveFailed, setSaveFailed] = useState(false);
  const [mediaNotReady, setMediaNotReady] = useState(false);
  const [allowLeave, setAllowLeave] = useState(initiallyForbidden);
  const [forbidden, setForbidden] = useState(initiallyForbidden);

  const draft = useMemo(
    () => ({ displayName, nickname, living, bio, photoId, photoRemoved }),
    [displayName, nickname, living, bio, photoId, photoRemoved]
  );
  const dirty = personEditIsDirty(person, draft) || photoBusy;

  useBeforeUnload(
    useCallback(
      (event: BeforeUnloadEvent) => {
        if (dirty && !allowLeave) {
          event.preventDefault();
          event.returnValue = '';
        }
      },
      [dirty, allowLeave]
    )
  );
  const blocker = useBlocker(dirty && !allowLeave);

  const save = useMutation({
    mutationFn: () => {
      if (!displayName.trim()) {
        throw Object.assign(new Error(copy['person.name.required']), {
          field: 'display_name',
          clientField: true,
        });
      }
      return familyGraph.updatePerson(person.id, personEditPatch(person, draft));
    },
    onSuccess: async () => {
      setAllowLeave(true);
      setSaveFailed(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.person(person.id) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.people(familyId) }),
      ]);
      navigate(`/family/people/${person.id}`);
    },
    onError: (error) => {
      if (error && typeof error === 'object' && 'clientField' in error) {
        setFieldErrors({ display_name: copy['person.name.required'] });
        setSaveFailed(false);
        return;
      }
      const field = fieldForError(error);
      if (field === 'display_name') {
        setFieldErrors({ display_name: messageForError(error) });
        setSaveFailed(false);
        return;
      }
      if (error instanceof ApiClientError && error.code === 'MEDIA_NOT_READY') {
        setFieldErrors({});
        setMediaNotReady(true);
        setSaveFailed(false);
        return;
      }
      if (error instanceof ApiClientError && error.status === 403) {
        setAllowLeave(true);
        setForbidden(true);
        setSaveFailed(false);
        void queryClient.invalidateQueries({ queryKey: queryKeys.members(familyId) });
        return;
      }
      setFieldErrors({});
      setSaveFailed(true);
    },
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (photoBusy || !dirty || forbidden) return;
    setFieldErrors({});
    setSaveFailed(false);
    setMediaNotReady(false);
    save.mutate();
  }

  const footerLabel = saveFailed ? copy['common.retry'] : copy['person.save'];
  const goToProfile = () => navigate(`/family/people/${person.id}`);

  return (
    <>
      <form className="flex min-h-0 flex-1 flex-col" onSubmit={onSubmit}>
        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto">
          {saveFailed ? <Alert>{copy['person.edit.save_failed']}</Alert> : null}
          {mediaNotReady ? <Alert>{copy['person.edit.media_not_ready']}</Alert> : null}

          <PersonPhotoField
            familyId={familyId}
            layout="edit"
            existingUrl={photoRemoved ? null : existingUrl}
            fieldError={fieldErrors.avatar_media_id}
            onReady={(mediaId, busy) => {
              setPhotoBusy(busy);
              if (mediaId) {
                setPhotoId(mediaId);
                setPhotoRemoved(false);
                setExistingUrl(null);
              }
            }}
            onRemove={() => {
              setPhotoId(null);
              setPhotoRemoved(true);
              setExistingUrl(null);
            }}
          />

          <div className="flex flex-col gap-2">
            <Label htmlFor="person-name">{copy['person.name.label']}</Label>
            <Input
              id="person-name"
              value={displayName}
              aria-invalid={Boolean(fieldErrors.display_name)}
              onChange={(event) => setDisplayName(event.target.value)}
            />
            {fieldErrors.display_name ? (
              <p className="text-caption text-destructive">{fieldErrors.display_name}</p>
            ) : null}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="person-nickname">{copy['person.nickname.label']}</Label>
            <Input
              id="person-nickname"
              value={nickname}
              placeholder={copy['person.relation_label.placeholder']}
              onChange={(event) => setNickname(event.target.value)}
            />
          </div>

          <p className="text-label font-medium text-foreground/70">{copy['person.edit.relation_note']}</p>

          <div className="flex min-h-11 items-center gap-3">
            <Checkbox
              id="person-living"
              checked={living}
              onCheckedChange={(value) => setLiving(value === true)}
            />
            <Label htmlFor="person-living" className="text-body font-normal">
              {copy['person.living.label']}
            </Label>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="person-bio">{copy['person.bio.label']}</Label>
            <Textarea
              id="person-bio"
              value={bio}
              maxLength={BIO_MAX}
              onChange={(event) => setBio(event.target.value)}
            />
            <p className="text-caption text-muted-foreground">
              {interpolate(copy['person.bio.counter'], { count: String(bio.length) })}
            </p>
          </div>
        </div>

        <div className="sticky z-30 -mx-4 border-t border-border bg-background px-4 py-4 bottom-[calc(var(--bottom-nav-height)+var(--safe-bottom))] lg:bottom-0">
          <Button
            className="w-full"
            type="submit"
            size="lg"
            disabled={save.isPending || photoBusy || (!dirty && !saveFailed)}
            aria-busy={save.isPending}
          >
            {footerLabel}
          </Button>
        </div>
      </form>

      <AlertDialog open={blocker.state === 'blocked'} onOpenChange={(open) => !open && blocker.reset?.()}>
        <AlertDialogContent className="rounded-xl">
          <AlertDialogHeader>
            <AlertDialogTitle>{copy['person.add.discard.title']}</AlertDialogTitle>
            <AlertDialogDescription>{copy['person.add.discard.body']}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex flex-col gap-2 sm:flex-col">
            <AlertDialogCancel variant="default" className="w-full" onClick={() => blocker.reset?.()}>
              {copy['person.add.discard.keep']}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="outline"
              className="w-full border-destructive text-destructive hover:bg-destructive/10"
              onClick={() => {
                setAllowLeave(true);
                blocker.proceed?.();
              }}
            >
              {copy['person.add.discard.leave']}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <EditPersonForbiddenDialog open={forbidden} onDismiss={goToProfile} />
    </>
  );
}
