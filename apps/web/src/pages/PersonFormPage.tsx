import { useCallback, useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useBeforeUnload, useBlocker, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { PhotoAttach, type PhotoAttachState } from '@/components/PhotoAttach';
import { QueryLoading } from '@/components/QueryLoading';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { copy, interpolate } from '@/copy';
import { useMe } from '@/hooks/use-me';
import { useSelectedFamily } from '@/hooks/use-selected-family';
import { fieldForError, messageForError } from '@/lib/api-errors';
import {
  familyGraph,
  personDisplayName,
  type CreatePerson,
  type FamilyPerson,
  type FamilyRelationship,
} from '@/lib/family-graph';
import {
  formatBirthInput,
  isFutureBirthDate,
  parseBirthInput,
  type BirthDatePrecision,
} from '@/lib/person-age';
import { PERSON_GENDER_OPTIONS, genderFromRadio, genderToRadio, type PersonGender } from '@/lib/person-gender';
import { canEditPerson } from '@/lib/person-permissions';
import {
  relationshipUiType,
  relationshipWriteBody,
  type RelationshipUiType,
} from '@/lib/person-relationship';
import { queryKeys } from '@/lib/query-client';

const BIO_MAX = 2000;

const selectClassName =
  'flex h-12 min-h-12 w-full rounded-md border border-input bg-card px-3 py-2 text-body text-foreground';

function relationshipTypeCopy(uiType: RelationshipUiType): string {
  if (uiType === 'parent') return copy['person.relationship.parent'];
  if (uiType === 'spouse') return copy['person.relationship.spouse'];
  return copy['relation.type.child'];
}

function personWriteBody(input: {
  display_name: string;
  family_name: string;
  relation_label: string;
  gender: PersonGender;
  birth: string;
  birthMode: BirthDatePrecision;
  bio: string;
  avatar_media_id?: string;
}): CreatePerson | { field: 'display_name' | 'birth_date'; message: string } {
  const display_name = input.display_name.trim();
  if (!display_name) {
    return { field: 'display_name', message: copy['error.NAME_REQUIRED'] };
  }
  const parsedBirth = parseBirthInput(input.birth, input.birthMode);
  if (parsedBirth === 'invalid') {
    return { field: 'birth_date', message: copy['error.INVALID_BIRTH_DATE'] };
  }
  if (
    parsedBirth &&
    isFutureBirthDate(parsedBirth.birth_date, parsedBirth.birth_date_precision)
  ) {
    return { field: 'birth_date', message: copy['error.INVALID_BIRTH_DATE'] };
  }
  const family_name = input.family_name.trim();
  const relation_label = input.relation_label.trim();
  const bio = input.bio.trim();
  return {
    display_name,
    gender: input.gender,
    ...(family_name ? { family_name } : {}),
    ...(relation_label ? { relation_label } : {}),
    ...(parsedBirth
      ? { birth_date: parsedBirth.birth_date, birth_date_precision: parsedBirth.birth_date_precision }
      : {}),
    ...(bio ? { bio } : {}),
    ...(input.avatar_media_id ? { avatar_media_id: input.avatar_media_id } : {}),
  };
}

export function PersonFormPage() {
  const { personId } = useParams();
  const [params] = useSearchParams();
  const isEdit = Boolean(personId);
  const relatedPrefill = params.get('related') ?? '';
  const { familyId } = useSelectedFamily();
  const me = useMe();
  const people = useQuery({
    queryKey: queryKeys.people(familyId ?? ''),
    queryFn: () => familyGraph.listPeople(familyId!),
    enabled: Boolean(familyId),
  });
  const members = useQuery({
    queryKey: queryKeys.members(familyId ?? ''),
    queryFn: () => familyGraph.listMembers(familyId!),
    enabled: Boolean(familyId) && isEdit,
  });

  if (!familyId) {
    return <p className="text-body text-muted-foreground">{copy['family.empty.body']}</p>;
  }
  if (people.isPending || (isEdit && members.isPending)) return <QueryLoading />;
  if (people.isError) {
    return <p className="text-body text-destructive">{messageForError(people.error)}</p>;
  }

  const person = isEdit ? people.data?.people.find((row) => row.id === personId) : undefined;
  if (isEdit && !person) {
    return <p className="text-body text-destructive">{copy['error.NOT_FOUND']}</p>;
  }
  if (person && !canEditPerson(person, me.data?.id, members.data?.members)) {
    return <p className="text-body text-destructive">{copy['forbidden.title']}</p>;
  }

  return (
    <PersonForm
      familyId={familyId}
      person={person}
      people={people.data?.people ?? []}
      relationships={people.data?.relationships ?? []}
      relatedPrefill={relatedPrefill}
    />
  );
}

function PersonForm({
  familyId,
  person,
  people,
  relationships,
  relatedPrefill,
}: {
  familyId: string;
  person?: FamilyPerson;
  people: FamilyPerson[];
  relationships: FamilyRelationship[];
  relatedPrefill: string;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const initialName = person ? personDisplayName(person) : '';
  const [displayName, setDisplayName] = useState(initialName);
  const [familyName, setFamilyName] = useState(person?.family_name ?? '');
  const [relationLabel, setRelationLabel] = useState(person?.relation_label ?? '');
  const [gender, setGender] = useState<PersonGender>(person?.gender ?? null);
  const initialBirthMode: BirthDatePrecision = person?.birth_date_precision ?? 'day';
  const [birthMode, setBirthMode] = useState<BirthDatePrecision>(initialBirthMode);
  const [birth, setBirth] = useState(formatBirthInput(person?.birth_date, person?.birth_date_precision));
  const [bio, setBio] = useState(person?.bio ?? '');
  const [relatedPersonId, setRelatedPersonId] = useState(relatedPrefill);
  const [relationshipType, setRelationshipType] = useState<RelationshipUiType | ''>('');
  const [photos, setPhotos] = useState<PhotoAttachState>({ mediaIds: [], isBusy: false });
  const [fieldErrors, setFieldErrors] = useState<{ display_name?: string; birth_date?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [allowLeave, setAllowLeave] = useState(false);

  const ownRelationships = person
    ? relationships.filter((row) => row.person_id === person.id || row.related_person_id === person.id)
    : [];
  const otherPeople = people.filter((row) => row.id !== person?.id);

  const dirty = useMemo(() => {
    if (photos.mediaIds.length > 0 || photos.isBusy) return true;
    if (displayName !== initialName) return true;
    if (familyName !== (person?.family_name ?? '')) return true;
    if (relationLabel !== (person?.relation_label ?? '')) return true;
    if (gender !== (person?.gender ?? null)) return true;
    if (birthMode !== initialBirthMode) return true;
    if (birth !== formatBirthInput(person?.birth_date, person?.birth_date_precision)) return true;
    if (bio !== (person?.bio ?? '')) return true;
    if (relatedPersonId !== relatedPrefill) return true;
    if (relationshipType) return true;
    return false;
  }, [
    photos,
    displayName,
    initialName,
    familyName,
    relationLabel,
    gender,
    birthMode,
    initialBirthMode,
    birth,
    bio,
    relatedPersonId,
    relatedPrefill,
    relationshipType,
    person,
  ]);

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
    mutationFn: async () => {
      const body = personWriteBody({
        display_name: displayName,
        family_name: familyName,
        relation_label: relationLabel,
        gender,
        birth,
        birthMode,
        bio,
        avatar_media_id: photos.mediaIds[0],
      });
      if ('field' in body) {
        throw Object.assign(new Error(body.message), { field: body.field, clientField: true, message: body.message });
      }
      const savedPerson = person
        ? await familyGraph.updatePerson(person.id, body)
        : (await familyGraph.createPerson(familyId, body)).person;
      if (relationshipType && relatedPersonId) {
        await familyGraph.createRelationship(
          familyId,
          relationshipWriteBody(savedPerson.id, relatedPersonId, relationshipType)
        );
      }
      return savedPerson;
    },
    onSuccess: async (savedPerson) => {
      setAllowLeave(true);
      await queryClient.invalidateQueries({ queryKey: queryKeys.people(familyId) });
      navigate(`/family/people/${savedPerson.id}`);
    },
    onError: (error) => {
      if (error && typeof error === 'object' && 'clientField' in error) {
        const fieldError = error as unknown as { field: 'display_name' | 'birth_date'; message: string };
        setFieldErrors({ [fieldError.field]: fieldError.message });
        setFormError(null);
        return;
      }
      const field = fieldForError(error);
      const message = messageForError(error);
      if (field === 'display_name' || field === 'birth_date') {
        setFieldErrors({ [field]: message });
        setFormError(null);
        return;
      }
      setFormError(message);
    },
  });

  const removeRelationship = useMutation({
    mutationFn: (relationshipId: string) => familyGraph.deleteRelationship(relationshipId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.people(familyId) });
    },
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (photos.isBusy) return;
    setFieldErrors({});
    setFormError(null);
    save.mutate();
  }

  return (
    <>
      <form className="flex flex-col gap-6 pb-24" onSubmit={onSubmit}>
        <PhotoAttach
          familyId={familyId}
          label={copy['person.avatar.label']}
          onStateChange={setPhotos}
        />

        <div className="flex flex-col gap-2">
          <Label htmlFor="person-display-name">{copy['person.display_name.label']}</Label>
          <Input
            id="person-display-name"
            value={displayName}
            aria-invalid={Boolean(fieldErrors.display_name)}
            onChange={(event) => setDisplayName(event.target.value)}
          />
          {fieldErrors.display_name ? (
            <p className="text-caption text-destructive">{fieldErrors.display_name}</p>
          ) : null}
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="person-family-name">{copy['person.family_name.label']}</Label>
          <Input
            id="person-family-name"
            value={familyName}
            onChange={(event) => setFamilyName(event.target.value)}
          />
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-label font-medium">{copy['person.gender.label']}</legend>
          <RadioGroup
            className="flex flex-col gap-1"
            value={genderToRadio(gender)}
            onValueChange={(value) => setGender(genderFromRadio(value))}
          >
            {PERSON_GENDER_OPTIONS.map((option) => (
              <label
                key={option.value}
                htmlFor={`person-gender-${option.value}`}
                className="flex min-h-11 items-center gap-3 text-body"
              >
                <RadioGroupItem id={`person-gender-${option.value}`} value={option.value} />
                {copy[option.labelKey]}
              </label>
            ))}
          </RadioGroup>
        </fieldset>

        <div className="flex flex-col gap-2">
          <Label htmlFor="person-birth-date">{copy['person.birth.label']}</Label>
          {birthMode === 'year' ? (
            <div className="flex items-center gap-2">
              <span className="text-body text-muted-foreground">พ.ศ.</span>
              <Input
                id="person-birth-date"
                inputMode="numeric"
                value={birth}
                aria-invalid={Boolean(fieldErrors.birth_date)}
                onChange={(event) => setBirth(event.target.value)}
              />
            </div>
          ) : (
            <Input
              id="person-birth-date"
              type="date"
              value={birth}
              aria-invalid={Boolean(fieldErrors.birth_date)}
              onChange={(event) => setBirth(event.target.value)}
            />
          )}
          <div className="flex min-h-11 items-center gap-3">
            <Switch
              id="person-birth-year-only"
              checked={birthMode === 'year'}
              onCheckedChange={(checked) => {
                setBirthMode(checked ? 'year' : 'day');
                setBirth('');
              }}
            />
            <Label htmlFor="person-birth-year-only" className="text-body font-normal">
              {copy['person.birth.mode.year']}
            </Label>
          </div>
          <p className="text-caption text-muted-foreground">{copy['person.birth.hint']}</p>
          {fieldErrors.birth_date ? (
            <p className="text-caption text-destructive">{fieldErrors.birth_date}</p>
          ) : null}
        </div>

        {ownRelationships.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {ownRelationships.map((row) => {
              const otherId = row.person_id === person?.id ? row.related_person_id : row.person_id;
              const other = people.find((item) => item.id === otherId);
              const uiType = person ? relationshipUiType(row, person.id) : 'parent';
              const typeLabel = relationshipTypeCopy(uiType);
              return (
                <li key={row.id} className="flex min-h-11 items-center justify-between gap-3">
                  <p className="text-body">
                    {typeLabel}
                    {other ? ` · ${personDisplayName(other)}` : ''}
                  </p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={copy['a11y.close']}
                    disabled={removeRelationship.isPending}
                    onClick={() => removeRelationship.mutate(row.id)}
                  >
                    {copy['a11y.close']}
                  </Button>
                </li>
              );
            })}
          </ul>
        ) : null}

        <div className="flex flex-col gap-2">
          <Label htmlFor="person-related">{copy['person.relationship.label']}</Label>
          <select
            id="person-related"
            className={selectClassName}
            value={relatedPersonId}
            onChange={(event) => setRelatedPersonId(event.target.value)}
          >
            <option value="">{copy['person.relationship.related']}</option>
            {otherPeople.map((row) => (
              <option key={row.id} value={row.id}>
                {personDisplayName(row)}
              </option>
            ))}
          </select>
          {relatedPersonId ? (
            <RadioGroup
              className="flex flex-col gap-1"
              value={relationshipType}
              onValueChange={(value) => setRelationshipType(value as RelationshipUiType)}
            >
              <label htmlFor="person-rel-parent" className="flex min-h-11 items-center gap-3 text-body">
                <RadioGroupItem id="person-rel-parent" value="parent" />
                {copy['person.relationship.parent']}
              </label>
              <label htmlFor="person-rel-spouse" className="flex min-h-11 items-center gap-3 text-body">
                <RadioGroupItem id="person-rel-spouse" value="spouse" />
                {copy['person.relationship.spouse']}
              </label>
              <label htmlFor="person-rel-child" className="flex min-h-11 items-center gap-3 text-body">
                <RadioGroupItem id="person-rel-child" value="child" />
                {copy['relation.type.child']}
              </label>
            </RadioGroup>
          ) : null}
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="person-relation-label">{copy['person.relation_label.label']}</Label>
          <Input
            id="person-relation-label"
            value={relationLabel}
            placeholder={copy['person.relation_label.placeholder']}
            onChange={(event) => setRelationLabel(event.target.value)}
          />
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

        {photos.isBusy ? (
          <p className="text-caption text-muted-foreground">{copy['photo.upload.wait']}</p>
        ) : null}
        {formError ? <p className="text-caption text-destructive">{formError}</p> : null}
        {removeRelationship.isError ? (
          <p className="text-caption text-destructive">{messageForError(removeRelationship.error)}</p>
        ) : null}

        <div className="sticky z-30 -mx-4 border-t border-border bg-card px-4 py-3 bottom-[calc(var(--bottom-nav-height)+var(--safe-bottom))] lg:bottom-0">
          <Button className="w-full" type="submit" disabled={save.isPending || photos.isBusy}>
            {copy['person.save']}
          </Button>
        </div>
      </form>

      <AlertDialog open={blocker.state === 'blocked'} onOpenChange={(open) => !open && blocker.reset?.()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{copy['person.unsaved.title']}</AlertDialogTitle>
            <AlertDialogDescription>{copy['person.unsaved.body']}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => blocker.reset?.()}>{copy['person.unsaved.stay']}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                setAllowLeave(true);
                blocker.proceed?.();
              }}
            >
              {copy['person.unsaved.leave']}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
