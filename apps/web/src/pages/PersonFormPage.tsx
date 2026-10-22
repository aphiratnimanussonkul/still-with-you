import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { PhotoAttach, type PhotoAttachState } from '@/components/PhotoAttach';
import { QueryLoading } from '@/components/QueryLoading';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { copy } from '@/copy';
import { useMe } from '@/hooks/use-me';
import { useSelectedFamily } from '@/hooks/use-selected-family';
import { messageForError } from '@/lib/api-errors';
import {
  familyGraph,
  personDisplayName,
  type CreatePerson,
  type FamilyPerson,
  type FamilyRelationship,
} from '@/lib/family-graph';
import { isFutureBirthDate } from '@/lib/person-age';
import { canEditPerson } from '@/lib/person-permissions';
import { queryKeys } from '@/lib/query-client';

const BIO_MAX = 2000;

const GENDER_OPTIONS = [
  { value: 'male' as const, labelKey: 'person.gender.male' as const },
  { value: 'female' as const, labelKey: 'person.gender.female' as const },
  { value: null, labelKey: 'person.gender.unspecified' as const },
];

const selectClassName =
  'flex h-12 min-h-12 w-full rounded-md border border-input bg-card px-3 py-2 text-body text-foreground';

type GenderValue = 'female' | 'male' | null;
type RelationshipType = 'parent' | 'spouse';

function personWriteBody(input: {
  display_name: string;
  family_name: string;
  gender: GenderValue;
  birth_date: string;
  bio: string;
  avatar_media_id?: string;
}): CreatePerson {
  const display_name = input.display_name.trim();
  const family_name = input.family_name.trim();
  const bio = input.bio.trim();
  return {
    display_name,
    gender: input.gender,
    ...(family_name ? { family_name } : {}),
    ...(input.birth_date ? { birth_date: input.birth_date } : {}),
    ...(bio ? { bio } : {}),
    ...(input.avatar_media_id ? { avatar_media_id: input.avatar_media_id } : {}),
  };
}

export function PersonFormPage() {
  const { personId } = useParams();
  const isEdit = Boolean(personId);
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
    />
  );
}

function PersonForm({
  familyId,
  person,
  people,
  relationships,
}: {
  familyId: string;
  person?: FamilyPerson;
  people: FamilyPerson[];
  relationships: FamilyRelationship[];
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [displayName, setDisplayName] = useState(person ? personDisplayName(person) : '');
  const [familyName, setFamilyName] = useState(person?.family_name ?? '');
  const [gender, setGender] = useState<GenderValue>(
    person?.gender === 'male' || person?.gender === 'female' ? person.gender : null
  );
  const [birthDate, setBirthDate] = useState(person?.birth_date ?? '');
  const [bio, setBio] = useState(person?.bio ?? '');
  const [relatedPersonId, setRelatedPersonId] = useState('');
  const [relationshipType, setRelationshipType] = useState<RelationshipType | ''>('');
  const [photos, setPhotos] = useState<PhotoAttachState>({ mediaIds: [], isBusy: false });
  const [formError, setFormError] = useState<string | null>(null);

  const ownRelationships = person
    ? relationships.filter((row) => row.person_id === person.id || row.related_person_id === person.id)
    : [];
  const otherPeople = people.filter((row) => row.id !== person?.id);

  const save = useMutation({
    mutationFn: async () => {
      const body = personWriteBody({
        display_name: displayName,
        family_name: familyName,
        gender,
        birth_date: birthDate,
        bio,
        avatar_media_id: photos.mediaIds[0],
      });
      const saved = person
        ? await familyGraph.updatePerson(person.id, body)
        : await familyGraph.createPerson(familyId, body);
      if (relationshipType && relatedPersonId) {
        await familyGraph.createRelationship(familyId, {
          person_id: saved.id,
          related_person_id: relatedPersonId,
          type: relationshipType,
        });
      }
      return saved;
    },
    onSuccess: async (saved) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.people(familyId) });
      navigate(`/family/people/${saved.id}`);
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
    if (!displayName.trim()) return;
    if (photos.isBusy) return;
    if (birthDate && isFutureBirthDate(birthDate)) {
      setFormError(copy['error.INVALID_BIRTH_DATE']);
      return;
    }
    setFormError(null);
    save.mutate();
  }

  const errorMessage = formError ?? (save.isError ? messageForError(save.error) : null);

  return (
    <form className="flex flex-col gap-6" onSubmit={onSubmit}>
      <div className="flex flex-col gap-2">
        {person?.avatar_url && photos.mediaIds.length === 0 ? (
          <img
            src={person.avatar_url}
            alt={personDisplayName(person)}
            className="size-24 rounded-full object-cover"
          />
        ) : null}
        <PhotoAttach
          familyId={familyId}
          maxCount={1}
          purpose="avatar"
          label={copy['person.avatar.label']}
          onStateChange={setPhotos}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="person-display-name">{copy['person.display_name.label']}</Label>
        <Input
          id="person-display-name"
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          required
        />
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
        {GENDER_OPTIONS.map((option) => (
          <label key={option.labelKey} className="flex min-h-11 items-center gap-3 text-body">
            <input
              type="radio"
              name="person-gender"
              checked={gender === option.value}
              onChange={() => setGender(option.value)}
            />
            {copy[option.labelKey]}
          </label>
        ))}
      </fieldset>

      <div className="flex flex-col gap-2">
        <Label htmlFor="person-birth-date">{copy['person.birth.label']}</Label>
        <Input
          id="person-birth-date"
          type="date"
          value={birthDate}
          onChange={(event) => setBirthDate(event.target.value)}
        />
        <p className="text-caption text-muted-foreground">{copy['person.birth.hint']}</p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="person-bio">{copy['person.bio.label']}</Label>
        <Textarea
          id="person-bio"
          value={bio}
          maxLength={BIO_MAX}
          onChange={(event) => setBio(event.target.value)}
        />
      </div>

      {ownRelationships.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {ownRelationships.map((row) => {
            const otherId = row.person_id === person?.id ? row.related_person_id : row.person_id;
            const other = people.find((item) => item.id === otherId);
            const typeLabel =
              row.type === 'parent'
                ? copy['person.relationship.parent']
                : copy['person.relationship.spouse'];
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
        <Label htmlFor="person-relationship-type">{copy['person.relationship.label']}</Label>
        <select
          id="person-relationship-type"
          className={selectClassName}
          value={relationshipType}
          onChange={(event) => setRelationshipType(event.target.value as RelationshipType | '')}
        >
          <option value="">{copy['person.relation_placeholder']}</option>
          <option value="parent">{copy['person.relationship.parent']}</option>
          <option value="spouse">{copy['person.relationship.spouse']}</option>
        </select>
        <Label htmlFor="person-related">{copy['person.relationship.related']}</Label>
        <select
          id="person-related"
          className={selectClassName}
          value={relatedPersonId}
          onChange={(event) => setRelatedPersonId(event.target.value)}
        >
          <option value="">{copy['person.relation_placeholder']}</option>
          {otherPeople.map((row) => (
            <option key={row.id} value={row.id}>
              {personDisplayName(row)}
            </option>
          ))}
        </select>
      </div>

      {photos.isBusy ? (
        <p className="text-caption text-muted-foreground">{copy['photo.upload.wait']}</p>
      ) : null}
      {errorMessage ? <p className="text-caption text-destructive">{errorMessage}</p> : null}
      {removeRelationship.isError ? (
        <p className="text-caption text-destructive">{messageForError(removeRelationship.error)}</p>
      ) : null}

      <Button type="submit" disabled={save.isPending || photos.isBusy || !displayName.trim()}>
        {copy['person.save']}
      </Button>
    </form>
  );
}
