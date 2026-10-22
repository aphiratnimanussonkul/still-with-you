import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { copy } from '@/copy';
import { mockFamilies, mockPeople } from '@/mocks/data';

vi.mock('@/lib/api-client', () => ({
  api: {
    listFamilies: vi.fn(),
    createFamily: vi.fn(),
  },
}));

vi.mock('@/lib/family-graph', () => ({
  familyGraph: {
    listPeople: vi.fn(),
    createPerson: vi.fn(),
    listMembers: vi.fn(),
    listInvites: vi.fn(),
    createInvite: vi.fn(),
  },
}));

vi.mock('@/lib/home-api', () => ({
  FOCUS_MAX: 10,
  homeApi: {
    getFocus: vi.fn(),
    putFocus: vi.fn(),
  },
}));

vi.mock('@/hooks/use-me', () => ({
  useMe: () => ({
    data: { id: '11111111-1111-4111-8111-111111111111', display_name: 'Atta' },
  }),
}));

vi.mock('@/components/Illustration', () => ({
  Illustration: () => <div data-testid="illustration" />,
}));

import { api } from '@/lib/api-client';
import { familyGraph } from '@/lib/family-graph';
import { homeApi } from '@/lib/home-api';
import { FamilyPage } from '@/pages/FamilyPage';

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <FamilyPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('FamilyPage', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('lets the signed-in account focus more than one person', async () => {
    vi.mocked(api.listFamilies).mockResolvedValue({ families: mockFamilies });
    vi.mocked(familyGraph.listPeople).mockResolvedValue({ people: mockPeople });
    vi.mocked(homeApi.getFocus).mockResolvedValue({ person_ids: [mockPeople[0].id] });
    vi.mocked(homeApi.putFocus).mockImplementation(async (_familyId, personIds) => ({
      person_ids: personIds,
    }));

    renderPage();
    expect(await screen.findByText('ยายสมศรี')).toBeTruthy();
    expect(screen.getByText('ปู่สมชาย')).toBeTruthy();

    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes[0].getAttribute('data-state')).toBe('checked');
    expect(checkboxes[1].getAttribute('data-state')).toBe('unchecked');

    fireEvent.click(screen.getAllByText(copy['family.focus.toggle'])[1]);
    await waitFor(() =>
      expect(homeApi.putFocus).toHaveBeenCalledWith(mockFamilies[0].id, [
        mockPeople[0].id,
        mockPeople[1].id,
      ])
    );
  });

  it('uses the focus toggle copy from the PO note', async () => {
    vi.mocked(api.listFamilies).mockResolvedValue({ families: mockFamilies });
    vi.mocked(familyGraph.listPeople).mockResolvedValue({ people: mockPeople });
    vi.mocked(homeApi.getFocus).mockResolvedValue({ person_ids: [] });

    renderPage();
    expect(await screen.findAllByText(copy['family.focus.toggle'])).toHaveLength(2);
    expect(screen.getAllByText(copy['family.focus.note']).length).toBeGreaterThan(0);
  });
});
