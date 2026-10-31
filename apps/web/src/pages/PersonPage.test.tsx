import { useState, type ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppBarOverrideProvider, type AppBarOverride } from '@/components/app-bar-override';
import { copy, interpolate, interpolateHeading } from '@/copy';
import { formatThaiDate } from '@/lib/dates';
import { mockAccount, mockFamilies, mockMembers, mockPeople } from '@/mocks/data';

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
      getPerson: vi.fn(),
      updatePerson: vi.fn(),
      deletePerson: vi.fn(),
      createPersonInvite: vi.fn(),
    },
  };
});

vi.mock('@/hooks/use-me', () => ({
  useMe: () => ({ data: mockAccount, isPending: false }),
}));

vi.mock('@/lib/home-api', () => ({
  FOCUS_MAX: 10,
  homeApi: {
    getFocus: vi.fn(),
    putFocus: vi.fn(),
    listFacts: vi.fn(),
  },
}));

import { api } from '@/lib/api-client';
import { familyGraph } from '@/lib/family-graph';
import { homeApi } from '@/lib/home-api';
import { PersonPage } from '@/pages/PersonPage';

function AppBarHarness({ children }: { children: ReactNode }) {
  const [override, setOverride] = useState<AppBarOverride>({});
  return (
    <AppBarOverrideProvider value={setOverride}>
      <div data-testid="app-bar-extra">{override.extra}</div>
      {children}
    </AppBarOverrideProvider>
  );
}

function renderPerson(id = mockPeople[0].id) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/family/people/${id}`]}>
        <Routes>
          <Route
            path="/family/people/:personId"
            element={
              <AppBarHarness>
                <PersonPage />
              </AppBarHarness>
            }
          />
          <Route path="/family/people/:personId/edit" element={<p>edit-page</p>} />
          <Route path="/family" element={<p>family-page</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function mockPage(person = mockPeople[0], members = mockMembers) {
  vi.mocked(api.listFamilies).mockResolvedValue({ families: mockFamilies });
  vi.mocked(familyGraph.listPeople).mockResolvedValue({ people: mockPeople, relationships: [] });
  vi.mocked(familyGraph.listMembers).mockImplementation(async (fid) => ({
    members: members.filter((member) => member.family_id === fid),
  }));
  vi.mocked(familyGraph.getPerson).mockResolvedValue(person);
  vi.mocked(homeApi.getFocus).mockResolvedValue({ items: [] });
  vi.mocked(homeApi.listFacts).mockResolvedValue({ groups: [] });
}

describe('PersonPage', () => {
  beforeEach(() => {
    vi.mocked(familyGraph.listMembers).mockReset();
    vi.mocked(familyGraph.deletePerson).mockReset();
    vi.mocked(familyGraph.updatePerson).mockReset();
  });

  it('shows display name, พ.ศ. years, and age at death from the API', async () => {
    mockPage();
    renderPerson();
    expect(await screen.findByText('ยายสมศรี')).toBeTruthy();
    expect(screen.getByText('2480–2565')).toBeTruthy();
    expect(screen.getByText(interpolate(copy['person.death.age'], { อายุ: '84' }))).toBeTruthy();
    expect(screen.queryByText(interpolate(copy['person.age.exact'], { n: '84' }))).toBeNull();
    expect(
      screen.getByText(interpolateHeading(copy['person.facts.empty.title'], { name: 'ยายสมศรี' }))
    ).toBeTruthy();
  });

  it('shows approximate living age for year precision, hides age when null, and uses events.empty', async () => {
    mockPage({ ...mockPeople[1], invite_status: 'none' });
    renderPerson(mockPeople[1].id);
    expect(await screen.findByText(interpolate(copy['person.age.approx'], { n: '91' }))).toBeTruthy();
    expect(screen.queryByText(interpolate(copy['person.age.exact'], { n: '91' }))).toBeNull();
    expect(screen.getByText(copy['person.invite.status.none'])).toBeTruthy();
    expect(
      screen.getByText(interpolate(copy['person.events.empty'], { name: mockPeople[1].display_name }))
    ).toBeTruthy();
  });

  it('hides living age when API age is null', async () => {
    mockPage({ ...mockPeople[2], age: null, invite_status: 'pending' });
    renderPerson(mockPeople[2].id);
    expect(await screen.findByText(mockPeople[2].display_name)).toBeTruthy();
    expect(screen.queryByText(/อายุ/)).toBeNull();
    expect(screen.getByText(copy['person.status.pending'])).toBeTruthy();
  });

  it('lets the signed-in account focus the person', async () => {
    mockPage(mockPeople[1]);
    vi.mocked(homeApi.putFocus).mockResolvedValue({ items: [] });
    renderPerson(mockPeople[1].id);
    fireEvent.click(await screen.findByText(copy['family.focus.toggle']));
    await waitFor(() =>
      expect(homeApi.putFocus).toHaveBeenCalledWith(mockFamilies[0].id, [mockPeople[1].id])
    );
  });

  it('shows answer meta on facts', async () => {
    mockPage();
    vi.mocked(homeApi.listFacts).mockResolvedValue({
      groups: [
        {
          question: {
            id: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001',
            key: 'birthplace',
            text: 'ยายสมศรี เกิดที่ไหน',
          },
          answers: [
            {
              id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
              answer_text: 'อยุธยา',
              author: { account_id: mockPeople[2].account_id!, display_name: 'Atta' },
              created_at: '2026-10-22T00:00:00.000Z',
              updated_at: '2026-10-22T00:00:00.000Z',
              can_edit: true,
              can_delete: true,
            },
          ],
        },
      ],
    });

    renderPerson();
    expect(await screen.findByText('อยุธยา')).toBeTruthy();
    expect(
      screen.getByText(
        interpolate(copy['person.facts.answer.meta'], {
          ผู้ตอบ: 'Atta',
          วันที่: formatThaiDate('2026-10-22T00:00:00.000Z'),
        })
      )
    ).toBeTruthy();
  });

  it('PATCHes death_date and death_date_precision as null when switching back to living', async () => {
    mockPage();
    vi.mocked(familyGraph.updatePerson).mockResolvedValue({
      ...mockPeople[0],
      is_living: true,
      death_date: null,
      death_date_precision: null,
    });

    renderPerson();
    const living = await screen.findByLabelText(copy['person.living']);
    expect((living as HTMLButtonElement).getAttribute('data-state')).toBe('unchecked');
    fireEvent.click(living);
    fireEvent.click(screen.getByRole('button', { name: copy['person.save'] }));
    await waitFor(() =>
      expect(familyGraph.updatePerson).toHaveBeenCalledWith(mockPeople[0].id, {
        is_living: true,
        death_date: null,
        death_date_precision: null,
      })
    );
    const payload = vi.mocked(familyGraph.updatePerson).mock.calls[0]?.[1];
    expect(payload).toHaveProperty('death_date', null);
    expect(payload).toHaveProperty('death_date_precision', null);
    expect(payload).not.toHaveProperty('death_date', undefined);
  });

  it('shows the ⋯ menu for an admin and opens edit', async () => {
    mockPage();
    renderPerson();
    fireEvent.click(await screen.findByRole('button', { name: copy['a11y.more'] }));
    fireEvent.click(await screen.findByRole('button', { name: copy['person.menu.edit'] }));
    expect(await screen.findByText('edit-page')).toBeTruthy();
  });

  it('shows the ⋯ menu when the viewer is an active admin of the person family', async () => {
    const personFamily = mockFamilies[1];
    const person = { ...mockPeople[0], family_id: personFamily.id };
    mockPage(person, [
      { ...mockMembers[0], family_id: mockFamilies[0].id, role: 'member' },
      {
        ...mockMembers[1],
        family_id: personFamily.id,
        role: 'admin',
        left_at: null,
        status: 'active',
      },
    ]);
    renderPerson(person.id);
    expect(await screen.findByRole('button', { name: copy['a11y.more'] })).toBeTruthy();
    expect(familyGraph.listMembers).toHaveBeenCalledWith(personFamily.id);
  });

  it('hides the ⋯ menu when the viewer is not an admin', async () => {
    mockPage(
      mockPeople[0],
      mockMembers.map((member) => ({ ...member, role: 'member' as const }))
    );
    renderPerson();
    expect(await screen.findByText('ยายสมศรี')).toBeTruthy();
    expect(screen.queryByRole('button', { name: copy['a11y.more'] })).toBeNull();
    expect(screen.queryByText(copy['person.menu.edit'])).toBeNull();
  });

  it('shows the invite button for an admin on a living uninvited person', async () => {
    mockPage({ ...mockPeople[1], invite_status: 'none', account_id: null });
    renderPerson(mockPeople[1].id);
    expect(
      await screen.findByRole('button', {
        name: interpolateHeading(copy['person.invite.action'], { name: mockPeople[1].display_name }),
      })
    ).toBeTruthy();
  });

  it('hides the invite button when the viewer is not an admin', async () => {
    mockPage(
      { ...mockPeople[1], invite_status: 'none', account_id: null },
      mockMembers.map((member) => ({ ...member, role: 'member' as const }))
    );
    renderPerson(mockPeople[1].id);
    expect(await screen.findByText(mockPeople[1].display_name)).toBeTruthy();
    expect(
      screen.queryByRole('button', {
        name: interpolateHeading(copy['person.invite.action'], { name: mockPeople[1].display_name }),
      })
    ).toBeNull();
  });

  it('does not offer delete for a linked member', async () => {
    mockPage(mockPeople[2]);
    renderPerson(mockPeople[2].id);
    fireEvent.click(await screen.findByRole('button', { name: copy['a11y.more'] }));
    expect(
      await screen.findByText(
        interpolateHeading(copy['person.delete.linked'], { ชื่อ: mockPeople[2].display_name })
      )
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: copy['person.delete.action'] })).toBeNull();
  });

  it('confirms delete with no spaces around the name and returns to family', async () => {
    mockPage();
    vi.mocked(familyGraph.deletePerson).mockResolvedValue(undefined);
    renderPerson();
    fireEvent.click(await screen.findByRole('button', { name: copy['a11y.more'] }));
    fireEvent.click(await screen.findByRole('button', { name: copy['person.delete.action'] }));
    expect(
      await screen.findByText(interpolateHeading(copy['person.delete.confirm.title'], { name: 'ยายสมศรี' }))
    ).toBeTruthy();
    expect(screen.getByText(interpolateHeading(copy['person.delete.confirm.body'], { name: 'ยายสมศรี' }))).toBeTruthy();
    expect(
      screen.getByText(interpolateHeading(copy['person.delete.confirm.memories'], { ชื่อ: 'ยายสมศรี' }))
    ).toBeTruthy();
    expect(interpolateHeading(copy['person.delete.confirm.title'], { name: 'ยายสมศรี' })).toBe(
      'ลบยายสมศรีออกจากผังไหม'
    );
    fireEvent.click(screen.getByRole('button', { name: copy['person.delete.confirm.primary'] }));
    await waitFor(() => expect(familyGraph.deletePerson).toHaveBeenCalledWith(mockPeople[0].id));
    expect(await screen.findByText('family-page')).toBeTruthy();
  });
});
