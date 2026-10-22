import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { copy, interpolate, interpolateHeading } from '@/copy';
import { formatThaiDate } from '@/lib/dates';
import { mockFamilies, mockPeople } from '@/mocks/data';

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
      getPerson: vi.fn(),
      updatePerson: vi.fn(),
    },
  };
});

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

function renderPerson(id = mockPeople[0].id) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/family/people/${id}`]}>
        <Routes>
          <Route path="/family/people/:personId" element={<PersonPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('PersonPage', () => {
  it('shows display name, พ.ศ. years, and age at death from the API', async () => {
    vi.mocked(api.listFamilies).mockResolvedValue({ families: mockFamilies });
    vi.mocked(familyGraph.listPeople).mockResolvedValue({ people: mockPeople, relationships: [] });
    vi.mocked(familyGraph.getPerson).mockResolvedValue(mockPeople[0]);
    vi.mocked(homeApi.getFocus).mockResolvedValue({ items: [] });
    vi.mocked(homeApi.listFacts).mockResolvedValue({ groups: [] });

    renderPerson();
    expect(await screen.findByText('ยายสมศรี')).toBeTruthy();
    expect(screen.getByText('2480–2565')).toBeTruthy();
    expect(screen.getByText(interpolate(copy['person.death.age'], { อายุ: '84' }))).toBeTruthy();
    expect(
      screen.getByText(interpolateHeading(copy['person.facts.empty.title'], { name: 'ยายสมศรี' }))
    ).toBeTruthy();
  });

  it('lets the signed-in account focus the person', async () => {
    vi.mocked(api.listFamilies).mockResolvedValue({ families: mockFamilies });
    vi.mocked(familyGraph.listPeople).mockResolvedValue({ people: mockPeople, relationships: [] });
    vi.mocked(familyGraph.getPerson).mockResolvedValue(mockPeople[1]);
    vi.mocked(homeApi.getFocus).mockResolvedValue({ items: [] });
    vi.mocked(homeApi.listFacts).mockResolvedValue({ groups: [] });
    vi.mocked(homeApi.putFocus).mockResolvedValue({ items: [] });

    renderPerson(mockPeople[1].id);
    fireEvent.click(await screen.findByText(copy['family.focus.toggle']));
    await waitFor(() =>
      expect(homeApi.putFocus).toHaveBeenCalledWith(mockFamilies[0].id, [mockPeople[1].id])
    );
  });

  it('shows answer meta on facts', async () => {
    vi.mocked(api.listFamilies).mockResolvedValue({ families: mockFamilies });
    vi.mocked(familyGraph.listPeople).mockResolvedValue({ people: mockPeople, relationships: [] });
    vi.mocked(familyGraph.getPerson).mockResolvedValue(mockPeople[0]);
    vi.mocked(homeApi.getFocus).mockResolvedValue({ items: [] });
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
    vi.mocked(api.listFamilies).mockResolvedValue({ families: mockFamilies });
    vi.mocked(familyGraph.listPeople).mockResolvedValue({ people: mockPeople, relationships: [] });
    vi.mocked(familyGraph.getPerson).mockResolvedValue(mockPeople[0]);
    vi.mocked(familyGraph.updatePerson).mockResolvedValue({
      ...mockPeople[0],
      is_living: true,
      death_date: null,
      death_date_precision: null,
    });
    vi.mocked(homeApi.getFocus).mockResolvedValue({ items: [] });
    vi.mocked(homeApi.listFacts).mockResolvedValue({ groups: [] });

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
