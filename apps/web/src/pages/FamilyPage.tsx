import { useState } from 'react';
import { PlusIcon } from '@phosphor-icons/react/Plus';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FamilySwitcher } from '@/components/FamilySwitcher';
import { Illustration } from '@/components/Illustration';
import { QueryLoading } from '@/components/QueryLoading';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Icon } from '@/components/ui/icon';
import { copy, interpolate, interpolateHeading, truncateName } from '@/copy';
import { formatThaiDate } from '@/lib/dates';
import { useMe } from '@/hooks/use-me';
import { useSelectedFamily } from '@/hooks/use-selected-family';
import { api } from '@/lib/api-client';
import { messageForError } from '@/lib/api-errors';
import { familyGraph } from '@/lib/family-graph';
import { FOCUS_MAX, homeApi } from '@/lib/home-api';
import { queryKeys } from '@/lib/query-client';

export function FamilyPage() {
  const queryClient = useQueryClient();
  const { familiesQuery, families, familyId, select } = useSelectedFamily();
  const [name, setName] = useState('');
  const [tab, setTab] = useState<'tree' | 'members'>('tree');

  const create = useMutation({
    mutationFn: () => api.createFamily({ name }),
    onSuccess: async (created) => {
      setName('');
      select(created.id);
      await queryClient.invalidateQueries({ queryKey: queryKeys.families });
    },
  });

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
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant={tab === 'tree' ? 'default' : 'secondary'} onClick={() => setTab('tree')}>
              {copy['family.tab.tree']}
            </Button>
            <Button
              type="button"
              variant={tab === 'members' ? 'default' : 'secondary'}
              onClick={() => setTab('members')}
            >
              {copy['family.tab.members']}
            </Button>
          </div>
          {tab === 'tree' ? <TreePanel familyId={familyId} /> : <MembersPanel familyId={familyId} />}
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

function TreePanel({ familyId }: { familyId: string }) {
  const queryClient = useQueryClient();
  const [personName, setPersonName] = useState('');
  const people = useQuery({
    queryKey: queryKeys.people(familyId),
    queryFn: () => familyGraph.listPeople(familyId),
  });
  const focus = useQuery({
    queryKey: queryKeys.focus(familyId),
    queryFn: () => homeApi.getFocus(familyId),
  });
  const createPerson = useMutation({
    mutationFn: () => familyGraph.createPerson(familyId, { name: personName.trim() }),
    onSuccess: async () => {
      setPersonName('');
      await queryClient.invalidateQueries({ queryKey: queryKeys.people(familyId) });
    },
  });
  const toggleFocus = useMutation({
    mutationFn: (personIds: string[]) => homeApi.putFocus(familyId, personIds),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.focus(familyId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.home(familyId) }),
      ]);
    },
  });

  if (people.isPending) return <QueryLoading />;
  if (people.isError) return <p className="text-body text-destructive">{messageForError(people.error)}</p>;

  const items = people.data?.people ?? [];
  const focusedIds = focus.data?.items.map((item) => item.person.id) ?? [];
  const focused = new Set(focusedIds);
  const focusUnavailable = focus.isError || focus.isPending;

  return (
    <div className="flex flex-col gap-4">
      {toggleFocus.isError ? (
        <p className="text-body text-destructive">{messageForError(toggleFocus.error)}</p>
      ) : null}
      {focusedIds.length >= FOCUS_MAX ? (
        <p className="text-caption text-muted-foreground">{copy['error.TOO_MANY_FOCUS']}</p>
      ) : null}
      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <Illustration name="family-tree" />
          <p className="text-h3 font-semibold">{copy['tree.empty.title']}</p>
          <p className="text-body text-muted-foreground">{copy['tree.empty.body']}</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((person) => (
            <li key={person.id}>
              <Card>
                <CardHeader>
                  <CardTitle className="truncate">{truncateName(person.name)}</CardTitle>
                  {person.relation_label ? (
                    <CardDescription>
                      {interpolate(copy['person.relation.meta'], { ความสัมพันธ์: person.relation_label })}
                    </CardDescription>
                  ) : null}
                </CardHeader>
                <CardContent className="flex flex-col gap-2">
                  <div className="flex min-h-11 items-start gap-3">
                    <Checkbox
                      id={`focus-${person.id}`}
                      checked={focused.has(person.id)}
                      disabled={
                        focusUnavailable ||
                        toggleFocus.isPending ||
                        (!focused.has(person.id) && focusedIds.length >= FOCUS_MAX)
                      }
                      onCheckedChange={(value) => {
                        if (focusUnavailable) return;
                        const next = focusedIds.filter((id) => id !== person.id);
                        if (value === true) {
                          if (next.length >= FOCUS_MAX) return;
                          next.push(person.id);
                        }
                        toggleFocus.mutate(next);
                      }}
                    />
                    <div className="flex flex-col gap-1">
                      <Label htmlFor={`focus-${person.id}`} className="text-body font-normal">
                        {copy['family.focus.toggle']}
                      </Label>
                      <p className="text-caption text-muted-foreground">{copy['family.focus.note']}</p>
                      {focus.isError ? (
                        <>
                          <p className="text-caption text-destructive">{copy['family.focus.load_error']}</p>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => void focus.refetch()}
                          >
                            {copy['family.focus.load_error.action']}
                          </Button>
                        </>
                      ) : null}
                    </div>
                  </div>
                  <PersonFactsSection personId={person.id} name={person.name} />
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{copy['person.add.title']}</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (personName.trim()) createPerson.mutate();
            }}
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor="person-name">{copy['person.name_label']}</Label>
              <Input
                id="person-name"
                value={personName}
                onChange={(event) => setPersonName(event.target.value)}
                placeholder={copy['person.name_placeholder']}
              />
            </div>
            {createPerson.isError ? (
              <p className="text-caption text-destructive">{messageForError(createPerson.error)}</p>
            ) : null}
            <Button type="submit" disabled={createPerson.isPending || !personName.trim()}>
              {copy['person.save']}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function MembersPanel({ familyId }: { familyId: string }) {
  const me = useMe();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const members = useQuery({
    queryKey: queryKeys.members(familyId),
    queryFn: () => familyGraph.listMembers(familyId),
  });
  const invites = useQuery({
    queryKey: queryKeys.invites(familyId),
    queryFn: () => familyGraph.listInvites(familyId),
  });
  const invite = useMutation({
    mutationFn: () => familyGraph.createInvite(familyId, email.trim()),
    onSuccess: async () => {
      setEmail('');
      await queryClient.invalidateQueries({ queryKey: queryKeys.invites(familyId) });
    },
  });

  if (members.isPending) return <QueryLoading />;
  if (members.isError) return <p className="text-body text-destructive">{messageForError(members.error)}</p>;

  const items = members.data?.members ?? [];

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-h3 font-semibold">{copy['members.title']}</h2>
      <ul className="flex flex-col gap-3">
        {items.map((member) => (
          <li key={member.account_id}>
            <Card>
              <CardHeader>
                <CardTitle className="truncate">
                  {truncateName(member.display_name)}
                  {member.account_id === me.data?.id ? ` ${copy['members.you']}` : ''}
                </CardTitle>
                <CardDescription>
                  {member.role === 'admin' ? copy['members.role.admin'] : null}
                </CardDescription>
              </CardHeader>
            </Card>
          </li>
        ))}
      </ul>

      <Card>
        <CardHeader>
          <CardTitle>{copy['invite.title']}</CardTitle>
          <CardDescription>{copy['invite.body']}</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (email.trim()) invite.mutate();
            }}
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor="invite-email">{copy['invite.email_label']}</Label>
              <Input
                id="invite-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
            {invite.isError ? (
              <p className="text-caption text-destructive">{messageForError(invite.error)}</p>
            ) : null}
            <Button type="submit" disabled={invite.isPending || !email.trim()}>
              {copy['invite.send']}
            </Button>
          </form>
        </CardContent>
      </Card>

      {invites.data?.invites.length ? (
        <section className="flex flex-col gap-3">
          <h3 className="text-h3 font-semibold">{copy['invite.list.title']}</h3>
          <ul className="flex flex-col gap-2">
            {invites.data.invites.map((item) => (
              <li key={item.id} className="text-body text-muted-foreground">
                {item.email} · {copy['invite.status.pending']}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function PersonFactsSection({ personId, name }: { personId: string; name: string }) {
  const facts = useQuery({
    queryKey: queryKeys.facts(personId),
    queryFn: () => homeApi.listFacts(personId),
  });
  const answers =
    facts.data?.groups.flatMap((group) =>
      group.answers.map((answer) => ({
        ...answer,
        questionText: group.question.text,
      }))
    ) ?? [];

  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-body font-semibold">
        {interpolateHeading(copy['person.facts.title'], { name })}
      </h3>
      {facts.isPending ? <QueryLoading /> : null}
      {facts.isError ? (
        <p className="text-caption text-destructive">{messageForError(facts.error)}</p>
      ) : null}
      {facts.isSuccess && answers.length === 0 ? (
        <>
          <p className="text-body text-muted-foreground">
            {interpolateHeading(copy['person.facts.empty.title'], { name })}
          </p>
          <p className="text-caption text-muted-foreground">{copy['person.facts.empty.body']}</p>
        </>
      ) : null}
      {facts.isSuccess && answers.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {answers.map((answer) => (
            <li key={answer.id} className="flex flex-col gap-1">
              <p className="text-caption text-muted-foreground">{answer.questionText}</p>
              <p className="text-body">{answer.answer_text}</p>
              {answer.author && answer.created_at ? (
                <p className="text-caption text-muted-foreground">
                  {interpolate(copy['person.facts.answer.meta'], {
                    ผู้ตอบ: answer.author.display_name,
                    วันที่: formatThaiDate(answer.created_at),
                  })}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
