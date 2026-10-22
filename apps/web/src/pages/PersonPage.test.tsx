import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { copy, interpolate, interpolateHeading } from '@/copy';
import { ApiClientError } from '@/lib/api-errors';
import { mockAccount, mockEvents, mockFamilies, mockMembers, mockPeople } from '@/mocks/data';

const meState = { id: mockAccount.id };

vi.mock('@/lib/api-client', () => ({
  api: {
    listFamilies: vi.fn(),
  },
}));

vi.mock('@/lib/family-graph', async () => {
  const actual = await vi.importActual<typeof import('@/lib/family-graph')>('@/lib/family-graph');
  return {
    ...actual,
    familyGraph: {
      listPeople: vi.fn(),
      listMembers: vi.fn(),
      listPersonEvents: vi.fn(),
      createPersonInvite: vi.fn(),
      deletePerson: vi.fn(),
    },
  };
});

vi.mock('@/lib/home-api', () => ({
  homeApi: {
    listFacts: vi.fn(),
  },
}));

vi.mock('@/hooks/use-me', () => ({
  useMe: () => ({
    data: { id: meState.id, display_name: 'Atta' },
  }),
}));

import { api } from '@/lib/api-client';
import { familyGraph } from '@/lib/family-graph';
import { homeApi } from '@/lib/home-api';
import { PersonPage } from '@/pages/PersonPage';

function renderPerson(personId = mockPeople[0].id) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/family/people/${personId}`]}>
        <Routes>
          <Route path="/family/people/:personId" element={<PersonPage />} />
          <Route path="/family/people/:personId/edit" element={<p>edit-page</p>} />
          <Route path="/family" element={<p>family-page</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('PersonPage', () => {
  beforeEach(() => {
    sessionStorage.clear();
    meState.id = mockAccount.id;
    vi.mocked(familyGraph.listPeople).mockReset();
    vi.mocked(familyGraph.listMembers).mockReset();
    vi.mocked(familyGraph.listPersonEvents).mockReset();
    vi.mocked(familyGraph.createPersonInvite).mockReset();
    vi.mocked(familyGraph.deletePerson).mockReset();
    vi.mocked(homeApi.listFacts).mockReset();
    vi.mocked(api.listFamilies).mockResolvedValue({ families: mockFamilies });
    vi.mocked(familyGraph.listPeople).mockResolvedValue({ people: mockPeople, relationships: [] });
    vi.mocked(familyGraph.listMembers).mockResolvedValue({ members: mockMembers });
    vi.mocked(familyGraph.listPersonEvents).mockResolvedValue({ events: [] });
    vi.mocked(homeApi.listFacts).mockResolvedValue({ groups: [] });
    vi.mocked(familyGraph.createPersonInvite).mockResolvedValue({
      id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      person_id: mockPeople[0].id,
      family_id: mockFamilies[0].id,
      email: 'user@example.com',
      status: 'pending',
      expires_at: '2026-10-29T00:00:00.000Z',
      created_at: '2026-10-22T00:00:00.000Z',
      url: 'http://localhost:5173/invites/dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    });
  });

  it('shows API age, uninvited badge, invite, and edit/delete in the more menu', async () => {
    renderPerson();
    const name = mockPeople[0].display_name;
    expect(await screen.findByRole('heading', { name })).toBeTruthy();
    expect(
      screen.getByText(
        interpolate(copy['person.age'], {
          age: String(mockPeople[0].age),
        })
      )
    ).toBeTruthy();
    expect(screen.getByText(copy['person.status.uninvited'])).toBeTruthy();
    const inviteButton = screen.getByRole('button', {
      name: interpolate(copy['person.invite.action'], { name }),
    });
    fireEvent.click(inviteButton);
    fireEvent.change(await screen.findByLabelText(copy['invite.email_label']), {
      target: { value: 'user@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: copy['invite.send'] }));
    await waitFor(() =>
      expect(familyGraph.createPersonInvite).toHaveBeenCalledWith(mockPeople[0].id, {
        email: 'user@example.com',
      })
    );
    expect(await screen.findByText(copy['invite.copy_link'])).toBeTruthy();
    expect(screen.getByText(copy['person.invite.share'])).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: copy['common.cancel'] }));

    fireEvent.click(screen.getByRole('button', { name: copy['a11y.more'] }));
    expect(await screen.findByRole('menuitem', { name: copy['person.edit.action'] })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: copy['person.delete.action'] })).toBeTruthy();
  });

  it('shows a pending invite badge from invite_status', async () => {
    vi.mocked(familyGraph.listPeople).mockResolvedValue({
      people: [{ ...mockPeople[0], invite_status: 'pending' }, mockPeople[1]],
      relationships: [],
    });
    renderPerson();
    expect(await screen.findByText(copy['person.status.pending'])).toBeTruthy();
  });

  it('shows approximate age when birth precision is year', async () => {
    vi.mocked(familyGraph.listPeople).mockResolvedValue({
      people: [{ ...mockPeople[0], birth_date_precision: 'year', age: 78 }, mockPeople[1]],
      relationships: [],
    });
    renderPerson();
    expect(
      await screen.findByText(interpolate(copy['person.age.approx'], { age: '78' }))
    ).toBeTruthy();
  });

  it('hides age when birth_date is missing', async () => {
    renderPerson(mockPeople[1].id);
    expect(await screen.findByRole('heading', { name: mockPeople[1].display_name })).toBeTruthy();
    expect(screen.queryByText(/อายุ/)).toBeNull();
  });

  it('hides invite and the more menu when the viewer cannot edit', async () => {
    meState.id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    vi.mocked(familyGraph.listMembers).mockResolvedValue({ members: [] });
    renderPerson();
    expect(await screen.findByRole('heading', { name: mockPeople[0].display_name })).toBeTruthy();
    expect(
      screen.queryByRole('button', {
        name: interpolate(copy['person.invite.action'], { name: mockPeople[0].display_name }),
      })
    ).toBeNull();
    expect(screen.queryByRole('button', { name: copy['a11y.more'] })).toBeNull();
  });

  it('hides delete and invite when linked and shows PERSON_LINKED', async () => {
    const linked = {
      ...mockPeople[0],
      account_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      invite_status: 'linked' as const,
    };
    vi.mocked(familyGraph.listPeople).mockResolvedValue({ people: [linked, mockPeople[1]], relationships: [] });
    renderPerson();
    const name = linked.display_name;
    expect(await screen.findByText(copy['person.status.linked'])).toBeTruthy();
    expect(screen.getByText(interpolate(copy['person.delete.linked'], { name }))).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: interpolate(copy['person.invite.action'], { name }) })
    ).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: copy['a11y.more'] }));
    expect(await screen.findByRole('menuitem', { name: copy['person.edit.action'] })).toBeTruthy();
    expect(screen.queryByRole('menuitem', { name: copy['person.delete.action'] })).toBeNull();
  });

  it('confirms delete with Eddy copy and maps PERSON_LINKED', async () => {
    vi.mocked(familyGraph.deletePerson).mockRejectedValue(
      new ApiClientError('PERSON_LINKED', 'linked', 409)
    );
    renderPerson();
    fireEvent.click(await screen.findByRole('button', { name: copy['a11y.more'] }));
    fireEvent.click(await screen.findByRole('menuitem', { name: copy['person.delete.action'] }));
    expect(
      screen.getByRole('heading', {
        name: interpolateHeading(copy['person.delete.confirm.title'], {
          name: mockPeople[0].display_name,
        }),
      })
    ).toBeTruthy();
    expect(
      screen.getByText(
        interpolate(copy['person.delete.confirm.body'], { name: mockPeople[0].display_name })
      )
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: copy['person.delete.confirm.primary'] }));
    expect(
      await screen.findByText(interpolate(copy['error.PERSON_LINKED'], { name: mockPeople[0].display_name }))
    ).toBeTruthy();
  });

  it('navigates home after a successful delete', async () => {
    vi.mocked(familyGraph.deletePerson).mockResolvedValue(undefined);
    renderPerson();
    fireEvent.click(await screen.findByRole('button', { name: copy['a11y.more'] }));
    fireEvent.click(await screen.findByRole('menuitem', { name: copy['person.delete.action'] }));
    fireEvent.click(screen.getByRole('button', { name: copy['person.delete.confirm.primary'] }));
    await waitFor(() => expect(familyGraph.deletePerson).toHaveBeenCalledWith(mockPeople[0].id));
    expect(await screen.findByText('family-page')).toBeTruthy();
  });

  it('labels a child-of edge with relation.type.child', async () => {
    vi.mocked(familyGraph.listPeople).mockResolvedValue({
      people: mockPeople,
      relationships: [
        {
          id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
          family_id: mockFamilies[0].id,
          person_id: mockPeople[1].id,
          related_person_id: mockPeople[0].id,
          type: 'parent',
          created_by_account_id: mockAccount.id,
          created_at: '2026-10-22T00:00:00.000Z',
        },
      ],
    });
    renderPerson();
    expect(
      await screen.findByText(`${copy['relation.type.child']} · ${mockPeople[1].display_name}`)
    ).toBeTruthy();
  });

  it('lists memories that feature this person', async () => {
    vi.mocked(familyGraph.listPersonEvents).mockResolvedValue({ events: [mockEvents[0]] });
    renderPerson();
    expect(await screen.findByRole('link', { name: mockEvents[0].title ?? '' })).toHaveAttribute(
      'href',
      `/memories/${mockEvents[0].id}`
    );
  });
});
