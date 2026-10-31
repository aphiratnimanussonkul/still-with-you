import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { PersonInviteCard } from '@/components/PersonInviteCard';
import { PersonPhotoField } from '@/components/PersonPhotoField';
import { QueryLoading } from '@/components/QueryLoading';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { copy, interpolate, personRelationLabel } from '@/copy';
import { useMe } from '@/hooks/use-me';
import { useSelectedFamily } from '@/hooks/use-selected-family';
import { fieldForError, messageForError } from '@/lib/api-errors';
import {
  familyGraph,
  isPersonLiving,
  personDisplayName,
  type FamilyPerson,
  type RelationshipKind,
} from '@/lib/family-graph';
import { findMyPerson } from '@/lib/family-tree';
import { canClaimPerson, CLAIM_SELF_AFTER_CREATE_TOAST_MS } from '@/lib/person-claim';
import { isFamilySteward } from '@/lib/person-permissions';
import { livingDeathWriteFields } from '@/lib/person-years';
import { queryKeys } from '@/lib/query-client';
import { cn } from '@/lib/utils';

const KIND_OPTIONS: { value: RelationshipKind; labelKey: 'person.relationship.parent' | 'person.relationship.child' | 'person.relationship.spouse' }[] = [
  { value: 'parent_of', labelKey: 'person.relationship.parent' },
  { value: 'child_of', labelKey: 'person.relationship.child' },
  { value: 'spouse_of', labelKey: 'person.relationship.spouse' },
];

const selectClassName =
  'flex h-12 min-h-12 w-full rounded-md border border-input bg-card px-3 py-2 text-body text-foreground';

function isKind(value: string | null): value is RelationshipKind {
  return value === 'parent_of' || value === 'child_of' || value === 'spouse_of';
}

export function AddPersonPage() {
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
    enabled: Boolean(familyId),
  });

  if (!familyId) {
    return <p className="text-body text-muted-foreground">{copy['family.empty.body']}</p>;
  }
  if (people.isPending || members.isPending || me.isPending) return <QueryLoading />;
  if (people.isError) {
    return <p className="text-body text-destructive">{messageForError(people.error)}</p>;
  }
  if (!isFamilySteward(members.data?.members, me.data?.id)) {
    return <Navigate to="/family" replace />;
  }

  return (
    <AddPersonForm
      familyId={familyId}
      people={people.data?.people ?? []}
      isAdmin
      accountId={me.data?.id}
    />
  );
}

function AddPersonForm({
  familyId,
  people,
  isAdmin,
  accountId,
}: {
  familyId: string;
  people: FamilyPerson[];
  isAdmin: boolean;
  accountId?: string;
}) {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const myPerson = findMyPerson(people, accountId);
  const prefilledKind = params.get('kind');
  const prefilledPerson = params.get('person');
  const [name, setName] = useState(params.get('name') ?? '');
  const [nickname, setNickname] = useState('');
  const [kind, setKind] = useState<RelationshipKind | ''>(isKind(prefilledKind) ? prefilledKind : '');
  const [relatedId, setRelatedId] = useState(prefilledPerson || myPerson?.id || '');
  const [living, setLiving] = useState(true);
  const [deathYearOnly, setDeathYearOnly] = useState(false);
  const [deathDay, setDeathDay] = useState('');
  const [deathBe, setDeathBe] = useState('');
  const [photoId, setPhotoId] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [saved, setSaved] = useState<FamilyPerson | null>(null);
  const [claimSelf, setClaimSelf] = useState(false);

  const related = people.find((person) => person.id === relatedId);
  const relatedIsMe = Boolean(related && accountId && related.account_id === accountId);
  const relationshipLabel = relatedIsMe
    ? personRelationLabel(null)
    : related
      ? personRelationLabel(personDisplayName(related))
      : personRelationLabel(null);

  const canSubmit = name.trim().length > 0 && !photoBusy && (!kind || Boolean(relatedId));
  const showClaimSwitch = canClaimPerson(
    { account_id: null, is_living: living },
    { isAdmin, accountId, people }
  );

  const create = useMutation({
    mutationFn: async () => {
      const result = await familyGraph.createPerson(familyId, {
        display_name: name.trim(),
        ...livingDeathWriteFields({
          living,
          yearOnly: deathYearOnly,
          dayValue: deathDay,
          yearBe: deathBe,
        }),
        ...(nickname.trim() ? { relation_label: nickname.trim() } : {}),
        ...(photoId ? { avatar_media_id: photoId } : {}),
        ...(kind && relatedId ? { relationship: { kind, person_id: relatedId } } : {}),
      });
      if (!claimSelf) {
        return { result, claimed: false as const, claimFailed: false as const };
      }
      try {
        await familyGraph.claimPerson(result.person.id);
        return { result, claimed: true as const, claimFailed: false as const };
      } catch {
        return { result, claimed: false as const, claimFailed: true as const };
      }
    },
    onSuccess: async ({ result, claimed, claimFailed }) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.people(familyId) });
      const createdName = personDisplayName(result.person);
      if (claimSelf) {
        if (claimed) {
          toast(interpolate(copy['person.claim_self.done'], { ชื่อ: createdName }));
        } else if (claimFailed) {
          toast(interpolate(copy['person.claim_self.after_create_failed'], { ชื่อ: createdName }), {
            duration: CLAIM_SELF_AFTER_CREATE_TOAST_MS,
          });
        }
        navigate(`/family/people/${result.person.id}`);
        return;
      }
      setSaved(result.person);
      toast(interpolate(copy['person.add.saved_toast'], { name: createdName }));
    },
  });
  const relatedFieldError = fieldForError(create.error) === 'person-related';

  const showInvite = useMemo(
    () => Boolean(saved && isAdmin && isPersonLiving(saved)),
    [saved, isAdmin]
  );

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit || saved) return;
    create.mutate();
  }

  return (
    <div className="flex flex-col gap-6">
      <form className="flex flex-col gap-5" onSubmit={onSubmit}>
        <PersonPhotoField
          familyId={familyId}
          onReady={(mediaId, busy) => {
            setPhotoId(mediaId);
            setPhotoBusy(busy);
          }}
        />

        <div className="flex flex-col gap-2">
          <Label htmlFor="person-name">{copy['person.name.label']}</Label>
          <Input
            id="person-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={copy['person.name.placeholder']}
            disabled={Boolean(saved)}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="person-nickname">{copy['person.nickname.label']}</Label>
          <Input
            id="person-nickname"
            value={nickname}
            onChange={(event) => setNickname(event.target.value)}
            placeholder={copy['person.nickname.placeholder']}
            disabled={Boolean(saved)}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="person-kind">{relationshipLabel}</Label>
          <select
            id="person-kind"
            className={selectClassName}
            value={kind}
            disabled={Boolean(saved)}
            onChange={(event) => setKind(isKind(event.target.value) ? event.target.value : '')}
          >
            <option value="">{copy['person.relation.type.placeholder']}</option>
            {KIND_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {copy[option.labelKey]}
              </option>
            ))}
          </select>
          <select
            id="person-related"
            aria-label={relationshipLabel}
            aria-invalid={relatedFieldError}
            aria-describedby={relatedFieldError ? 'person-related-error' : undefined}
            className={selectClassName}
            value={relatedId}
            disabled={Boolean(saved)}
            onChange={(event) => setRelatedId(event.target.value)}
          >
            {people.map((person) => (
              <option key={person.id} value={person.id}>
                {personDisplayName(person)}
                {person.account_id === accountId ? ` ${copy['members.you']}` : ''}
              </option>
            ))}
          </select>
          {relatedFieldError ? (
            <p id="person-related-error" className="text-caption text-destructive">
              {messageForError(create.error)}
            </p>
          ) : null}
        </div>

        <div className="flex min-h-11 items-center gap-3">
          <Checkbox
            id="person-living"
            checked={living}
            disabled={Boolean(saved)}
            onCheckedChange={(value) => {
              const next = value === true;
              setLiving(next);
              if (!next) setClaimSelf(false);
            }}
          />
          <Label htmlFor="person-living" className="text-body font-normal">
            {copy['person.living.label']}
          </Label>
        </div>

        {living ? null : (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="person-death">{copy['person.death.label']}</Label>
              {deathYearOnly ? (
                <Input
                  id="person-death"
                  inputMode="numeric"
                  value={deathBe}
                  onChange={(event) => setDeathBe(event.target.value)}
                  disabled={Boolean(saved)}
                />
              ) : (
                <Input
                  id="person-death"
                  type="date"
                  value={deathDay}
                  onChange={(event) => setDeathDay(event.target.value)}
                  disabled={Boolean(saved)}
                />
              )}
            </div>
            <div className="flex min-h-11 items-center gap-3">
              <button
                type="button"
                role="switch"
                id="person-death-year-only"
                aria-checked={deathYearOnly}
                disabled={Boolean(saved)}
                className={cn(
                  'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors',
                  deathYearOnly ? 'border-primary bg-primary' : 'border-input bg-card',
                  saved ? 'opacity-50' : ''
                )}
                onClick={() => setDeathYearOnly((on) => !on)}
              >
                <span
                  className={cn(
                    'pointer-events-none block size-5 rounded-full bg-background shadow transition-transform',
                    deathYearOnly ? 'translate-x-5' : 'translate-x-0.5'
                  )}
                />
              </button>
              <Label htmlFor="person-death-year-only" className="text-body font-normal">
                {copy['person.death.year_only']}
              </Label>
            </div>
          </div>
        )}

        {showClaimSwitch ? (
          <div className="flex min-h-[52px] items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
            <Label htmlFor="person-claim-self" className="flex-1 text-body font-medium">
              {copy['person.menu.claim_self']}
            </Label>
            <Switch
              id="person-claim-self"
              checked={claimSelf}
              disabled={Boolean(saved)}
              onCheckedChange={(value) => setClaimSelf(value)}
            />
          </div>
        ) : null}

        {create.isError && !relatedFieldError ? (
          <p className="text-caption text-destructive">{messageForError(create.error)}</p>
        ) : null}

        {saved ? (
          <p className="text-body">{interpolate(copy['person.saved.title'], { ชื่อ: personDisplayName(saved) })}</p>
        ) : (
          <Button type="submit" className="w-full" disabled={!canSubmit || create.isPending}>
            {copy['person.add.submit']}
          </Button>
        )}
      </form>

      {saved && showInvite ? <PersonInviteCard personId={saved.id} name={personDisplayName(saved)} /> : null}
    </div>
  );
}
