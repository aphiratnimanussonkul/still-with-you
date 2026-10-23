import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { copy } from '@/copy';
import { mockAccount, mockFamilies, mockPeople, mockRelationships } from '@/mocks/data';

vi.mock('@/lib/api-client', () => ({
  api: {
    listFamilies: vi.fn(),
    createFamily: vi.fn(),
  },
}));

vi.mock('@/lib/family-graph', async () => {
  const actual = await vi.importActual<typeof import('@/lib/family-graph')>('@/lib/family-graph');
  return {
    ...actual,
    familyGraph: {
      listPeople: vi.fn(),
      createPerson: vi.fn(),
      listMembers: vi.fn(),
      listInvites: vi.fn(),
      createInvite: vi.fn(),
    },
  };
});

vi.mock('@/hooks/use-me', () => ({
  useMe: () => ({
    data: { id: mockAccount.id, display_name: mockAccount.display_name },
  }),
}));

vi.mock('@/components/Illustration', () => ({
  Illustration: () => <div data-testid="illustration" />,
}));

import { api } from '@/lib/api-client';
import { familyGraph } from '@/lib/family-graph';
import { FamilyPage } from '@/pages/FamilyPage';

function renderPage(path = '/family') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/family" element={<FamilyPage />} />
          <Route path="/family/people/new" element={<div>add-form</div>} />
          <Route path="/family/people/:personId" element={<div>person-page</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('FamilyPage', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('shows the tree, Buddhist years, and only the add / back-to-me toolbar', async () => {
    vi.mocked(api.listFamilies).mockResolvedValue({ families: mockFamilies });
    vi.mocked(familyGraph.listPeople).mockResolvedValue({
      people: mockPeople,
      relationships: mockRelationships,
    });

    renderPage();
    expect(await screen.findByText('ยายสมศรี')).toBeTruthy();
    expect(screen.getByText('ปู่สมชาย')).toBeTruthy();
    expect(screen.getByText('2480–2565')).toBeTruthy();
    expect(screen.getByText('2478–')).toBeTruthy();
    expect(screen.getByRole('button', { name: copy['family.tab.graph'] })).toBeTruthy();
    expect(screen.getByRole('button', { name: copy['family.tab.list'] })).toBeTruthy();
    expect(screen.getByRole('link', { name: copy['person.add.action'] })).toBeTruthy();
    expect(screen.getByRole('button', { name: copy['tree.back_to_me'] })).toBeTruthy();
    expect(screen.queryByText(copy['family.focus.toggle'])).toBeNull();
    expect(screen.queryByText(copy['family.tab.members'])).toBeNull();
  });

  it('opens the node + menu and navigates a node tap to the person page', async () => {
    vi.mocked(api.listFamilies).mockResolvedValue({ families: mockFamilies });
    vi.mocked(familyGraph.listPeople).mockResolvedValue({
      people: mockPeople,
      relationships: mockRelationships,
    });

    renderPage();
    expect(await screen.findByText('ยายสมศรี')).toBeTruthy();
    fireEvent.click(screen.getByLabelText(copy['tree.node.add'].replace('{ชื่อ}', 'ยายสมศรี')));
    expect(screen.getByText(copy['tree.node.add_parent'])).toBeTruthy();
    expect(screen.getByText(copy['tree.node.add_child'])).toBeTruthy();
    expect(screen.getByText(copy['tree.node.add_spouse'])).toBeTruthy();
    fireEvent.click(screen.getByText('ยายสมศรี'));
    expect(await screen.findByText('person-page')).toBeTruthy();
  });

  it('remembers the list tab and sorts by generation', async () => {
    vi.mocked(api.listFamilies).mockResolvedValue({ families: mockFamilies });
    vi.mocked(familyGraph.listPeople).mockResolvedValue({
      people: mockPeople,
      relationships: mockRelationships,
    });

    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: copy['family.tab.list'] }));
    expect(sessionStorage.getItem('swy.family.tab')).toBe('list');
    const links = screen.getAllByRole('link').map((link) => link.textContent);
    expect(links.some((text) => text?.includes('ยายสมศรี'))).toBe(true);
    expect(links.some((text) => text?.includes('Atta'))).toBe(true);
  });

  it('shows the only-self card when the tree is just me', async () => {
    vi.mocked(api.listFamilies).mockResolvedValue({ families: mockFamilies });
    vi.mocked(familyGraph.listPeople).mockResolvedValue({
      people: [mockPeople[2]],
      relationships: [],
    });

    renderPage();
    expect(await screen.findByText(copy['tree.only_self.title'])).toBeTruthy();
    expect(screen.getByText(copy['tree.only_self.body'])).toBeTruthy();
    expect(screen.getByRole('link', { name: copy['person.add.action'] })).toBeTruthy();
    expect(screen.queryByRole('button', { name: copy['tree.back_to_me'] })).toBeNull();
  });

  it('keeps retry when the people list fails', async () => {
    vi.mocked(api.listFamilies).mockResolvedValue({ families: mockFamilies });
    vi.mocked(familyGraph.listPeople).mockRejectedValue(new Error('boom'));

    renderPage();
    expect(await screen.findByText(copy['error.generic'])).toBeTruthy();
    expect(screen.getByRole('button', { name: copy['family.focus.load_error.action'] })).toBeTruthy();
    await waitFor(() => expect(screen.queryByText('ยายสมศรี')).toBeNull());
  });
});
