import { useEffect, useMemo, useState } from 'react';
import { CircleNotchIcon } from '@phosphor-icons/react/CircleNotch';
import { WarningCircleIcon } from '@phosphor-icons/react/WarningCircle';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { copy, interpolate, interpolateHeading } from '@/copy';
import {
  familyGraph,
  personDisplayName,
  type FamilyPerson,
  type FamilyRelationship,
} from '@/lib/family-graph';
import { nameInitial } from '@/lib/initials';
import {
  addPersonHref,
  existingLinkWriteBody,
  filterPickablePeople,
  linkRelationshipCanRetry,
  linkRelationshipErrorKind,
  linkRelationshipErrorMessage,
  pickablePeople,
  type RelationshipUiType,
} from '@/lib/person-relationship';
import { queryKeys } from '@/lib/query-client';

const TITLE_KEY = {
  spouse: 'relation.pick.title.spouse',
  parent: 'relation.pick.title.parent',
  child: 'relation.pick.title.child',
} as const;

type PickExistingPersonSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  familyId: string;
  subject: FamilyPerson;
  kind: RelationshipUiType;
  people: FamilyPerson[];
  relationships: FamilyRelationship[];
  onLinked?: (selected: FamilyPerson) => void;
};

export function PickExistingPersonSheet({
  open,
  onOpenChange,
  familyId,
  subject,
  kind,
  people,
  relationships,
  onLinked,
}: PickExistingPersonSheetProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [query, setQuery] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{
    personId: string;
    message: string;
    retry: boolean;
  } | null>(null);

  const subjectName = personDisplayName(subject);
  const pickable = useMemo(
    () => pickablePeople(people, relationships, subject.id),
    [people, relationships, subject.id]
  );
  const filtered = useMemo(
    () => filterPickablePeople(people, relationships, subject.id, query),
    [people, relationships, subject.id, query]
  );
  const searchValue = query.trim();
  const nobodyPickable = pickable.length === 0;
  const searchMiss = !nobodyPickable && filtered.length === 0 && searchValue.length > 0;
  const busy = savingId != null;

  useEffect(() => {
    if (!open) {
      setQuery('');
      setSavingId(null);
      setRowError(null);
    }
  }, [open]);

  const link = useMutation({
    mutationFn: (selected: FamilyPerson) =>
      familyGraph.createRelationship(familyId, existingLinkWriteBody(subject.id, selected.id, kind)),
    onMutate: (selected) => {
      setSavingId(selected.id);
      setRowError(null);
    },
    onSuccess: async (_result, selected) => {
      toast(
        interpolate(copy['relation.link.toast'], {
          ชื่อ: subjectName,
          อีกคน: personDisplayName(selected),
        })
      );
      onOpenChange(false);
      onLinked?.(selected);
      await queryClient.invalidateQueries({ queryKey: queryKeys.people(familyId) });
    },
    onError: (error, selected) => {
      const kind = linkRelationshipErrorKind(error);
      setRowError({
        personId: selected.id,
        message: linkRelationshipErrorMessage(kind, {
          ชื่อ: kind === 'too_many_parents' ? subjectName : personDisplayName(selected),
        }),
        retry: linkRelationshipCanRetry(kind),
      });
    },
    onSettled: () => {
      setSavingId(null);
    },
  });

  function goAddNew(prefillName?: string) {
    if (busy) return;
    onOpenChange(false);
    navigate(addPersonHref(kind, subject.id, prefillName));
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="h-[min(600px,85dvh)] gap-4 rounded-t-3xl border-0 px-6 pb-6 pt-4"
      >
        <div className="mx-auto h-1 w-8 rounded-sm bg-border" />
        <SheetHeader className="p-0">
          <SheetTitle className="text-h3">
            {interpolateHeading(copy[TITLE_KEY[kind]], { ชื่อ: subjectName })}
          </SheetTitle>
          <SheetDescription className="text-caption text-muted-foreground">
            {copy['relation.pick.subtitle']}
          </SheetDescription>
        </SheetHeader>
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={copy['relation.pick.search.placeholder']}
          aria-label={copy['relation.pick.search.placeholder']}
          disabled={busy}
        />
        <div className="min-h-0 flex-1 overflow-y-auto">
          {nobodyPickable ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <p className="text-body">{copy['relation.pick.empty']}</p>
              <Button type="button" size="lg" disabled={busy} onClick={() => goAddNew()}>
                {copy['relation.pick.add_new']}
              </Button>
            </div>
          ) : null}
          {searchMiss ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <p className="text-body">
                {interpolate(copy['relation.pick.search.empty'], { คำค้น: searchValue })}
              </p>
              <Button type="button" size="lg" disabled={busy} onClick={() => goAddNew(searchValue)}>
                {interpolate(copy['relation.pick.search.add'], { คำค้น: searchValue })}
              </Button>
            </div>
          ) : null}
          {!nobodyPickable && filtered.length > 0 ? (
            <div className="flex flex-col">
              <p className="text-caption text-muted-foreground">{copy['relation.pick.section.existing']}</p>
              <ul>
                {filtered.map((person) => {
                  const name = personDisplayName(person);
                  const nickname = person.relation_label?.trim();
                  const saving = savingId === person.id;
                  const error = rowError?.personId === person.id ? rowError : null;
                  return (
                    <li key={person.id} className="flex flex-col">
                      <div className="flex h-14 items-center gap-3">
                        <Avatar size="lg" className="size-10 bg-secondary">
                          {person.avatar_url ? <AvatarImage src={person.avatar_url} alt="" /> : null}
                          <AvatarFallback className="bg-secondary text-[17px] font-semibold text-secondary-foreground">
                            {nameInitial(name)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-body">{name}</p>
                          {nickname ? (
                            <p className="truncate text-caption text-muted-foreground">{nickname}</p>
                          ) : null}
                        </div>
                        {saving ? (
                          <span className="flex items-center gap-2 text-caption text-muted-foreground">
                            <Icon
                              as={CircleNotchIcon}
                              size={16}
                              className="animate-spin motion-reduce:animate-none"
                            />
                            {copy['relation.link.saving']}
                          </span>
                        ) : (
                          <Button
                            type="button"
                            variant="outline"
                            className="h-9 min-h-9 px-3 text-caption"
                            disabled={busy}
                            onClick={() => link.mutate(person)}
                          >
                            {copy['relation.pick.link']}
                          </Button>
                        )}
                      </div>
                      {error ? (
                        <div
                          role="alert"
                          className="mb-2 flex items-center gap-2 rounded-lg bg-warning px-3 py-2 text-caption text-warning-foreground"
                        >
                          <Icon as={WarningCircleIcon} size={16} className="shrink-0" />
                          <p className="min-w-0 flex-1">{error.message}</p>
                          {error.retry ? (
                            <Button
                              type="button"
                              variant="ghost"
                              className="h-9 min-h-9 px-2 text-caption"
                              onClick={() => link.mutate(person)}
                            >
                              {copy['common.retry']}
                            </Button>
                          ) : null}
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
        </div>
        {!nobodyPickable && !searchMiss ? (
          <SheetFooter className="p-0">
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="w-full"
              disabled={busy}
              onClick={() => goAddNew()}
            >
              {copy['relation.pick.add_new']}
            </Button>
            <p className="text-center text-caption text-muted-foreground">
              {copy['relation.pick.add_new.caption']}
            </p>
          </SheetFooter>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
