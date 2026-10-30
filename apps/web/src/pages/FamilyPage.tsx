import { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PlusIcon } from '@phosphor-icons/react/Plus';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FamilySwitcher } from '@/components/FamilySwitcher';
import { FamilyTreeCanvas } from '@/components/FamilyTreeCanvas';
import { Illustration } from '@/components/Illustration';
import { PersonListRow } from '@/components/PersonListRow';
import { QueryLoading } from '@/components/QueryLoading';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Icon } from '@/components/ui/icon';
import { copy } from '@/copy';
import { useMe } from '@/hooks/use-me';
import { useSelectedFamily } from '@/hooks/use-selected-family';
import { api } from '@/lib/api-client';
import { messageForError } from '@/lib/api-errors';
import { familyGraph } from '@/lib/family-graph';
import { readFamilyTab, writeFamilyTab, type FamilyViewTab } from '@/lib/family-tab';
import { isOnlySelf, layoutFamilyTree, peopleByGeneration, type FamilyTreeLayout } from '@/lib/family-tree';
import { isFamilySteward } from '@/lib/person-permissions';
import { queryKeys } from '@/lib/query-client';

const FAILED_LAYOUT: FamilyTreeLayout = {
  nodes: [],
  couples: [],
  brackets: [],
  failed: true,
  width: 0,
  height: 0,
};

export function FamilyPage() {
  const queryClient = useQueryClient();
  const { familiesQuery, families, familyId, select } = useSelectedFamily();
  const [name, setName] = useState('');
  const [tab, setTab] = useState<FamilyViewTab>(() => readFamilyTab());

  const create = useMutation({
    mutationFn: () => api.createFamily({ name }),
    onSuccess: async (created) => {
      setName('');
      select(created.id);
      await queryClient.invalidateQueries({ queryKey: queryKeys.families });
    },
  });

  const setView = useCallback((next: FamilyViewTab) => {
    setTab(next);
    writeFamilyTab(next);
  }, []);

  if (familiesQuery.isPending) return <QueryLoading />;
  if (familiesQuery.isError) {
    return <p className="text-body text-destructive">{messageForError(familiesQuery.error)}</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      {families.length > 0 ? (
        <FamilySwitcher families={families} selectedId={familyId} onSelect={select} />
      ) : (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <Illustration name="family-home" />
          <p className="text-h3 font-semibold">{copy['family.empty.title']}</p>
          <p className="text-body text-muted-foreground">{copy['family.empty.body']}</p>
        </div>
      )}

      {familyId ? (
        <>
          <div className="grid grid-cols-2 rounded-xl bg-secondary p-1">
            <Button
              type="button"
              variant={tab === 'tree' ? 'default' : 'ghost'}
              onClick={() => setView('tree')}
            >
              {copy['family.tab.graph']}
            </Button>
            <Button
              type="button"
              variant={tab === 'list' ? 'default' : 'ghost'}
              onClick={() => setView('list')}
            >
              {copy['family.tab.list']}
            </Button>
          </div>
          <FamilyPeoplePanel familyId={familyId} tab={tab} />
        </>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{copy['family.create.title']}</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (name.trim()) create.mutate();
            }}
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor="family-name">{copy['family.create.name_label']}</Label>
              <Input
                id="family-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={copy['family.create.name_placeholder']}
              />
              <p className="text-caption text-muted-foreground">{copy['family.create.helper']}</p>
            </div>
            {create.isError ? (
              <p className="text-caption text-destructive">{messageForError(create.error)}</p>
            ) : null}
            <Button type="submit" disabled={create.isPending || !name.trim()}>
              <Icon as={PlusIcon} size={20} />
              {copy['family.create.submit']}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function FamilyPeoplePanel({
  familyId,
  tab,
}: {
  familyId: string;
  tab: FamilyViewTab;
}) {
  const me = useMe();
  const [resetToken, setResetToken] = useState(0);
  const members = useQuery({
    queryKey: queryKeys.members(familyId),
    queryFn: () => familyGraph.listMembers(familyId),
  });
  const people = useQuery({
    queryKey: queryKeys.people(familyId),
    queryFn: () => familyGraph.listPeople(familyId),
  });
  const isAdmin = isFamilySteward(members.data?.members, me.data?.id);
  const items = people.data?.people ?? [];
  const relationships = people.data?.relationships ?? [];
  const onlySelf = isOnlySelf(items, me.data?.id);
  const listed = peopleByGeneration(items, relationships);
  const layout = useMemo(() => {
    try {
      return layoutFamilyTree(items, relationships, me.data?.id);
    } catch {
      return FAILED_LAYOUT;
    }
  }, [items, relationships, me.data?.id]);

  if (people.isPending) return <QueryLoading />;
  if (people.isError) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-body text-destructive">{messageForError(people.error)}</p>
        <Button type="button" variant="ghost" size="sm" onClick={() => void people.refetch()}>
          {copy['common.retry']}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {onlySelf ? (
        <Card>
          <CardHeader className="items-center text-center">
            <Illustration name="family-tree" />
            <CardTitle>{copy['tree.only_self.title']}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-3 text-center">
            <p className="text-body text-muted-foreground">{copy['tree.only_self.body']}</p>
            {isAdmin ? (
              <Button asChild>
                <Link to="/family/people/new">{copy['person.add.action']}</Link>
              </Button>
            ) : null}
          </CardContent>
        </Card>
      ) : tab === 'tree' ? (
        layout.failed ? (
          <TreeFallbackList listed={listed} />
        ) : (
          <FamilyTreeCanvas
            people={items}
            relationships={relationships}
            accountId={me.data?.id}
            canAdd={isAdmin}
            resetToken={resetToken}
          />
        )
      ) : (
        <ol className="flex flex-col gap-3">
          {listed.map(({ person, generation }) => (
            <li key={person.id}>
              <PersonListRow person={person} generation={generation} />
            </li>
          ))}
        </ol>
      )}

      {onlySelf ? null : (
        <div className="flex gap-2">
          {isAdmin ? (
            <Button asChild className="flex-1">
              <Link to="/family/people/new">{copy['person.add.action']}</Link>
            </Button>
          ) : null}
          <Button type="button" variant="secondary" className="flex-1" onClick={() => setResetToken((value) => value + 1)}>
            {copy['tree.back_to_me']}
          </Button>
        </div>
      )}
    </div>
  );
}

function TreeFallbackList({
  listed,
}: {
  listed: ReturnType<typeof peopleByGeneration>;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <h2 className="text-h3 font-semibold">{copy['tree.fallback_list.title']}</h2>
        <p className="text-body text-muted-foreground">{copy['tree.fallback_list.body']}</p>
      </div>
      <ol className="flex flex-col gap-3">
        {listed.map(({ person, generation }) => (
          <li key={person.id}>
            <PersonListRow person={person} generation={generation} />
          </li>
        ))}
      </ol>
    </div>
  );
}
